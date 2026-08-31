import { categorize, looksRecurringByBookingText } from './categories'
import type {
  AmountOutlier,
  AmountReviewReason,
  Category,
  CategoryId,
  CurrentMonthActuals,
  CurrentMonthEntry,
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
      /\b(gmbh\s*(?:&|\+|und)\s*co\.?\s*kg|gmbh|ag|kg|ohg|e\.? ?k\.?|ug|se|mbh|co\.? kg|e\.? ?v\.?|inc|ltd|llc|b\.?v\.?|s\.?a\.?r\.?l\.?)\b/g,
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
  irregularForecast: 'unregelmäßig (in Prognose)',
}

export const INTERVAL_MONTHS: Record<IntervalKind, number> = {
  weekly: 0.25,
  monthly: 1,
  bimonthly: 2,
  quarterly: 3,
  semiannual: 6,
  annual: 12,
  irregular: 0,
  irregularForecast: 0,
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

/** Ab so vielen Tagen ohne Buchung gilt eine für die Prognose freigegebene
 * unregelmäßige Serie (z. B. jährliche KFZ-Steuer) als beendet. */
const IRREGULAR_FORECAST_GRACE_DAYS = 370

/** Ermittelt, ob eine Serie noch aktiv ist. */
function determineStatus(
  interval: IntervalKind,
  daysSinceLast: number,
  occurrences: number,
): SeriesStatus {
  if (occurrences < 2 || interval === 'irregular') {
    // Einmalzahlungen und normale unregelmäßige Posten bleiben in der Prüfung.
    return occurrences < 2 ? 'onetime' : daysSinceLast > 200 ? 'ended' : 'active'
  }

  // Explizit für die Prognose freigegebene unregelmäßige Serien haben oft große
  // Lücken (z. B. jährliche KFZ-Steuer). Erst nach deutlich über einem Jahr
  // ohne Buchung gelten sie als beendet, damit sie nicht endlos aktiv bleiben.
  if (interval === 'irregularForecast') {
    return daysSinceLast > IRREGULAR_FORECAST_GRACE_DAYS ? 'ended' : 'active'
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

  // Manche Bankexporte liefern keine eigene Spalte für die Gegenkonto-IBAN;
  // dann greift ein Fallback, der die ganze Zeile nach einer IBAN-ähnlichen
  // Zeichenfolge durchsucht (z. B. bei Kartenumsätzen). Dabei kann die
  // *eigene* Konto-IBAN erfasst werden, die auf jeder Buchung gleich ist –
  // unabhängig vom tatsächlichen Händler. Um zu verhindern, dass dadurch
  // völlig unterschiedliche Empfänger (Supermarkt, Tankstelle, Spa, ...) in
  // einer Serie landen, ermitteln wir vorab, wie viele unterschiedliche
  // Empfänger hinter jeder IBAN stecken. Steht eine IBAN für auffällig viele
  // verschiedene Empfänger, ist sie offensichtlich kein stabiler
  // Zahlungspartner-Schlüssel und wird beim Gruppieren ignoriert.
  const MAX_DISTINCT_COUNTERPARTIES_PER_ACCOUNT = 3
  const counterpartiesByAccount = new Map<string, Set<string>>()
  for (const tx of transactions) {
    const accountKey = tx.accountIdentifier?.replace(/\s+/g, '').toUpperCase()
    if (!accountKey) continue
    const set = counterpartiesByAccount.get(accountKey) ?? new Set<string>()
    set.add(normalizeCounterparty(tx.counterparty, tx.purpose))
    counterpartiesByAccount.set(accountKey, set)
  }
  const unreliableAccountKeys = new Set(
    [...counterpartiesByAccount.entries()]
      .filter(([, counterparties]) => counterparties.size > MAX_DISTINCT_COUNTERPARTIES_PER_ACCOUNT)
      .map(([accountKey]) => accountKey),
  )

  for (const tx of transactions) {
    // Eingänge und Ausgaben desselben Empfängers getrennt gruppieren.
    // Sonst würde z. B. eine Rückerstattung die Kategorie und den
    // Median-Betrag der Kostenserie verfälschen.
  const direction = tx.amount > 0 ? 'in' : 'out'
  // Wenn der Export eine Kontonummer/IBAN liefert, ist sie der stabilste
  // Zahlungspartner-Schlüssel. Dadurch werden z. B. "Bundeskasse" und
  // "Bundeskasse DO Kiel" trotz unterschiedlicher Namen zusammengeführt.
  // Die Zahlungsrichtung und der fachliche Zahlungstyp bleiben getrennt.
  const rawAccountKey = tx.accountIdentifier?.replace(/\s+/g, '').toUpperCase()
  const accountKey = rawAccountKey && !unreliableAccountKeys.has(rawAccountKey) ? rawAccountKey : undefined
  const contract = contractDiscriminator(tx.purpose)
  const paymentType = contract ? contract.split('#')[0] : 'other'
  const key = accountKey
    ? `${direction}:account:${accountKey}:${paymentType}`
    : `${direction}:${normalizeCounterparty(tx.counterparty, tx.purpose)}${
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

    const representative = sorted[sorted.length - 1]
    const autoCategory = categorize(
      representative.counterparty,
      sorted.map((t) => t.purpose).join(' '),
      representative.bookingText,
      representative.amount,
      categories,
    )

    const userCategory = overrides.categories[key]
    const transactionCategoryIds = sorted
      .map((transaction) => overrides.transactionCategories?.[transaction.id])
      .filter((categoryId): categoryId is CategoryId => Boolean(categoryId))
    const transactionCategory = transactionCategoryIds[transactionCategoryIds.length - 1]
    const effectiveUserCategory = userCategory ?? transactionCategory
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
    const effectiveCategory = effectiveUserCategory ?? autoCategory
    const isUncategorized = effectiveCategory === 'uncategorized'
    const looksLikeFixedCost =
      representative.amount < 0 &&
      (occurrences >= 2 || looksRecurringByBookingText(representative.bookingText))
    const fallbackCategory =
      !effectiveUserCategory && isUncategorized && looksLikeFixedCost && categories.some((category) => category.id === 'other_fixed')
        ? 'other_fixed'
        : effectiveCategory
    const bucket = categories.find((c) => c.id === fallbackCategory)?.bucket
    const reviewApplies = bucket === 'fixed'

    // Variable Kosten werden beim Import nicht als prognostizierbares Intervall
    // behandelt. Ein manuell gesetztes Intervall hat weiterhin Vorrang.
    if (!overrides.intervals?.[key] && bucket === 'variable') {
      interval = 'irregular'
    } else if (!overrides.intervals?.[key] && bucket === 'fixed' && interval === 'irregular') {
      interval = 'irregularForecast'
    }
    const detectedStatus = determineStatus(interval, daysSinceLast, occurrences)
    const status = overrides.reactivated[key] ? 'active' : detectedStatus

    // Buchungstext-Hinweis erhöht die Konfidenz bei Lastschriften/Daueraufträgen
    const bookingHint = looksRecurringByBookingText(representative.bookingText)
    const adjustedConfidence = Math.min(confidence + (bookingHint ? 0.08 : 0), 1)

    series.push({
      key,
      label: buildLabel(representative.counterparty, representative.purpose),
      counterparty: representative.counterparty || 'Unbekannter Empfänger',
      accountIdentifier: representative.accountIdentifier,
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
        userAmount != null
          ? false
          : fallbackCategory === 'other_fixed' && effectiveCategory === 'uncategorized'
            ? true
            : reviewApplies && amountAnalysis.needsAmountReview,
      reviewReason:
        userAmount != null || !reviewApplies
          ? null
          : fallbackCategory === 'other_fixed' && effectiveCategory === 'uncategorized'
            ? 'volatile'
            : amountAnalysis.reviewReason,
      firstDate,
      lastDate,
      occurrences,
      status,
      daysSinceLast,
      categoryId: fallbackCategory,
      categorySource: effectiveUserCategory ? 'user' : 'auto',
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
 */
export function buildForecast(
  series: Series[],
  referenceDate: string,
  categories: Category[],
  monthCount = 3,
  minConfidence = 0.35,
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
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i + 1, 1),
    )
    months.push({
      month: `${monthDate.getUTCFullYear()}-${String(monthDate.getUTCMonth() + 1).padStart(2, '0')}`,
      monthLabel: `${MONTH_NAMES[monthDate.getUTCMonth()]} ${monthDate.getUTCFullYear()}`,
      entries: [],
      total: 0,
    })
  }

  const horizonEnd = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + monthCount + 1, 0),
  )
  const horizonEndIso = toIso(horizonEnd)

  for (const item of series) {
    if (item.excluded) continue
    if (item.status !== 'active') continue
    if (!fixedIds.has(item.categoryId)) continue

    // Nur ausdrücklich freigegebene unregelmäßige Serien kommen in die
    // Prognose. Für jeden Prognosemonat wird zuerst die Buchung aus dem
    // gleichen Monat der letzten Periode übernommen (z. B. Oktober 2025 ->
    // Oktober 2026), inklusive Betrag und passendem Tag.
    if (item.interval === 'irregularForecast') {
      for (const month of months) {
        const [targetYear, targetMonth] = month.month.split('-').map(Number)
        const previousPeriod = `${targetYear - 1}-${String(targetMonth).padStart(2, '0')}`
        const previousTx = item.transactions
          .filter((tx) => tx.date.slice(0, 7) === previousPeriod)
          .sort((a, b) => b.date.localeCompare(a.date))[0]

        // Ohne Buchung im gleichen Monat der Vorperiode gibt es für diesen
        // Monat keine Prognose. Ein beliebiger Fallback aus einer anderen
        // Periode wäre bei unregelmäßigen Zahlungen fachlich falsch.
        if (!previousTx) continue

        const sourceDate = toDate(previousTx.date)
        const expectedDate = addMonthsClamped(
          previousTx.date,
          12,
          sourceDate.getUTCDate(),
        )
        const amount = Math.abs(previousTx.amount)
        if (amount <= 0 || expectedDate <= referenceDate || expectedDate > horizonEndIso) continue

        month.entries.push({
          seriesKey: item.key,
          label: item.label,
          categoryId: item.categoryId,
          expectedDate,
          amount,
          interval: item.interval,
          confidence: item.intervalConfidence,
          purpose: previousTx.purpose,
        })
        month.total += amount
      }
      continue
    }

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

    // Ab der letzten Buchung in Intervall-Schritten bis zum tatsächlichen
    // Prognosehorizont vorwärts gehen. Die alte Begrenzung auf monthCount
    // Schritte übersah Serien, deren letzte Buchung länger zurückliegt.
    const last = toDate(item.lastDate)
    const horizonMonths =
      (horizonEnd.getUTCFullYear() - last.getUTCFullYear()) * 12 +
      (horizonEnd.getUTCMonth() - last.getUTCMonth())
    const maxSteps = Math.max(1, Math.ceil(horizonMonths / stepMonths) + 1)
    for (let step = 1; step <= maxSteps; step++) {
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

/**
 * Kombinierte Ansicht des laufenden Monats mit ausschließlich PERIODISCHEN
 * (Serien-)Positionen:
 *  - Serie ist im Monat bereits gebucht  -> Ist-Position ('actual'), automatisch
 *    als bezahlt markiert. Die Prognose wird für diese Serie NICHT aufgefüllt.
 *  - Serie ist im Monat noch nicht gebucht -> erwartete Position aus der
 *    Prognoselogik ('forecast'), abhakbar wie in den Prognosemonaten.
 *
 * Der Abgleich Ist <-> Prognose erfolgt über den stabilen `series.key`.
 */
export function buildCurrentMonthActuals(
  series: Series[],
  referenceDate: string,
  categories: Category[],
  overrides: UserOverrides,
  minConfidence = 0.35,
): CurrentMonthActuals {
  const ref = toDate(referenceDate)
  const year = ref.getUTCFullYear()
  const monthIndex = ref.getUTCMonth()
  const monthStartIso = toIso(new Date(Date.UTC(year, monthIndex, 1)))
  const monthEndIso = toIso(new Date(Date.UTC(year, monthIndex + 1, 0)))
  const monthKey = referenceDate.slice(0, 7)

  // Nur Fixkosten-Kategorien gehören zu den periodischen Positionen.
  const fixedIds = new Set(
    categories.filter((category) => category.bucket === 'fixed').map((category) => category.id),
  )

  const entries: CurrentMonthEntry[] = []
  let expenses = 0
  let income = 0

  for (const item of series) {
    // Gleiche Filter wie in der Prognose, damit die Positionen konsistent sind.
    if (item.excluded) continue
    if (item.status !== 'active') continue
    if (!fixedIds.has(item.categoryId)) continue
    if (item.interval === 'irregular' || item.interval === 'weekly') continue
    if (item.interval !== 'irregularForecast') {
      if (item.intervalConfidence < minConfidence) continue
      if (item.occurrences < 2) continue
    }

    const label = overrides.names[item.key] ?? item.label

    // 1) Ist diese Serie im laufenden Monat bereits gebucht?
    // Nur Buchungen bis zum Referenzdatum gelten als Ist-Stand.
    const bookedTx = item.transactions.find(
      (tx) => tx.date >= monthStartIso && tx.date <= referenceDate,
    )

    if (bookedTx) {
      // Bereits gebucht -> reale Position, automatisch bezahlt, kein Auffüllen.
      entries.push({
        id: bookedTx.id,
        seriesKey: item.key,
        date: bookedTx.date,
        label,
        categoryId: item.categoryId,
        amount: bookedTx.amount,
        kind: 'actual',
        isPaid: true,
      })
      if (bookedTx.amount < 0) expenses += Math.abs(bookedTx.amount)
      else income += bookedTx.amount
      continue
    }

    // Freigegebene unregelmäßige Serien übernehmen den Betrag aus dem
    // gleichen Monat der letzten Periode in den aktuellen Monat.
    if (item.interval === 'irregularForecast') {
      const previousPeriod = `${year - 1}-${String(monthIndex + 1).padStart(2, '0')}`
      const previousTx = item.transactions
        .filter((tx) => tx.date.slice(0, 7) === previousPeriod)
        .sort((a, b) => b.date.localeCompare(a.date))[0]
      if (previousTx) {
        const sourceDate = toDate(previousTx.date)
        const expectedDate = addMonthsClamped(
          previousTx.date,
          12,
          sourceDate.getUTCDate(),
        )
        const amount = Math.abs(previousTx.amount)
        if (amount > 0 && expectedDate.slice(0, 7) === monthKey) {
          entries.push({
            id: `${item.key}:${expectedDate}`,
            seriesKey: item.key,
            date: expectedDate,
            label,
            categoryId: item.categoryId,
            amount: previousTx.amount < 0 ? -amount : amount,
            kind: 'forecast',
            isPaid: false,
          })
          if (previousTx.amount < 0) expenses += amount
          else income += amount
        }
      }
      continue
    }

    // 2) Noch nicht gebucht -> erwartete Position aus der Prognoselogik.
    const amount = item.forecastAmount
    if (amount <= 0) continue

    const stepMonths = INTERVAL_MONTHS[item.interval]
    if (stepMonths < 1) continue

    // Nächsten erwarteten Termin bestimmen, der in den laufenden Monat fällt.
    let expectedDate: string | null = null
    for (let step = 1; step <= Math.ceil(12 / stepMonths) + 1; step++) {
      const candidate = addMonthsClamped(item.lastDate, stepMonths * step, item.typicalDayOfMonth)
      if (candidate > monthEndIso) break
      if (candidate >= monthStartIso && candidate <= monthEndIso) {
        expectedDate = candidate
        break
      }
    }
    if (!expectedDate) continue

    const paidKey = `${monthKey}:${item.key}`
    const isPaid = overrides.paid[paidKey] ?? false

    entries.push({
      id: `forecast-${item.key}`,
      seriesKey: item.key,
      date: expectedDate,
      label,
      categoryId: item.categoryId,
      amount: -amount,
      kind: 'forecast',
      isPaid,
    })
    expenses += amount
  }

  entries.sort((a, b) => a.date.localeCompare(b.date))

  return {
    month: monthKey,
    monthLabel: `${MONTH_NAMES[monthIndex]} ${year}`,
    expenses,
    income,
    through: referenceDate,
    entries,
  }
}

/** Tatsächliche Lebensmittelkosten der letzten drei abgeschlossenen Monate. */
export function buildFoodForecast(
  series: Series[],
  categories: Category[],
  referenceDate: string,
): { months: Array<{ month: string; monthLabel: string; total: number; occurrences: number; items: Array<{ label: string; total: number; occurrences: number }> }> } {
  const groceriesId = categories.find((category) => category.id === 'groceries')?.id ?? 'groceries'
  const end = toDate(referenceDate)
  const months = Array.from({ length: 3 }, (_, index) => {
    const date = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - index - 1, 1))
    return {
      month: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`,
      monthLabel: `${MONTH_NAMES[date.getUTCMonth()]} ${date.getUTCFullYear()}`,
    }
  })
  const totals = new Map<string, { total: number; occurrences: number; items: Map<string, { label: string; total: number; occurrences: number }> }>()
  months.forEach(({ month }) => totals.set(month, { total: 0, occurrences: 0, items: new Map() }))

  for (const item of series) {
    if (item.categoryId !== groceriesId || item.excluded || item.status === 'ended') continue
    for (const transaction of item.transactions) {
      if (transaction.amount >= 0) continue
      const month = transaction.date.slice(0, 7)
      const current = totals.get(month)
      if (!current) continue
      current.total += Math.abs(transaction.amount)
      current.occurrences += 1
      const entry = current.items.get(item.key) ?? { label: item.label, total: 0, occurrences: 0 }
      entry.total += Math.abs(transaction.amount)
      entry.occurrences += 1
      current.items.set(item.key, entry)
    }
  }

  return {
    months: months.map(({ month, monthLabel }) => {
      const current = totals.get(month)!
      return {
        month,
        monthLabel,
        total: current.total,
        occurrences: current.occurrences,
        items: [...current.items.values()].sort((a, b) => b.total - a.total),
      }
    }),
  }
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
