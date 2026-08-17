import type { ParseResult, ParseWarning, Transaction } from './types'

/**
 * Robuster CSV-Parser für deutsche Bank-Exporte (Sparkasse / Volksbank CAMT,
 * DKB, ING, comdirect). Läuft vollständig im Browser.
 */

/** Zeichen-Erkennung: viele Sparkassen exportieren noch Windows-1252. */
export async function readFileWithEncoding(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)

  // UTF-8 BOM
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3))
  }

  // Strict UTF-8 versuchen. Schlägt das fehl, ist es sehr wahrscheinlich Windows-1252.
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}

/** Ermittelt das Trennzeichen anhand der Häufigkeit außerhalb von Anführungszeichen. */
function detectDelimiter(text: string): string {
  const candidates = [';', ',', '\t', '|']
  const sample = text.split(/\r?\n/).slice(0, 15).join('\n')
  let best = ';'
  let bestCount = -1

  for (const candidate of candidates) {
    let count = 0
    let inQuotes = false
    for (let i = 0; i < sample.length; i++) {
      const char = sample[i]
      if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === candidate && !inQuotes) {
        count++
      }
    }
    if (count > bestCount) {
      bestCount = count
      best = candidate
    }
  }
  return best
}

/** Vollwertiger CSV-Reader: respektiert Anführungszeichen und Zeilenumbrüche in Feldern. */
function parseCsvRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0

  while (i < text.length) {
    const char = text[i]

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      field += char
      i++
      continue
    }

    if (char === '"') {
      inQuotes = true
      i++
      continue
    }

    if (char === delimiter) {
      row.push(field)
      field = ''
      i++
      continue
    }

    if (char === '\r') {
      i++
      continue
    }

    if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i++
      continue
    }

    field += char
    i++
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows
}

function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .replace(/^\ufeff/, '')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]/g, '')
    .trim()
}

/**
 * Spalten-Aliase. Die Reihenfolge ist wichtig: spezifischere Treffer zuerst,
 * damit z. B. "Valutadatum" nicht als Buchungstag erkannt wird.
 */
const COLUMN_ALIASES: Record<string, string[]> = {
  date: [
    'buchungstag',
    'buchungsdatum',
    'buchung',
    'datum',
    'belegdatum',
    'bookingdate',
    'date',
    'completeddate',
  ],
  valuta: ['valutadatum', 'valuta', 'wertstellung', 'wertstellungstag', 'valuedate'],
  counterparty: [
    'beguenstigterzahlungspflichtiger',
    'zahlungsbeteiligter',
    'zahlungspflichtigerzahlungsempfaenger',
    'auftraggeberempfaenger',
    'auftraggeberbeguenstigter',
    'empfaengerauftraggeber',
    'namezahlungsbeteiligter',
    'beguenstigter',
    'empfaenger',
    'auftraggeber',
    'zahlungsempfaenger',
    'partnername',
    'payee',
    'recipient',
  ],
  purpose: [
    'verwendungszweck',
    'buchungsinformationen',
    'beschreibung',
    'referenz',
    'description',
    'reference',
  ],
  bookingText: ['buchungstext', 'vorgang', 'umsatzart', 'transaktionstyp', 'type', 'buchungsart'],
  amount: [
    'betrag',
    'betrageur',
    'umsatzineur',
    'betragineur',
    'soll',
    'habensoll',
    'amount',
    'amounteur',
    'value',
  ],
  currency: ['waehrung', 'currency', 'waehrungbetrag'],
}

function findColumnIndices(header: string[]): {
  indices: Record<string, number>
  detected: Record<string, string>
} {
  const normalized = header.map(normalizeHeader)
  const indices: Record<string, number> = {}
  const detected: Record<string, string> = {}

  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    for (const alias of aliases) {
      // Exakter Treffer bevorzugt
      let idx = normalized.indexOf(alias)
      if (idx === -1) {
        // Teilstring-Treffer als Fallback, aber nur wenn die Spalte noch frei ist
        idx = normalized.findIndex((h) => h.includes(alias) && h.length < alias.length + 14)
      }
      if (idx !== -1 && !Object.values(indices).includes(idx)) {
        indices[field] = idx
        detected[field] = header[idx].trim()
        break
      }
    }
  }

  return { indices, detected }
}

/**
 * Deutsche Beträge: "1.234,56", "-1.234,56", "1234,56 S", "123,45 H".
 * Englische Beträge: "1,234.56", "-1234.56".
 */
export function parseGermanAmount(raw: string): number | null {
  if (!raw) return null
  let value = raw.trim()
  if (!value) return null

  // Soll/Haben-Kennzeichen am Ende (manche Exporte nutzen das statt Vorzeichen)
  let sign = 1
  const shMatch = value.match(/\s*([SH])$/i)
  if (shMatch) {
    sign = shMatch[1].toUpperCase() === 'S' ? -1 : 1
    value = value.replace(/\s*[SH]$/i, '').trim()
  }

  // Währungssymbole und Leerzeichen entfernen
  value = value.replace(/[€$£\s\u00a0]/g, '')

  // Klammern = negativ (selten, aber vorkommend)
  if (/^\(.*\)$/.test(value)) {
    sign *= -1
    value = value.slice(1, -1)
  }

  if (value.startsWith('+')) {
    value = value.slice(1)
  } else if (value.startsWith('-')) {
    sign *= -1
    value = value.slice(1)
  }

  const lastComma = value.lastIndexOf(',')
  const lastDot = value.lastIndexOf('.')

  if (lastComma > -1 && lastDot > -1) {
    // Beide vorhanden: das hintere Zeichen ist das Dezimaltrennzeichen
    if (lastComma > lastDot) {
      value = value.replace(/\./g, '').replace(',', '.')
    } else {
      value = value.replace(/,/g, '')
    }
  } else if (lastComma > -1) {
    // Nur Komma. Bei genau 3 Nachkommastellen ist es ein Tausendertrenner (z. B. "1,234")
    const decimals = value.length - lastComma - 1
    if (decimals === 3 && value.replace(/,/g, '').length > 3) {
      value = value.replace(/,/g, '')
    } else {
      value = value.replace(',', '.')
    }
  } else if (lastDot > -1) {
    const decimals = value.length - lastDot - 1
    if (decimals === 3) {
      value = value.replace(/\./g, '')
    }
  }

  const parsed = Number.parseFloat(value)
  if (!Number.isFinite(parsed)) return null
  return sign * parsed
}

