import { categorize, looksRecurringByBookingText } from './categories'
import type {
  AmountOutlier,
  AmountReviewReason,
  Category,
  ForecastEntry,
  ForecastMonth,
  IntervalKind,
  Series,
  SeriesStatus,
  Transaction,
  UserOverrides,
} from './types'

const DAY_MS = 86_400_000

export function toDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

export function toIso(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function daysBetween(aIso: string, bIso: string): number {
  return Math.round((toDate(bIso).getTime() - toDate(aIso).getTime()) / DAY_MS)
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/**
 * Normalisiert den Empfängernamen zu einem stabilen Gruppierungsschlüssel.
 * Entfernt Referenznummern, Datumsangaben, Rechtsformen und Mandatsreferenzen,
 * die zwischen den Buchungen desselben Vertrags variieren.
 */
/**
 * Platzhalter, die die Anonymisierung einsetzt. Sie dürfen den Serienschlüssel
 * und das Label nicht verwässern: "REWE IBAN-03" und "REWE IBAN-07" sind
 * derselbe Empfänger und müssen zusammenfallen.
 */
const PSEUDONYM_TOKEN = /\b(?:IBAN|BIC|VERTRAG|KARTE|TEL|EMAIL)-\d+\b|\[KONTOINHABER\]/gi

/** Vertragsnummer-Pseudonym, das als Diskriminator dient. */
const CONTRACT_TOKEN = /\bVERTRAG-(\d+)\b/i

export function normalizeCounterparty(counterparty: string, purpose: string): string {
  let base = counterparty.trim()

  // Fällt der Empfänger weg (manche Exporte), nutze den Anfang des Verwendungszwecks
  if (base.length < 3) {
    base = purpose.trim().slice(0, 40)
  }

  let key = base
    // Anonymisierungs-Platzhalter entfernen, damit sie nicht als
    // unterscheidendes Merkmal wirken
    .replace(PSEUDONYM_TOKEN, ' ')
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    // Rechtsformen entfernen
    .replace(
      /\b(gmbh & co\.? kg|gmbh und co\.? kg|gmbh|ag|kg|ohg|e\.? ?k\.?|ug|se|mbh|co\.? kg|e\.? ?v\.?|inc|ltd|llc|b\.?v\.?|s\.?a\.?r\.?l\.?)\b/g,
      ' ',
    )
    // Datumsangaben
    .replace(/\b\d{1,2}[.\/]\d{1,2}[.\/]\d{2,4}\b/g, ' ')
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ')
    // Monat/Jahr-Kombinationen wie "10/2024" oder "2024-10"
    .replace(/\b\d{1,2}\/\d{4}\b/g, ' ')
    // IBANs und lange Nummernfolgen (Referenzen, Kundennummern)
    .replace(/\b[a-z]{2}\d{2}[a-z0-9]{10,30}\b/g, ' ')
    .replace(/\b\d{5,}\b/g, ' ')
    // Kartennummern-Fragmente
    .replace(/\b\d{4}x{4,}\d{4}\b/g, ' ')
    // Sonderzeichen
    .replace(/[^a-z0-9\s&+.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  // Auf die ersten aussagekräftigen Tokens reduzieren, damit Filialangaben
  // ("REWE Markt Musterstadt Filiale 4711") zusammenfallen.
  const tokens = key.split(' ').filter((t) => t.length > 1)
  key = tokens.slice(0, 4).join(' ')

  return key || base.toLowerCase().slice(0, 30)
}

/**
 * Begriffe, die einen eigenständigen Vertrag desselben Empfängers markieren.
 * Banken buchen Darlehen, Kontoführung und Zinsen unter identischem Namen –
 * ohne diese Unterscheidung würden sie zu einer Serie verschmelzen und der
 * Median-Betrag wäre unbrauchbar.
 */
const CONTRACT_MARKERS: { pattern: RegExp; tag: string; label: string }[] = [
  { pattern: /\b(kfz-steuer|kfzsteuer|kraftfahrzeugsteuer)\b/, tag: 'kfzsteuer', label: 'KFZ-Steuer' },
  { pattern: /\b(darlehen|annuitaet|annuität|tilgung)\b/, tag: 'darlehen', label: 'Darlehen' },
  { pattern: /\b(ratenkredit|ratenzahlung)\b/, tag: 'ratenkredit', label: 'Ratenkredit' },
  {
    pattern: /\b(entgeltabschluss|kontofuehrung|kontoführung|jahrespreis)\b/,
    tag: 'entgelt',
    label: 'Kontoentgelt',
  },
  {
    pattern: /\b(abschluss ?zinsen|sollzinsen|habenzinsen)\b/,
    tag: 'zinsen',
    label: 'Zinsen',
  },
  { pattern: /\b(bausparen|bausparvertrag)\b/, tag: 'bauspar', label: 'Bausparen' },
  { pattern: /\b(depot|wertpapier)\b/, tag: 'depot', label: 'Depot' },
  { pattern: /\b(kreditkarte|kartenabrechnung)\b/, tag: 'kreditkarte', label: 'Kreditkarte' },
]

/** Findet den Vertrags-Marker eines Verwendungszwecks, falls vorhanden. */
function findContractMarker(purpose: string) {
  const lower = purpose.toLowerCase()
  return CONTRACT_MARKERS.find((entry) => entry.pattern.test(lower))
}

/**
 * Erkennt, ob der Verwendungszweck auf einen abgrenzbaren Vertrag hindeutet.
 * Zusätzlich wird eine Vertrags-/Darlehensnummer als Diskriminator genutzt,
 * damit zwei Kredite derselben Bank getrennt bleiben.
 */
function contractDiscriminator(purpose: string): string {
  const marker = findContractMarker(purpose)
  if (!marker) return ''

  // Für KFZ-Steuern: Fahrzeug-Kennzeichen extrahieren, damit
  // "Kfz-Steuer fuer KYF AD 2" und "Kfz-Steuer fuer KYF JL 106" als separate Serien erkannt werden.
  // Pattern: Deutsches Kennzeichen wie "KYF AD 2" (Ortscode Raum Kennzeichenzahl).
  if (purpose.toLowerCase().includes('kfz-steuer')) {
    const kfzMatch = purpose.match(/\b([A-Z]{2,3})\s+([A-Z]{1,2})\s+(\d+)\b/)
    if (kfzMatch) {
      // Nutze nicht nur die Stadt (match[1]), sondern das komplette Kennzeichen: "KYF-AD-2"
      return `kfz#${kfzMatch[1]}-${kfzMatch[2]}-${kfzMatch[3]}`
    }
  }

  // Vertragsnummer als zusätzliche Unterscheidung, damit
  // "DARLEHEN 6641772003" und "DARLEHEN 7788990011" nicht verschmelzen.
  // Nach der Anonymisierung steht dort "VERTRAG-01" – das Pseudonym ist
  // stabil und erfüllt denselben Zweck, ohne die echte Nummer zu enthalten.
  const contractNumber =
    purpose.match(CONTRACT_TOKEN)?.[1] ?? purpose.match(/\b\d{6,}\b/)?.[0] ?? ''
  return contractNumber ? `${marker.tag}#${contractNumber}` : marker.tag
}

/** Lesbares Label: Original-Schreibweise, aber ohne Referenz-Ballast. */
function buildLabel(counterparty: string, purpose: string): string {
  let label = counterparty.trim()
  if (label.length < 3) {
    label = purpose.trim()
  }
  label = label
    .replace(PSEUDONYM_TOKEN, '')
    .replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g, '')
    .replace(/\b\d{6,}\b/g, '')
    // Entferne überflüssige Hinweise
    .replace(/\s*siehe\s+anlage\s*$/i, '')
    .replace(/\s*s\.\s*o\.\s*$/i, '')
    .replace(/\s*siehe\s+oben\s*$/i, '')
    .replace(/\s*wie\s+oben\s*$/i, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s·,-]+|[\s·,-]+$/g, '')
    .trim()

  if (label.length > 48) {
    label = `${label.slice(0, 47).trimEnd()}…`
  }
  label = label || 'Unbekannt'

  // Vertragsart anhängen, damit getrennte Serien derselben Bank
  // ("Sparkasse · Darlehen" vs. "Sparkasse · Kontoentgelt") unterscheidbar sind.
  const marker = findContractMarker(purpose)
  if (marker && !label.toLowerCase().includes(marker.tag)) {
    label = `${label} · ${marker.label}`
  }

  return label
}

const INTERVAL_DEFINITIONS: { kind: IntervalKind; days: number; tolerance: number }[] = [
  { kind: 'weekly', days: 7, tolerance: 2 },
  { kind: 'monthly', days: 30.4, tolerance: 8 },
  { kind: 'bimonthly', days: 60.9, tolerance: 12 },
  { kind: 'quarterly', days: 91.3, tolerance: 16 },
  { kind: 'semiannual', days: 182.6, tolerance: 26 },
  { kind: 'annual', days: 365.25, tolerance: 40 },
]

export const INTERVAL_LABELS: Record<IntervalKind, string> = {
  weekly: 'wöchentlich',
  monthly: 'monatlich',
  bimonthly: 'zweimonatlich',
  quarterly: 'quartalsweise',
  semiannual: 'halbjährlich',
  annual: 'jährlich',
  irregular: 'unregelmäßig',
}

export const INTERVAL_MONTHS: Record<IntervalKind, number> = {
  weekly: 0.25,
  monthly: 1,
  bimonthly: 2,
  quarterly: 3,
  semiannual: 6,
  annual: 12,
  irregular: 0,
}

/**
 * Klassifiziert das Intervall anhand der Median-Lücke und prüft, wie viele
 * Lücken tatsächlich in die Toleranz fallen. Das verhindert, dass zufällig
 * verteilte Supermarkt-Einkäufe als "monatlich" gelten.
 */
function classifyInterval(gaps: number[]): {
  interval: IntervalKind
  confidence: number
  medianGap: number | null
} {
  if (gaps.length === 0) {
    return { interval: 'irregular', confidence: 0, medianGap: null }
  }

  const medianGap = median(gaps)

  let best: { kind: IntervalKind; hitRatio: number; deviation: number } | null = null

  for (const def of INTERVAL_DEFINITIONS) {
    if (Math.abs(medianGap - def.days) > def.tolerance) continue
    const hits = gaps.filter((g) => Math.abs(g - def.days) <= def.tolerance).length
    const hitRatio = hits / gaps.length
    const deviation = Math.abs(medianGap - def.days) / def.days
    if (!best || hitRatio > best.hitRatio) {
      best = { kind: def.kind, hitRatio, deviation }
    }
  }

  if (!best || best.hitRatio < 0.5) {
    return { interval: 'irregular', confidence: 0, medianGap }
  }

  // Konfidenz: Trefferquote gewichtet mit Anzahl der Belege und Genauigkeit
  const sampleBonus = Math.min(gaps.length / 6, 1)
  const confidence = Math.min(
    best.hitRatio * 0.65 + sampleBonus * 0.25 + (1 - Math.min(best.deviation, 1)) * 0.1,
    1,
  )

  return { interval: best.kind, confidence, medianGap }
}

/** Ermittelt, ob eine Serie noch aktiv ist. */
function determineStatus(
  interval: IntervalKind,
  daysSinceLast: number,
  occurrences: number,
): SeriesStatus {
  if (occurrences < 2 || interval === 'irregular') {
    // Einmalzahlungen und unregelmäßige Posten
    return occurrences < 2 ? 'onetime' : daysSinceLast > 200 ? 'ended' : 'active'
  }

  const expectedGap = INTERVAL_MONTHS[interval] * 30.4
  // Toleranz: 2 verpasste Zyklen plus Puffer, mindestens 45 Tage
  const graceDays = Math.max(expectedGap * 2.2, 45)
  return daysSinceLast > graceDays ? 'ended' : 'active'
}

/** Ab dieser relativen Abweichung gilt eine Buchung als Einmal-Effekt. */
const OUTLIER_REL_THRESHOLD = 0.35
/** Zusätzlich nötige absolute Abweichung, damit Kleinbeträge nicht auffallen. */
const OUTLIER_MIN_ABS = 15
/** So viele der jüngsten regulären Buchungen bestimmen das Preisniveau. */
const RECENT_WINDOW = 6

type AmountAnalysis = {
  forecastAmount: number
  outliers: AmountOutlier[]
  amountTrend: 'stable' | 'rising' | 'falling'
  needsAmountReview: boolean
  reviewReason: AmountReviewReason | null
}

/**
 * Bestimmt den Betrag, mit dem die Prognose fortschreiben soll.
 *
 * Das Problem: Energieversorger buchen monatlich einen Abschlag und einmal
 * jährlich eine Abrechnung. Würde man einfach den letzten Betrag nehmen,
 * schleppt die Prognose die Jahresabrechnung monatelang mit. Nimmt man immer
 * den Median über alles, übersieht man dauerhafte Preiserhöhungen.
 *
 * Deshalb zweistufig: erst Einmal-Effekte aussortieren, dann das Niveau aus
 * den jüngsten regulären Buchungen ableiten.
 */
function analyzeAmounts(entries: { date: string; amount: number }[]): AmountAnalysis {
  const amounts = entries.map((entry) => entry.amount)
  const baseline = median(amounts)

  if (entries.length < 2 || baseline <= 0) {
    return {
      forecastAmount: baseline,
      outliers: [],
      amountTrend: 'stable',
      needsAmountReview: false,
      reviewReason: null,
    }
  }

  // Ausreißer erst ab 4 Buchungen bestimmen – vorher ist der Median als
  // Referenz zu wackelig und normale Schwankungen würden als Einmal-Effekt
  // gelten.
  const canDetectOutliers = entries.length >= 4
  const outliers: AmountOutlier[] = []
  const regular: { date: string; amount: number }[] = []

  for (const entry of entries) {
    const diff = entry.amount - baseline
    const deviation = Math.abs(diff) / baseline
    const isOutlier =
      canDetectOutliers &&
      deviation > OUTLIER_REL_THRESHOLD &&
      Math.abs(diff) >= OUTLIER_MIN_ABS

    if (isOutlier) {
      outliers.push({
        date: entry.date,
        amount: entry.amount,
        deviation,
        kind: diff > 0 ? 'higher' : 'lower',
      })
    } else {
      regular.push(entry)
    }
  }

  outliers.sort((a, b) => b.date.localeCompare(a.date))

  // Ohne reguläre Buchungen bleibt nur der Median über alles.
  if (regular.length === 0) {
    return {
      forecastAmount: baseline,
      outliers,
      amountTrend: 'stable',
      needsAmountReview: true,
      reviewReason: 'volatile',
    }
  }

  // Preisniveau aus den jüngsten regulären Buchungen. Damit wirkt eine
  // dauerhafte Erhöhung sofort, ein einzelner Ausschlag aber nicht.
  const recent = regular.slice(-Math.min(RECENT_WINDOW, regular.length))
  const forecastAmount = median(recent.map((entry) => entry.amount))

  const earlier = regular.slice(0, regular.length - recent.length)
  const earlierMedian = earlier.length >= 2 ? median(earlier.map((e) => e.amount)) : 0
  let amountTrend: AmountAnalysis['amountTrend'] = 'stable'
  if (earlierMedian > 0) {
    const change = (forecastAmount - earlierMedian) / earlierMedian
    if (change > 0.08) amountTrend = 'rising'
    else if (change < -0.08) amountTrend = 'falling'
  }

  const regularVariation = median(
    recent.map((entry) => Math.abs(entry.amount - forecastAmount) / forecastAmount),
  )

  // Prüfhinweis nur, wenn der Nutzer wirklich entscheiden muss.
  const lastDate = entries[entries.length - 1].date
  let reviewReason: AmountReviewReason | null = null
  if (outliers.length > 0 && outliers[0].date === lastDate) {
    // Genau der Fall Jahresabrechnung: die letzte Buchung ist der Ausreißer.
    reviewReason = 'lastIsOutlier'
  } else if (outliers.length > 0 && entries.length - indexOfDate(entries, outliers[0].date) <= 3) {
    reviewReason = 'recentOutlier'
  } else if (amountTrend !== 'stable') {
    reviewReason = amountTrend
  } else if (regularVariation > 0.2) {
    reviewReason = 'volatile'
  } else if (!canDetectOutliers) {
    // Bei wenigen Buchungen wird nichts automatisch aussortiert – die
    // Datenbasis ist zu klein. Weicht die letzte Buchung aber deutlich ab,
    // muss der Nutzer entscheiden, statt dass es unbemerkt bleibt.
    const lastAmount = entries[entries.length - 1].amount
    const lastDeviation = Math.abs(lastAmount - baseline) / baseline
    if (lastDeviation > OUTLIER_REL_THRESHOLD && Math.abs(lastAmount - baseline) >= OUTLIER_MIN_ABS) {
      reviewReason = 'volatile'
    }
  }

  return {
    forecastAmount,
    outliers,
    amountTrend,
    needsAmountReview: reviewReason !== null,
    reviewReason,
  }
}

/** Position eines Datums in der chronologischen Liste. */
function indexOfDate(entries: { date: string }[], date: string): number {
  return entries.findIndex((entry) => entry.date === date)
}

export function buildSeries(
  transactions: Transaction[],
  categories: Category[],
  overrides: UserOverrides,
  referenceDate: string,
): Series[] {
  const groups = new Map<string, Transaction[]>()

  for (const tx of transactions) {
    // Eingänge und Ausgaben desselben Empfängers getrennt gruppieren.
    // Sonst würde z. B. eine Rückerstattung die Kategorie und den
    // Median-Betrag der Kostenserie verfälschen.
    const direction = tx.amount > 0 ? 'in' : 'out'
    // Der Vertrags-Diskriminator trennt Darlehen, Kontoentgelt und Zinsen
    // derselben Bank in eigene Serien.
    const contract = contractDiscriminator(tx.purpose)
    const key = `${direction}:${normalizeCounterparty(tx.counterparty, tx.purpose)}${
      contract ? `:${contract}` : ''
    }`
    const existing = groups.get(key)
    if (existing) {
      existing.push(tx)
    } else {
      groups.set(key, [tx])
    }
  }

  const series: Series[] = []

  for (const [key, txs] of groups) {
    const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date))

    // Buchungen am selben Tag zusammenfassen, damit Teilzahlungen die
    // Intervall-Erkennung nicht mit 0-Tage-Lücken verfälschen.
    const byDate = new Map<string, number>()
    for (const tx of sorted) {
      byDate.set(tx.date, (byDate.get(tx.date) ?? 0) + tx.amount)
    }
    const dates = [...byDate.keys()].sort()

    const gaps: number[] = []
    for (let i = 1; i < dates.length; i++) {
      const gap = daysBetween(dates[i - 1], dates[i])
      if (gap > 0) gaps.push(gap)
    }

    let { interval, confidence, medianGap } = classifyInterval(gaps)

    // Nutzerdefiniertes Intervall überschreibt die automatische Erkennung
    if (overrides.intervals?.[key]) {
      interval = overrides.intervals[key]
    }

    const amounts = [...byDate.values()].map((a) => Math.abs(a))
    const medianAmount = median(amounts)
    const lastAmount = Math.abs(byDate.get(dates[dates.length - 1]) ?? 0)

    // Robuster Prognosebetrag inkl. Erkennung von Einmal-Effekten
    const amountAnalysis = analyzeAmounts(
      dates.map((date) => ({ date, amount: Math.abs(byDate.get(date) ?? 0) })),
    )
    const amountVariation =
      medianAmount > 0
        ? median(amounts.map((a) => Math.abs(a - medianAmount) / medianAmount))
        : 0

    const firstDate = dates[0]
    const lastDate = dates[dates.length - 1]
    const daysSinceLast = daysBetween(lastDate, referenceDate)
    const occurrences = dates.length

    const status = determineStatus(interval, daysSinceLast, occurrences)

    const representative = sorted[sorted.length - 1]
    const autoCategory = categorize(
      representative.counterparty,
      sorted.map((t) => t.purpose).join(' '),
      representative.bookingText,
      representative.amount,
      categories,
    )

    const userCategory = overrides.categories[key]
    const rawUserAmount = overrides.amounts?.[key]
    const userAmount =
      typeof rawUserAmount === 'number' && Number.isFinite(rawUserAmount) && rawUserAmount >= 0
        ? rawUserAmount
        : null
    const typicalDay = Math.round(
      median(dates.map((d) => Number.parseInt(d.slice(8, 10), 10))),
    )

    const total = sorted.reduce((sum, t) => sum + Math.abs(t.amount), 0)

    // Prüfhinweise nur für Fixkosten. Bei Supermarkt, Tanken oder Bargeld
    // schwanken die Beträge naturgemäß – dort wäre der Hinweis Rauschen und
    // würde die wirklich wichtigen Fälle wie eine Jahresabrechnung verdecken.
    const effectiveCategory = userCategory ?? autoCategory
    const bucket = categories.find((c) => c.id === effectiveCategory)?.bucket
    const reviewApplies = bucket === 'fixed'

    // Buchungstext-Hinweis erhöht die Konfidenz bei Lastschriften/Daueraufträgen
    const bookingHint = looksRecurringByBookingText(representative.bookingText)
    const adjustedConfidence = Math.min(confidence + (bookingHint ? 0.08 : 0), 1)

    series.push({
      key,
      label: buildLabel(representative.counterparty, representative.purpose),
      counterparty: representative.counterparty || 'Unbekannter Empfänger',
      transactions: sorted,
      medianGapDays: medianGap,
      interval,
      intervalConfidence: adjustedConfidence,
      medianAmount,
      lastAmount,
      amountVariation,
      // Ein vom Nutzer gesetzter Betrag hat immer Vorrang
      forecastAmount: userAmount ?? amountAnalysis.forecastAmount,
      forecastAmountSource: userAmount != null ? 'user' : 'auto',
      outliers: amountAnalysis.outliers,
      amountTrend: amountAnalysis.amountTrend,
      // Nach einer Nutzerentscheidung ist der Hinweis erledigt
      needsAmountReview:
        userAmount != null ? false : reviewApplies && amountAnalysis.needsAmountReview,
      reviewReason:
        userAmount != null || !reviewApplies ? null : amountAnalysis.reviewReason,
      firstDate,
      lastDate,
      occurrences,
      status,
      daysSinceLast,
      categoryId: userCategory ?? autoCategory,
      categorySource: userCategory ? 'user' : 'auto',
      excluded: overrides.excluded[key] ?? false,
      confirmed: overrides.confirmed[key] ?? false,
      typicalDayOfMonth: Number.isFinite(typicalDay) ? Math.min(Math.max(typicalDay, 1), 28) : 1,
      total,
    })
  }

  return series.sort((a, b) => b.medianAmount - a.medianAmount)
}

