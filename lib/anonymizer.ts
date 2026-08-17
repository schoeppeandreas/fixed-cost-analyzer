import type { Transaction } from './types'

/**
 * Anonymisierung beim Import.
 *
 * Die Umsätze werden direkt nach dem Parsen bereinigt – BEVOR sie in den
 * State oder nach IndexedDB gelangen. Damit enthält der gespeicherte
 * Datenbestand keine IBAN, keinen Kontoinhaber-Namen und keine
 * Vertragsnummern mehr.
 *
 * Wichtig für die Auswertung: sensible Werte werden nicht einfach gelöscht,
 * sondern durch STABILE Pseudonyme ersetzt. Dieselbe Vertragsnummer wird
 * immer zum selben Platzhalter. Dadurch bleibt die Serienerkennung intakt
 * (zwei Darlehen derselben Bank bleiben getrennt), ohne dass der echte Wert
 * noch vorhanden ist.
 *
 * Die Pseudonyme sind fortlaufend nummeriert (VERTRAG-01, IBAN-02, ...) und
 * werden NICHT aus dem Originalwert berechnet. Es gibt also keinen Hash, der
 * sich per Wörterbuch- oder Brute-Force-Angriff zurückrechnen ließe, und die
 * Zuordnungstabelle wird nach dem Import verworfen.
 */

export type DateFieldOption = 'booking' | 'valuta' | 'auto'

export type AnonymizeOptions = {
  /** Anonymisierung aktiv (Standard: an) */
  enabled: boolean
  /** Eigene Namen, die aus Empfänger und Verwendungszweck entfernt werden */
  names: string[]
  /** IBAN und BIC ersetzen */
  redactIban: boolean
  /** Vertrags-, Kunden- und Kartennummern ersetzen */
  redactNumbers: boolean
  /** E-Mail-Adressen und Telefonnummern ersetzen */
  redactContact: boolean
  /** Welches Datumsfeld für Analyse verwenden */
  useDateField: DateFieldOption
}

export const DEFAULT_ANONYMIZE_OPTIONS: AnonymizeOptions = {
  enabled: true,
  names: [],
  redactIban: true,
  redactNumbers: true,
  redactContact: true,
  useDateField: 'valuta', // Valutadatum bevorzugen
}

export type RedactionStats = {
  iban: number
  bic: number
  contractNumber: number
  cardNumber: number
  email: number
  phone: number
  name: number
}

export function emptyStats(): RedactionStats {
  return { iban: 0, bic: 0, contractNumber: 0, cardNumber: 0, email: 0, phone: 0, name: 0 }
}

/**
 * Vergibt fortlaufende Pseudonyme pro Kategorie und merkt sich die Zuordnung
 * nur für die Dauer eines Imports. Gleicher Originalwert ⇒ gleiches Pseudonym.
 */
class PseudonymRegistry {
  private map = new Map<string, string>()
  private counters = new Map<string, number>()

  get(kind: string, raw: string): string {
    const normalized = raw.replace(/[\s-]/g, '').toUpperCase()
    const cacheKey = `${kind}:${normalized}`
    const existing = this.map.get(cacheKey)
    if (existing) return existing

    const next = (this.counters.get(kind) ?? 0) + 1
    this.counters.set(kind, next)
    const token = `${kind}-${String(next).padStart(2, '0')}`
    this.map.set(cacheKey, token)
    return token
  }

  /** Anzahl unterschiedlicher Werte je Kategorie. */
  distinct(kind: string): number {
    return this.counters.get(kind) ?? 0
  }
}

/**
 * Länderkennungen zur Absicherung der BIC-Erkennung. Ein BIC hat die Form
 * BBBBCCLL(XXX) – ohne Prüfung des Länder-Segments würden normale
 * Großbuchstaben-Wörter im Verwendungszweck fälschlich ersetzt.
 */
const BIC_COUNTRIES =
  'DE|AT|CH|FR|NL|LU|GB|US|IT|ES|BE|PL|CZ|DK|SE|NO|FI|IE|PT|HU|SK|SI|HR|RO|BG|GR|LI|EE|LV|LT'

