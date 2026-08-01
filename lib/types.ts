export type Transaction = {
  id: string
  /** Buchungstag als ISO-Datum (YYYY-MM-DD) */
  date: string
  /** Valutadatum, falls vorhanden */
  valuta?: string
  /** Empfänger / Zahlungspflichtiger, roh aus der CSV */
  counterparty: string
  /** Verwendungszweck, roh */
  purpose: string
  /** Buchungstext, z. B. "LASTSCHRIFT", "DAUERAUFTRAG" */
  bookingText: string
  /** Betrag in EUR. Negativ = Ausgabe, positiv = Eingang */
  amount: number
  currency: string
}

export type IntervalKind =
  | 'monthly'
  | 'bimonthly'
  | 'quarterly'
  | 'semiannual'
  | 'annual'
  | 'weekly'
  | 'irregular'

/** Alias für IntervalKind für Overrides */
export type Interval = IntervalKind

export type SeriesStatus = 'active' | 'ended' | 'onetime'

export type CategoryId = string

export type Category = {
  id: CategoryId
  label: string
  /** 'fixed' = Fixkosten, 'variable' = variable Kosten, 'income' = Eingang, 'ignored' */
  bucket: 'fixed' | 'variable' | 'income' | 'ignored'
  /** Schlüsselwörter zur automatischen Zuordnung (lowercase) */
  keywords: string[]
  /** Von Nutzer angelegt? */
  custom?: boolean
  builtin?: boolean
}

/**
 * Eine Buchung, die deutlich vom typischen Betrag der Serie abweicht –
 * z. B. eine Jahresabrechnung, Nachzahlung oder Erstattung. Solche Beträge
 * dürfen nicht in die Prognose einfließen, weil sie sich nicht wiederholen.
 */
export type AmountOutlier = {
  date: string
  amount: number
  /** Relative Abweichung vom typischen Betrag, z. B. 1.96 = +196 % */
  deviation: number
  kind: 'higher' | 'lower'
}

/** Warum der Prognosebetrag einer Serie geprüft werden sollte. */
export type AmountReviewReason =
  | 'lastIsOutlier'
  | 'recentOutlier'
  | 'rising'
  | 'falling'
  | 'volatile'

export type Series = {
  /** Stabiler Schlüssel, abgeleitet aus normalisiertem Empfänger */
  key: string
  /** Anzeigename */
  label: string
  counterparty: string
  transactions: Transaction[]
  /** Median-Abstand in Tagen zwischen den Buchungen */
  medianGapDays: number | null
  interval: IntervalKind
  /** Wie zuverlässig ist die Intervall-Erkennung (0..1) */
  intervalConfidence: number
  /** Median-Betrag (immer positiv, als Kosten) */
  medianAmount: number
  /** Letzter Betrag */
  lastAmount: number
  /** Streuung der Beträge relativ zum Median */
  amountVariation: number
  /**
   * Betrag, mit dem die Prognose rechnet. Robust gegen Einmal-Effekte:
   * Ausreißer wie Jahresabrechnungen sind ausgeschlossen, ein dauerhaft
   * geändertes Preisniveau wird dagegen übernommen.
   */
  forecastAmount: number
  /** Wurde der Prognosebetrag automatisch bestimmt oder vom Nutzer gesetzt? */
  forecastAmountSource: 'auto' | 'user'
  /** Erkannte Einmal-Abweichungen, neueste zuerst */
  outliers: AmountOutlier[]
  /** Entwicklung des Betragsniveaus über die Zeit */
  amountTrend: 'stable' | 'rising' | 'falling'
  /** Sollte der Nutzer den Prognosebetrag bestätigen? */
  needsAmountReview: boolean
  reviewReason: AmountReviewReason | null
  firstDate: string
  lastDate: string
  occurrences: number
  status: SeriesStatus
  /** Tage seit der letzten Buchung */
  daysSinceLast: number
  categoryId: CategoryId
  /** Wurde die Kategorie automatisch erkannt oder vom Nutzer gesetzt? */
  categorySource: 'auto' | 'user'
  /** Vom Nutzer aus der Prognose ausgeschlossen */
  excluded: boolean
  /** Vom Nutzer bestätigt */
  confirmed: boolean
  /** Typischer Buchungstag im Monat */
  typicalDayOfMonth: number
  /** Gesamtsumme aller Buchungen dieser Serie */
  total: number
}

export type ForecastEntry = {
  seriesKey: string
  label: string
  categoryId: CategoryId
  /** ISO-Datum der erwarteten Buchung */
  expectedDate: string
  amount: number
  interval: IntervalKind
  confidence: number
}

export type ForecastMonth = {
  /** YYYY-MM */
  month: string
  monthLabel: string
  entries: ForecastEntry[]
  total: number
}

export type UserOverrides = {
  /** seriesKey -> categoryId */
  categories: Record<string, CategoryId>
  /** seriesKey -> excluded */
  excluded: Record<string, boolean>
  /** seriesKey -> confirmed */
  confirmed: Record<string, boolean>
  /** seriesKey -> vom Nutzer festgelegter Prognosebetrag (positiv, in EUR) */
  amounts: Record<string, number>
  /** seriesKey -> vom Nutzer festgelegter Name (überschreibt label aus der Serie) */
  names: Record<string, string>
  /** seriesKey -> vom Nutzer festgelegtes Intervall (überschreibt auto-erkanntes Intervall) */
  intervals: Record<string, Interval>
  /** "${month}:${seriesKey}" -> markiert als bezahlt */
  paid: Record<string, boolean>
  /** Nutzerdefinierte Kategorien */
  customCategories: Category[]
}

export type ParseWarning = {
  row: number
  message: string
}

export type ParseResult = {
  transactions: Transaction[]
  warnings: ParseWarning[]
  detectedColumns: Record<string, string>
  totalRows: number
  skippedRows: number
  delimiter: string
}