/** Addiert Monate auf ein Datum und begrenzt den Tag auf das Monatsende. */
function addMonthsClamped(iso: string, months: number, targetDay: number): string {
  const date = toDate(iso)
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth() + months
  const lastDayOfTarget = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const day = Math.min(targetDay, lastDayOfTarget)
  return toIso(new Date(Date.UTC(year, month, day)))
}

const MONTH_NAMES = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
]

/**
 * Erzeugt die Prognose für die kommenden `monthCount` Monate.
 * Startet am Tag nach dem Referenzdatum, damit bereits gebuchte Posten
 * nicht doppelt gezählt werden.
 *
 * @param startMonthOffset - Verschiebt den Startmonat relativ zum Folgemonat.
 *   0 = nächster Monat (Standard), -1 = aktueller Monat, -12 = 12 Monate zurück
 */
export function buildForecast(
  series: Series[],
  referenceDate: string,
  categories: Category[],
  monthCount = 3,
  minConfidence = 0.35,
  startMonthOffset = 0,
): ForecastMonth[] {
  // Nur Kategorien mit bucket 'fixed' gehören in die Fixkosten-Prognose.
  // Einnahmen (z. B. Kindergeld) und variable Kosten (Einkauf, Tanken)
  // würden die Prognose sonst systematisch verfälschen.
  const fixedIds = new Set(
    categories.filter((category) => category.bucket === 'fixed').map((category) => category.id),
  )

  const start = toDate(referenceDate)
  const months: ForecastMonth[] = []

  for (let i = 0; i < monthCount; i++) {
    const monthDate = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i + 1 + startMonthOffset, 1),
    )
    months.push({
      month: `${monthDate.getUTCFullYear()}-${String(monthDate.getUTCMonth() + 1).padStart(2, '0')}`,
      monthLabel: `${MONTH_NAMES[monthDate.getUTCMonth()]} ${monthDate.getUTCFullYear()}`,
      entries: [],
      total: 0,
    })
  }

  const horizonEnd = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + monthCount + 1 + startMonthOffset, 0),
  )
  const horizonEndIso = toIso(horizonEnd)

  for (const item of series) {
    if (item.excluded) continue
    if (item.status !== 'active') continue
    if (!fixedIds.has(item.categoryId)) continue
    if (item.interval === 'irregular' || item.interval === 'weekly') continue
    if (item.intervalConfidence < minConfidence) continue
    if (item.occurrences < 2) continue

    const stepMonths = INTERVAL_MONTHS[item.interval]
    if (stepMonths < 1) continue

    // Robuster Prognosebetrag: Einmal-Effekte wie Jahresabrechnungen sind
    // bereits ausgeschlossen, ein dauerhaft geändertes Niveau ist enthalten.
    // Ein Betrag von 0 bedeutet: Nutzer erwartet keine weitere Zahlung.
    const amount = item.forecastAmount
    if (amount <= 0) continue

    // Ab der letzten Buchung in Intervall-Schritten vorwärts gehen
    for (let step = 1; step <= Math.ceil(monthCount / stepMonths) + 1; step++) {
      const expectedDate = addMonthsClamped(
        item.lastDate,
        stepMonths * step,
        item.typicalDayOfMonth,
      )
      if (expectedDate <= referenceDate) continue
      if (expectedDate > horizonEndIso) break

      const monthKey = expectedDate.slice(0, 7)
      const month = months.find((m) => m.month === monthKey)
      if (!month) continue

      const entry: ForecastEntry = {
        seriesKey: item.key,
        label: item.label,
        categoryId: item.categoryId,
        expectedDate,
        amount,
        interval: item.interval,
        confidence: item.intervalConfidence,
      }
      month.entries.push(entry)
      month.total += amount
    }
  }

  for (const month of months) {
    month.entries.sort((a, b) => a.expectedDate.localeCompare(b.expectedDate))
  }

  return months
}