const PATTERNS = {
  // IBAN mit und ohne Gruppentrennung (DE12 3456 ... )
  ibanSpaced: /\b[A-Z]{2}\d{2}(?:[ ][A-Z0-9]{2,4}){2,8}\b/g,
  iban: /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g,
  /**
   * BIC nur mit ausdrücklicher Kennzeichnung. Die rein strukturelle Erkennung
   * (4 Buchstaben + Ländercode + 2 Zeichen) trifft sonst normale deutsche
   * Wörter: "SPARPLAN" enthält SPAR+PL+AN, "JAHRESPREIS" enthält JAHR+ES+PR.
   */
  bicLabeled:
    /\b(BIC|SWIFT(?:-?CODE)?)\b[\s.:=-]*([A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?)\b/gi,
  /**
   * Unbeschrifteter BIC. Zwei Varianten sind zulässig, damit normale deutsche
   * Wörter nicht getroffen werden:
   *  a) der Code enthält eine Ziffer (GENODEF1S02, MALADE51MAN)
   *  b) der Code ist die 11-stellige Form mit XXX-Filiale (COBADEFFXXX,
   *     INGDDEFFXXX) – ziffernlos, aber durch das XXX eindeutig
   * "SPARPLAN" und "JAHRESPREIS" erfüllen keine der beiden Bedingungen.
   */
  bicStrict: new RegExp(
    `\\b(?:(?=[A-Z0-9]*\\d)|(?=[A-Z]{8}XXX\\b))[A-Z]{4}(?:${BIC_COUNTRIES})[A-Z0-9]{2}(?:[A-Z0-9]{3})?\\b`,
    'g',
  ),
  // Maskierte Kartennummern wie 1234XXXXXXXX5678
  cardMasked: /\b\d{4}[ ]?[X*x]{4,12}[ ]?\d{2,4}\b/g,
  // Vollständige Kartennummern
  cardFull: /\b\d{13,19}\b/g,
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  /**
   * Telefonnummern im internationalen Format. Die Ländervorwahl gehört zum
   * Treffer, sonst bliebe "+49" im Text stehen.
   */
  phoneIntl: /\+\d{1,3}[ /-]?\d(?:[\d /-]{4,}\d)?/g,
  /**
   * Telefonnummern nur mit Kennzeichnung. Ohne Label würde das Muster
   * Bestell- und Rechnungsnummern verschlucken ("302-4471209-8834",
   * "2024-4471") – die gehören zur Kategorie Vertragsnummer.
   */
  phoneLabeled: /\b(tel|telefon|mobil|handy|fon)\b[\s.:=-]*(\d(?:[\d /-]{5,})\d)/gi,
  // Vertrags-, Kunden-, Mandats- und Referenznummern
  longNumber: /\b\d{6,12}\b/g,
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Baut Suchmuster für die eigenen Namen. Neben dem vollen Namen werden auch
 * die Reihenfolge-Varianten ("Mustermann, Max") und einzelne Namensteile ab
 * 3 Zeichen berücksichtigt, weil Banken den Namen unterschiedlich schreiben.
 */
function buildNamePatterns(names: string[]): RegExp[] {
  const fragments = new Set<string>()

  for (const entry of names) {
    const clean = entry.trim()
    if (clean.length < 3) continue
    fragments.add(clean)
    for (const part of clean.split(/[\s,]+/)) {
      if (part.length >= 3) fragments.add(part)
    }
  }

  // Längere Fragmente zuerst, damit "Max Mustermann" vor "Max" greift
  return [...fragments]
    .sort((a, b) => b.length - a.length)
    .map((fragment) => new RegExp(`\\b${escapeRegex(fragment)}\\b`, 'gi'))
}

type RedactContext = {
  registry: PseudonymRegistry
  stats: RedactionStats
  namePatterns: RegExp[]
  options: AnonymizeOptions
}

/**
 * Bereinigt einen einzelnen Textwert. Die Reihenfolge ist bewusst gewählt:
 * IBAN vor langen Zahlen (sonst zerlegt die Zahlenregel die IBAN), und
 * Kartennummern vor der generischen Nummernregel.
 */
function redactValue(value: string, ctx: RedactContext): string {
  if (!value) return value
  let out = value
  const { registry, stats, options } = ctx

  if (options.redactIban) {
    out = out.replace(PATTERNS.ibanSpaced, (match) => {
      stats.iban++
      return registry.get('IBAN', match)
    })
    out = out.replace(PATTERNS.iban, (match) => {
      stats.iban++
      return registry.get('IBAN', match)
    })
    // Erst der beschriftete BIC ("BIC: GENODEF1S02"), dabei bleibt das
    // Label stehen und nur der Wert wird ersetzt.
    out = out.replace(PATTERNS.bicLabeled, (_match, label: string, code: string) => {
      stats.bic++
      return `${label} ${registry.get('BIC', code)}`
    })
    out = out.replace(PATTERNS.bicStrict, (match) => {
      stats.bic++
      return registry.get('BIC', match)
    })
  }

  if (options.redactContact) {
    out = out.replace(PATTERNS.email, (match) => {
      stats.email++
      return registry.get('EMAIL', match)
    })
  }

  if (options.redactNumbers) {
    out = out.replace(PATTERNS.cardMasked, (match) => {
      stats.cardNumber++
      return registry.get('KARTE', match)
    })
    out = out.replace(PATTERNS.cardFull, (match) => {
      stats.cardNumber++
      return registry.get('KARTE', match)
    })
  }

  if (options.redactContact) {
    out = out.replace(PATTERNS.phoneLabeled, (match, label: string, number: string) => {
      if (number.replace(/\D/g, '').length < 7) return match
      stats.phone++
      return `${label} ${registry.get('TEL', number)}`
    })
    out = out.replace(PATTERNS.phoneIntl, (match) => {
      // Sehr kurze Treffer sind meist Datums- oder Betragsfragmente
      if (match.replace(/\D/g, '').length < 7) return match
      stats.phone++
      return registry.get('TEL', match)
    })
  }

  if (options.redactNumbers) {
    out = out.replace(PATTERNS.longNumber, (match) => {
      stats.contractNumber++
      return registry.get('VERTRAG', match)
    })
  }

  for (const pattern of ctx.namePatterns) {
    out = out.replace(pattern, () => {
      stats.name++
      return '[KONTOINHABER]'
    })
  }

  return out.replace(/\s{2,}/g, ' ').trim()
}

export type AnonymizeResult = {
  transactions: Transaction[]
  stats: RedactionStats
  /** Anzahl unterschiedlicher pseudonymisierter Werte je Kategorie */
  distinct: { iban: number; contractNumber: number; cardNumber: number }
  /** Beispielhafte Vorher/Nachher-Paare für die Vorschau */
  samples: { before: string; after: string }[]
}

/**
 * Anonymisiert alle Buchungen. Beträge, Daten und Empfängernamen bleiben
 * erhalten – nur identifizierende Kennungen werden pseudonymisiert, damit
 * die Fixkosten-Analyse ihre Aussagekraft behält.
 */
export function anonymizeTransactions(
  transactions: Transaction[],
  options: AnonymizeOptions,
): AnonymizeResult {
  const stats = emptyStats()

  if (!options.enabled) {
    return {
      transactions,
      stats,
      distinct: { iban: 0, contractNumber: 0, cardNumber: 0 },
      samples: [],
    }
  }

  const ctx: RedactContext = {
    registry: new PseudonymRegistry(),
    stats,
    namePatterns: buildNamePatterns(options.names),
    options,
  }

  const samples: { before: string; after: string }[] = []

  const cleaned = transactions.map((tx) => {
    const counterparty = redactValue(tx.counterparty, ctx)
    const purpose = redactValue(tx.purpose, ctx)

    if (samples.length < 4 && purpose !== tx.purpose && tx.purpose.length > 12) {
      samples.push({ before: tx.purpose, after: purpose })
    }

    return {
      ...tx,
      counterparty,
      purpose,
      bookingText: redactValue(tx.bookingText, ctx),
    }
  })

  return {
    transactions: cleaned,
    stats,
    distinct: {
      iban: ctx.registry.distinct('IBAN'),
      contractNumber: ctx.registry.distinct('VERTRAG'),
      cardNumber: ctx.registry.distinct('KARTE'),
    },
    samples,
  }
}

/** Gesamtzahl aller Ersetzungen. */
export function totalRedactions(stats: RedactionStats): number {
  return Object.values(stats).reduce((sum, value) => sum + value, 0)
}
