'use client'

import { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import {
  averageMonthlyByCategory,
  buildCurrentMonthActuals,
  buildForecast,
  buildSeries,
  toIso,
} from '@/lib/analyzer'
import {
  anonymizeTransactions,
  DEFAULT_ANONYMIZE_OPTIONS,
  type AnonymizeOptions,
  type AnonymizeResult,
} from '@/lib/anonymizer'
import { BUILTIN_CATEGORIES } from '@/lib/categories'
import { parseBankCsv, readFileWithEncoding } from '@/lib/csv-parser'
import {
  clearState,
  EMPTY_OVERRIDES,
  loadState,
  normalizeOverrides,
  saveState,
} from '@/lib/local-store'
import type {
  Category,
  CategoryId,
  ParseResult,
  Transaction,
  UserOverrides,
} from '@/lib/types'

export function useAnalysis() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [overrides, setOverrides] = useState<UserOverrides>(EMPTY_OVERRIDES)
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [fileName, setFileName] = useState<string>('')
  const [importedAt, setImportedAt] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const [isRestoring, setIsRestoring] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [persistLocally, setPersistLocally] = useState(true)
  const [anonymizeOptions, setAnonymizeOptions] = useState<AnonymizeOptions>(
    DEFAULT_ANONYMIZE_OPTIONS,
  )
  const [redaction, setRedaction] = useState<AnonymizeResult | null>(null)

  // Gespeicherten Zustand beim Start laden
  useEffect(() => {
    let cancelled = false
    loadState().then((state) => {
      if (cancelled) return
      if (state) {
        setTransactions(state.transactions)
        setOverrides(normalizeOverrides(state.overrides))
        setFileName(state.fileName)
        setImportedAt(state.importedAt)
      }
      setIsRestoring(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Änderungen speichern
  useEffect(() => {
    if (isRestoring) return
    if (!persistLocally) return
    if (transactions.length === 0) return
    saveState({ transactions, overrides, fileName, importedAt })
  }, [transactions, overrides, fileName, importedAt, isRestoring, persistLocally])

  const categories: Category[] = useMemo(
    () => [...overrides.customCategories, ...BUILTIN_CATEGORIES],
    [overrides.customCategories],
  )
  // Die UI reagiert sofort auf Overrides; teure Serien-/Forecast-Berechnungen
  // dürfen den Klick nicht blockieren und laufen mit dem letzten stabilen Snapshot.
  const deferredOverrides = useDeferredValue(overrides)

  /** Referenzdatum: das spätere von heute und der letzten Buchung. */
  const referenceDate = useMemo(() => {
    const today = toIso(new Date())
    if (transactions.length === 0) return today
    const last = transactions[transactions.length - 1].date
    return last > today ? last : today
  }, [transactions])

  const series = useMemo(
    () => buildSeries(transactions, categories, deferredOverrides, referenceDate),
    [transactions, categories, deferredOverrides, referenceDate],
  )

  const forecast = useMemo(
    () => buildForecast(series, referenceDate, categories, 3),
    [series, referenceDate, categories],
  )

  /** Map: transactionId -> categoryId, für die Auswertung der variablen Kosten. */
  const txCategoryMap = useMemo(() => {
    const map = new Map<string, CategoryId>()
    for (const item of series) {
      for (const tx of item.transactions) {
        map.set(tx.id, item.categoryId)
      }
    }
    return map
  }, [series])

  const variableAverages = useMemo(
    () => averageMonthlyByCategory(transactions, txCategoryMap, referenceDate, 6),
    [transactions, txCategoryMap, referenceDate],
  )

  /**
   * Kombinierte Ansicht des laufenden Monats: bereits gebuchte periodische
   * Kosten plus die noch nicht gebuchten periodischen Positionen aus der
   * Prognose. Wird optional per "Zurück"-Button in der Prognose eingeblendet.
   */
  const currentMonthActuals = useMemo(
    () => buildCurrentMonthActuals(series, referenceDate, categories, deferredOverrides),
    [series, referenceDate, categories, deferredOverrides],
  )

  const importCsvText = useCallback(
    (text: string, name: string) => {
      setError(null)
      const result = parseBankCsv(text)
      setParseResult(result)

      if (result.transactions.length === 0) {
        setError(
          result.warnings[0]?.message ??
            'Es konnten keine Buchungen gelesen werden. Bitte prüfe das Dateiformat.',
        )
        return result
      }

      // Anonymisierung direkt nach dem Parsen: ab hier existieren die
      // Rohdaten nur noch als lokale Variable im Speicher und werden nie
      // in den State oder nach IndexedDB geschrieben.
      const anonymized = anonymizeTransactions(result.transactions, anonymizeOptions)
      setRedaction(anonymized)
      setTransactions(anonymized.transactions)
      setFileName(name)
      setImportedAt(new Date().toISOString())
      return result
    },
    [anonymizeOptions],
  )

  const importFile = useCallback(
    async (file: File) => {
      setIsLoading(true)
      setError(null)
      try {
        const text = await readFileWithEncoding(file)
        const result = importCsvText(text, file.name)
        return result
      } catch (err) {
        console.log('[v0] importFile failed:', err)
        setError('Die Datei konnte nicht gelesen werden.')
        return null
      } finally {
        setIsLoading(false)
      }
    },
    [importCsvText],
  )

  /**
   * Liest mehrere CSV-Dateien ein und führt sie zu einem Datensatz zusammen.
   * Buchungen aus überlappenden Export-Zeiträumen werden dedupliziert, echte
   * Mehrfachbuchungen innerhalb einer Datei bleiben dagegen erhalten (Zähler
   * pro Datei). Anschließend wird chronologisch sortiert und einmalig anonymisiert.
   */
  const importFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return null
      setIsLoading(true)
      setError(null)
      try {
        const merged: Transaction[] = []
        const seen = new Set<string>()
        const perFileCounter = new Map<string, number>()
        let lastResult: ParseResult | null = null
        let filesWithData = 0

        for (const file of files) {
          const text = await readFileWithEncoding(file)
          const result = parseBankCsv(text)
          lastResult = result
          if (result.transactions.length === 0) continue
          filesWithData++

          // Zähler pro Datei zurücksetzen: identische Zeilen innerhalb einer
          // Datei erhalten unterschiedliche Schlüssel und bleiben erhalten.
          perFileCounter.clear()
          for (const tx of result.transactions) {
            const base = `${tx.date}|${Math.round(tx.amount * 100)}|${tx.counterparty}|${tx.purpose}|${tx.bookingText}`
            const n = perFileCounter.get(base) ?? 0
            perFileCounter.set(base, n + 1)
            const key = `${base}#${n}`
            if (seen.has(key)) continue
            seen.add(key)
            merged.push(tx)
          }
        }

        setParseResult(lastResult)

        if (merged.length === 0) {
          setError(
            lastResult?.warnings[0]?.message ??
              'Es konnten keine Buchungen gelesen werden. Bitte prüfe das Dateiformat.',
          )
          return lastResult
        }

        // Chronologisch sortieren, damit die Serien-Erkennung korrekt arbeitet.
        merged.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
        // Nach dem Merge stabile, eindeutige IDs vergeben.
        const reindexed = merged.map((tx, i) => ({
          ...tx,
          id: `tx-${i}-${tx.date}-${Math.round(tx.amount * 100)}`,
        }))

        const anonymized = anonymizeTransactions(reindexed, anonymizeOptions)
        setRedaction(anonymized)
        setTransactions(anonymized.transactions)
        setFileName(
          files.length === 1
            ? files[0].name
            : `${filesWithData} Dateien zusammengeführt`,
        )
        setImportedAt(new Date().toISOString())
        return lastResult
      } catch (err) {
        console.log('[v0] importFiles failed:', err)
        setError('Die Dateien konnten nicht gelesen werden.')
        return null
      } finally {
        setIsLoading(false)
      }
    },
    [anonymizeOptions],
  )

  const setTransactionCategory = useCallback((transactionId: string, categoryId: CategoryId | null) => {
    const matchingSeries = series.find((item) => item.transactions.some((transaction) => transaction.id === transactionId))

    setOverrides((prev) => {
      const transactionCategories = { ...prev.transactionCategories }
      const categories = { ...prev.categories }

      if (!matchingSeries) {
        if (categoryId) transactionCategories[transactionId] = categoryId
        else delete transactionCategories[transactionId]
        return { ...prev, transactionCategories }
      }

      for (const transaction of matchingSeries.transactions) {
        if (categoryId) transactionCategories[transaction.id] = categoryId
        else delete transactionCategories[transaction.id]
      }
      if (categoryId) categories[matchingSeries.key] = categoryId
      else delete categories[matchingSeries.key]
      return { ...prev, categories, transactionCategories }
    })
  }, [series])

  const setSeriesCategory = useCallback((seriesKey: string, categoryId: CategoryId) => {
    const matchingSeries = series.find((item) => item.key === seriesKey)
    if (!matchingSeries) return
    setOverrides((prev) => {
      const transactionCategories = { ...prev.transactionCategories }
      for (const transaction of matchingSeries.transactions) {
        transactionCategories[transaction.id] = categoryId
      }
      return {
        ...prev,
        categories: { ...prev.categories, [seriesKey]: categoryId },
        transactionCategories,
      }
    })
  }, [series])

  const toggleSeriesGroceries = useCallback((seriesKey: string) => {
    const matchingSeries = series.find((item) => item.key === seriesKey)
    if (!matchingSeries) return
    startTransition(() => setOverrides((prev) => {
      const categories = { ...prev.categories }
      const transactionCategories = { ...prev.transactionCategories }
      const categoryBeforeGroceries = { ...prev.categoryBeforeGroceries }
      const currentlyGroceries = (categories[seriesKey] ?? matchingSeries.categoryId) === 'groceries'
      if (currentlyGroceries) {
        const previous = categoryBeforeGroceries[seriesKey]
        const restoreCategory = previous && previous !== 'groceries' ? previous : 'uncategorized'
        categories[seriesKey] = restoreCategory
        for (const transaction of matchingSeries.transactions) transactionCategories[transaction.id] = restoreCategory
        delete categoryBeforeGroceries[seriesKey]
      } else {
        const previous = categories[seriesKey] ?? matchingSeries.categoryId
        categoryBeforeGroceries[seriesKey] = previous === 'groceries' ? null : previous
        categories[seriesKey] = 'groceries'
        for (const transaction of matchingSeries.transactions) transactionCategories[transaction.id] = 'groceries'
      }
      return { ...prev, categories, transactionCategories, categoryBeforeGroceries }
    }))
  }, [series])

  const setSeriesVariable = useCallback((seriesKey: string) => {
    const matchingSeries = series.find((item) => item.key === seriesKey)
    if (!matchingSeries) return
    startTransition(() => setOverrides((prev) => {
      const intervals = { ...prev.intervals }
      const intervalBeforeVariable = { ...prev.intervalBeforeVariable }
      const isVariable = intervals[seriesKey] === 'irregular'

      if (isVariable) {
        const previousInterval = intervalBeforeVariable[seriesKey]
        if (previousInterval) intervals[seriesKey] = previousInterval
        else delete intervals[seriesKey]
        delete intervalBeforeVariable[seriesKey]
      } else {
        intervalBeforeVariable[seriesKey] = intervals[seriesKey] ?? matchingSeries.interval
        intervals[seriesKey] = 'irregular'
      }

      return { ...prev, intervals, intervalBeforeVariable }
    }))
  }, [series])

  const setTransactionVariable = useCallback((transactionId: string) => {
    const matchingSeries = series.find((item) => item.transactions.some((transaction) => transaction.id === transactionId))
    setOverrides((prev) => {
      const categories = { ...prev.categories }
      const transactionCategories = { ...prev.transactionCategories }

      if (!matchingSeries) {
        transactionCategories[transactionId] = 'uncategorized'
        return {
          ...prev,
          transactionCategories,
        }
      }

      // Bei „Sonstige Fixkosten“ wird die manuelle Zuordnung entfernt, damit
      // die ursprüngliche automatische Kategorie aus den Originaldaten greift.
      if (matchingSeries.categoryId === 'other_fixed') {
        delete categories[matchingSeries.key]
        for (const transaction of matchingSeries.transactions) {
          transactionCategories[transaction.id] = 'uncategorized'
        }
      }

      return {
        ...prev,
        categories,
        transactionCategories,
        intervals: { ...prev.intervals, [matchingSeries.key]: 'irregular' },
      }
    })
  }, [series])

  const setReviewAsFood = useCallback((seriesKey: string) => {
    const matchingSeries = series.find((item) => item.key === seriesKey)
    if (!matchingSeries) return
    setOverrides((prev) => {
      const transactionCategories = { ...prev.transactionCategories }
      for (const transaction of matchingSeries.transactions) {
        transactionCategories[transaction.id] = 'groceries'
      }
      return {
        ...prev,
        categories: { ...prev.categories, [seriesKey]: 'groceries' },
        transactionCategories,
        intervals: { ...prev.intervals, [seriesKey]: 'irregular' },
      }
    })
  }, [series])

  /**
   * Legt den Prognosebetrag einer Serie fest. `null` stellt die automatische
   * Erkennung wieder her, `0` bedeutet "keine weitere Zahlung erwartet".
   */
  const setSeriesAmount = useCallback((seriesKey: string, amount: number | null) => {
    setOverrides((prev) => {
      const amounts = { ...prev.amounts }
      if (amount == null) {
        delete amounts[seriesKey]
      } else {
        amounts[seriesKey] = Math.max(0, Math.round(amount * 100) / 100)
      }
      return { ...prev, amounts }
    })
  }, [])

  /** Setzt einen benutzerdefinierten Namen für eine Serie. */
  const setSeriesName = useCallback((seriesKey: string, name: string | null) => {
    setOverrides((prev) => {
      const names = { ...prev.names }
      if (name == null || name.trim() === '') {
        delete names[seriesKey]
      } else {
        names[seriesKey] = name.trim()
      }
      return { ...prev, names }
    })
  }, [])

  const toggleExcluded = useCallback((seriesKey: string) => {
    setOverrides((prev) => ({
      ...prev,
      excluded: { ...prev.excluded, [seriesKey]: !prev.excluded[seriesKey] },
    }))
  }, [])

  const reactivateSeries = useCallback((seriesKey: string) => {
    setOverrides((prev) => ({
      ...prev,
      excluded: { ...prev.excluded, [seriesKey]: false },
      reactivated: { ...prev.reactivated, [seriesKey]: true },
      // Reaktivieren ist eine ausdrückliche Freigabe für die Prognose.
      // Normale unregelmäßige Serien bleiben unverändert, solange sie nicht
      // über diese Aktion reaktiviert wurden.
      intervals: { ...prev.intervals, [seriesKey]: 'irregularForecast' },
    }))
  }, [])

  const toggleConfirmed = useCallback((seriesKey: string) => {
    setOverrides((prev) => ({
      ...prev,
      confirmed: { ...prev.confirmed, [seriesKey]: !prev.confirmed[seriesKey] },
    }))
  }, [])

  /** Setzt das Intervall einer Serie manuell. `null` stellt die automatische Erkennung wieder her. */
  const setSeriesInterval = useCallback((seriesKey: string, interval: string | null) => {
    setOverrides((prev) => {
      const intervals = { ...prev.intervals }
      if (interval == null) {
        delete intervals[seriesKey]
      } else {
        intervals[seriesKey] = interval as any
      }
      return { ...prev, intervals }
    })
  }, [])

  /** Markiert einen Prognose-Eintrag als bezahlt oder nicht bezahlt */
  const togglePaid = useCallback((month: string, seriesKey: string) => {
    setOverrides((prev) => {
      const key = `${month}:${seriesKey}`
      const paid = { ...prev.paid }
      paid[key] = !paid[key]
      return { ...prev, paid }
    })
  }, [])

  const addCustomCategory = useCallback(
    (label: string, bucket: Category['bucket'], keywords: string[]) => {
      const id = `custom-${Date.now().toString(36)}`
      setOverrides((prev) => ({
        ...prev,
        customCategories: [
          ...prev.customCategories,
          { id, label, bucket, keywords, custom: true },
        ],
      }))
      return id
    },
    [],
  )

  const removeCustomCategory = useCallback((id: CategoryId) => {
    setOverrides((prev) => {
      const nextCategories = { ...prev.categories }
      for (const [key, value] of Object.entries(nextCategories)) {
        if (value === id) delete nextCategories[key]
      }
      return {
        ...prev,
        categories: nextCategories,
        customCategories: prev.customCategories.filter((c) => c.id !== id),
      }
    })
  }, [])

  const reset = useCallback(async () => {
    await clearState()
    setTransactions([])
    setOverrides(EMPTY_OVERRIDES)
    setParseResult(null)
    setFileName('')
    setImportedAt('')
    setError(null)
    setRedaction(null)
  }, [])

  const dataRange = useMemo(() => {
    if (transactions.length === 0) return null
    return {
      from: transactions[0].date,
      to: transactions[transactions.length - 1].date,
      months: Math.max(
        1,
        Math.round(
          (new Date(transactions[transactions.length - 1].date).getTime() -
            new Date(transactions[0].date).getTime()) /
            (30.4 * 86_400_000),
        ),
      ),
    }
  }, [transactions])

  return {
    transactions,
    series,
    forecast,
    categories,
    overrides,
    parseResult,
    variableAverages,
    currentMonthActuals,
    referenceDate,
    dataRange,
    fileName,
    importedAt,
    isLoading,
    isRestoring,
    error,
    hasData: transactions.length > 0,
    persistLocally,
    setPersistLocally,
    anonymizeOptions,
    setAnonymizeOptions,
    redaction,
    importFile,
    importFiles,
    importCsvText,
    setSeriesCategory,
    toggleSeriesGroceries,
    setSeriesVariable,
    setReviewAsFood,
    setTransactionCategory,
    setTransactionVariable,
    setSeriesAmount,
    setSeriesName,
    setSeriesInterval,
    toggleExcluded,
    reactivateSeries,
    toggleConfirmed,
    togglePaid,
    addCustomCategory,
    removeCustomCategory,
    reset,
  }
}