/** Monatlicher Durchschnitt der variablen Kosten über die letzten `monthsBack` Monate. */
export function averageMonthlyByCategory(
  transactions: Transaction[],
  seriesByTx: Map<string, string>,
  referenceDate: string,
  monthsBack = 6,
): Map<string, { average: number; total: number; months: number }> {
  const end = toDate(referenceDate)
  const startBoundary = new Date(
    Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - monthsBack + 1, 1),
  )
  const startIso = toIso(startBoundary)

  const totals = new Map<string, number>()
  const monthsSeen = new Set<string>()

  for (const tx of transactions) {
    if (tx.date < startIso || tx.date > referenceDate) continue
    if (tx.amount >= 0) continue
    const categoryId = seriesByTx.get(tx.id)
    if (!categoryId) continue
    totals.set(categoryId, (totals.get(categoryId) ?? 0) + Math.abs(tx.amount))
    monthsSeen.add(tx.date.slice(0, 7))
  }

  const monthCount = Math.max(monthsSeen.size, 1)
  const result = new Map<string, { average: number; total: number; months: number }>()
  for (const [categoryId, total] of totals) {
    result.set(categoryId, { average: total / monthCount, total, months: monthCount })
  }
  return result
}

export function formatEuro(value: number, withSign = false): string {
  const formatted = new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(value))
  if (withSign && value !== 0) {
    return `${value < 0 ? '−' : '+'}${formatted}`
  }
  return formatted
}

export function formatDateDe(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

export function formatDateShort(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${d}.${m}.`
}