/** Deutsche Datumsformate: TT.MM.JJJJ, TT.MM.JJ, sowie ISO YYYY-MM-DD. */
export function parseGermanDate(raw: string): string | null {
  if (!raw) return null
  const value = raw.trim()
  if (!value) return null

  // ISO
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) {
    return `${iso[1]}-${iso[2]}-${iso[3]}`
  }

  // TT.MM.JJJJ oder TT.MM.JJ (auch mit / oder - als Trenner)
  const de = value.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/)
  if (de) {
    const day = Number.parseInt(de[1], 10)
    const month = Number.parseInt(de[2], 10)
    let year = Number.parseInt(de[3], 10)
    if (year < 100) {
      // 2-stellige Jahre: 70-99 -> 19xx, 00-69 -> 20xx
      year = year >= 70 ? 1900 + year : 2000 + year
    }
    if (month < 1 || month > 12 || day < 1 || day > 31) return null
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${year}-${pad(month)}-${pad(day)}`
  }

  return null
}

/**
 * Findet die Header-Zeile. Sparkassen-Exporte haben teilweise Vorlauf-Zeilen
 * (Kontoinformationen) vor dem eigentlichen Header.
 */
function findHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const normalized = rows[i].map(normalizeHeader)
    const hasDate = COLUMN_ALIASES.date.some((a) => normalized.some((h) => h.includes(a)))
    const hasAmount = COLUMN_ALIASES.amount.some((a) => normalized.some((h) => h.includes(a)))
    if (hasDate && hasAmount && rows[i].length >= 3) {
      return i
    }
  }
  return -1
}

export function parseBankCsv(text: string): ParseResult {
  const warnings: ParseWarning[] = []
  const delimiter = detectDelimiter(text)
  const rows = parseCsvRows(text, delimiter).filter((r) => r.some((c) => c.trim() !== ''))

  if (rows.length === 0) {
    return {
      transactions: [],
      warnings: [{ row: 0, message: 'Die Datei enthält keine Daten.' }],
      detectedColumns: {},
      totalRows: 0,
      skippedRows: 0,
      delimiter,
    }
  }

  const headerRowIndex = findHeaderRow(rows)
  if (headerRowIndex === -1) {
    return {
      transactions: [],
      warnings: [
        {
          row: 0,
          message:
            'Es konnte keine Kopfzeile mit Buchungstag und Betrag gefunden werden. Bitte prüfe, ob es ein Umsatz-Export ist.',
        },
      ],
      detectedColumns: {},
      totalRows: rows.length,
      skippedRows: rows.length,
      delimiter,
    }
  }

  const header = rows[headerRowIndex]
  const { indices, detected } = findColumnIndices(header)

  if (indices.date === undefined || indices.amount === undefined) {
    return {
      transactions: [],
      warnings: [
        {
          row: headerRowIndex + 1,
          message: 'Spalten für Datum oder Betrag konnten nicht zugeordnet werden.',
        },
      ],
      detectedColumns: detected,
      totalRows: rows.length,
      skippedRows: rows.length,
      delimiter,
    }
  }

  const transactions: Transaction[] = []
  let skipped = 0

  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i]
    const cell = (idx: number | undefined) =>
      idx === undefined || idx >= row.length ? '' : (row[idx] ?? '').trim()

    const rawDate = cell(indices.date)
    const rawAmount = cell(indices.amount)

    // Leere oder Summen-Zeilen am Ende überspringen
    if (!rawDate && !rawAmount) {
      skipped++
      continue
    }

    const date = parseGermanDate(rawDate)
    const amount = parseGermanAmount(rawAmount)

    if (date === null || amount === null) {
      skipped++
      if (warnings.length < 12) {
        warnings.push({
          row: i + 1,
          message: `Zeile übersprungen (Datum: "${rawDate || '—'}", Betrag: "${rawAmount || '—'}")`,
        })
      }
      continue
    }

    if (amount === 0) {
      skipped++
      continue
    }

    transactions.push({
      id: `tx-${i}-${date}-${Math.round(amount * 100)}`,
      date,
      valuta: indices.valuta !== undefined ? (parseGermanDate(cell(indices.valuta)) ?? undefined) : undefined,
      counterparty: cell(indices.counterparty),
      purpose: cell(indices.purpose),
      bookingText: cell(indices.bookingText),
      amount,
      currency: cell(indices.currency) || 'EUR',
    })
  }

  transactions.sort((a, b) => a.date.localeCompare(b.date))

  if (transactions.length === 0 && warnings.length === 0) {
    warnings.push({ row: 0, message: 'Keine gültigen Buchungen gefunden.' })
  }

  return {
    transactions,
    warnings,
    detectedColumns: detected,
    totalRows: rows.length - headerRowIndex - 1,
    skippedRows: skipped,
    delimiter,
  }
}
