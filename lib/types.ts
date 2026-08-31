export type Transaction = {
  id: string
  /** Buchungstag als ISO-Datum (YYYY-MM-DD) */
  date: string
  /** Valutadatum, falls vorhanden */
  valuta?: string
  /** Empfänger / Zahlungspflichtiger, roh aus der CSV */
  counterparty: string
  /** Konto-/IBAN-Kennung aus dem Bankexport, falls vorhanden */
  accountIdentifier?: string
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
  /** Manuell freigegebene unregelmäßige Serie für die Prognose */
  | 'irregularForecast'

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
  /** Kontonummer/IBAN der Serie, falls im Import vorhanden */
  accountIdentifier?: string
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
  interval: Interval
  confidence: number
  /** Verwendungszweck der zugrunde liegenden Buchung */
  purpose?: string
}

export type ForecastMonth = {
  /** YYYY-MM */
  month: string
  monthLabel: string
  entries: ForecastEntry[]
  total: number
}

/**
 * Eine periodische Position des laufenden Monats. Entweder bereits gebucht
 * ('actual') oder noch erwartet laut Prognose ('forecast').
 */
export type CurrentMonthEntry = {
  id: string
  /** Schlüssel der zugehörigen Serie – Bindeglied zu Prognose & "bezahlt" */
  seriesKey: string
  /** ISO-Datum: bei 'actual' das Buchungsdatum, bei 'forecast' das erwartete */
  date: string
  label: string
  categoryId: CategoryId
  /** Betrag in EUR. Negativ = Ausgabe, positiv = Eingang */
  amount: number
  /** Ist die Position schon gebucht oder eine Prognose? */
  kind: 'actual' | 'forecast'
  /** Als bezahlt/erledigt markiert (bei 'actual' automatisch true) */
  isPaid: boolean
}

/**
 * Der laufende Monat als kombinierte Ansicht: bereits gebuchte periodische
 * Kosten ('actual', automatisch als bezahlt) plus die noch nicht gebuchten
 * periodischen Positionen aus der Prognose ('forecast'). Nur periodische
 * (Serien-)Positionen, keine einmaligen/variablen Buchungen.
 */
export type CurrentMonthActuals = {
  /** YYYY-MM */
  month: string
  monthLabel: string
  /** Summe der Ausgaben (positiv dargestellt) */
  expenses: number
  /** Summe der Einnahmen */
  income: number
  /** Bis zu welchem Tag reichen die Ist-Daten (ISO) */
  through: string
  entries: CurrentMonthEntry[]
}

export type UserOverrides = {
  /** seriesKey -> categoryId */
  categories: Record<string, CategoryId>
  /** transactionId -> categoryId */
  transactionCategories: Record<string, CategoryId>
  /** seriesKey -> excluded */
  excluded: Record<string, boolean>
  /** seriesKey -> manually reactivated after automatic end detection */
  reactivated: Record<string, boolean>
  /** seriesKey -> confirmed */
  confirmed: Record<string, boolean>
  /** seriesKey -> vom Nutzer festgelegter Prognosebetrag (positiv, in EUR) */
  amounts: Record<string, number>
  /** seriesKey -> vom Nutzer festgelegter Name (überschreibt label aus der Serie) */
  names: Record<string, string>
  /** seriesKey -> vom Nutzer festgelegtes Intervall (überschreibt auto-erkanntes Intervall) */
  intervals: Record<string, Interval>
  /** seriesKey -> vorherige Kategorie vor der Schnellaktion Einkauf */
  categoryBeforeGroceries: Record<string, CategoryId | null>
  /** seriesKey -> vorheriges Intervall vor der Schnellaktion Variable Kosten */
  intervalBeforeVariable: Record<string, Interval | null>
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
