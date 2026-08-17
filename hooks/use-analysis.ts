'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  averageMonthlyByCategory,
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
  normalizeStoredState,
  saveState,
} from '@/lib/local-store'
import { mergeTransactions } from '@/lib/transaction-merger'
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
  const [fileNames, setFileNames] = useState<string[]>([])
  const [importedAt, setImportedAt] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const [isRestoring, setIsRestoring] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [persistLocally, setPersistLocally] = useState(true)
  const [anonymizeOptions, setAnonymizeOptions] = useState<AnonymizeOptions>(
    DEFAULT_ANONYMIZE_OPTIONS,
  )
  const [redaction, setRedaction] = useState<AnonymizeResult | null>(null)
  const [monthOffset, setMonthOffset] = useState(0)

  // Gespeicherten Zustand beim Start laden
  useEffect(() => {
    let cancelled = false
    loadState().then((stored) => {
      if (cancelled) return
      const state = normalizeStoredState(stored ?? undefined)
      if (state) {
        setTransactions(state.transactions)
        setOverrides(normalizeOverrides(state.overrides))
        setFileName(state.fileName)
        setFileNames(state.fileNames ?? [])
        setImportedAt(state.importedAt)
        // Anonymisierungs-Einstellungen vom ersten Import wiederherstellen
        if (state.anonymizeOptions) {
          setAnonymizeOptions(state.anonymizeOptions)
        }
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
    saveState({
      transactions,
      overrides,
      fileName,
      fileNames,
      importedAt,
      anonymizeOptions,
    })
  }, [transactions, overrides, fileName, fileNames, importedAt, anonymizeOptions, isRestoring, persistLocally])

  const categories: Category[] = useMemo(
    () => [...overrides.customCategories, ...BUILTIN_CATEGORIES],
    [overrides.customCategories],
  )

  /** Referenzdatum: das spätere von heute und der letzten Buchung. */
  const referenceDate = useMemo(() => {
    const today = toIso(new Date())
    if (transactions.length === 0) return today
    const last = transactions[transactions.length - 1].date
    return last > today ? last : today
  }, [transactions])

  const series = useMemo(
    () => buildSeries(transactions, categories, overrides, referenceDate, anonymizeOptions.useDateField),
    [transactions, categories, overrides, referenceDate, anonymizeOptions.useDateField],
  )

  // Erweiterte Prognose: 1 Monat zurück + 3 vorwärts = 4 Monate
  const extendedForecast = useMemo(
    () => buildForecast(series, referenceDate, categories, 4, 0.35, -1),
    [series, referenceDate, categories],
  )

  // Sichtbare Prognose: 3-Monats-Fenster basierend auf monthOffset
  // Standardverhalten: wenn monthOffset === 0, zeige den aktuellen Monat
  // inklusive bereits erwarteter (aber bereits gebuchter) Posten innerhalb
  // dieses Monats. extendedForecast ist so gebaut, dass Index 1 dem
  // aktuellen Monat entspricht (startMonthOffset = -1 in buildForecast).
  const forecast = useMemo(() => {
    const startIndex = 1 + monthOffset // 1 = Offset für "heute" / aktueller Monat
    return extendedForecast.slice(startIndex, startIndex + 3)
  }, [extendedForecast, monthOffset])

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
        // Beim ersten Import: Dateinamen-Liste initialisieren
        setFileNames([file.name])
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
   * Importiert mehrere CSV-Dateien gleichzeitig.
   * Duplikate werden VOR der Anonymisierung gefiltert, dann wird
   * die gesamte Datenmenge einmalig anonymisiert.
   */
  const importFiles = useCallback(
    async (files: File[]) => {
      setIsLoading(true)
      setError(null)
      
      try {
        const allTransactions: Transaction[] = []
        const fileNamesList: string[] = []
        let totalRows = 0
        let totalSkipped = 0
        
        // 1. Alle Dateien parsen (OHNE Anonymisierung)
        for (const file of files) {
          try {
            const text = await readFileWithEncoding(file)
            const result = parseBankCsv(text)
            
            if (result.transactions.length > 0) {
              allTransactions.push(...result.transactions)
              fileNamesList.push(file.name)
              totalRows += result.totalRows
              totalSkipped += result.skippedRows
            }
          } catch (err) {
            console.error(`[importFiles] Failed to parse ${file.name}:`, err)
            // Weiter mit nächster Datei
          }
        }
        
        if (allTransactions.length === 0) {
          setError('Keine gültigen Transaktionen in den Dateien gefunden.')
          return null
        }
        
        // 2. Duplikate entfernen VOR der Anonymisierung
        const { merged, duplicates } = mergeTransactions([], allTransactions)
        
        // 3. Jetzt erst anonymisieren (einmalig für alle Daten)
        const anonymized = anonymizeTransactions(merged, anonymizeOptions)
        
        // 4. State aktualisieren
        setTransactions(anonymized.transactions)
        setRedaction(anonymized)
        setFileNames(fileNamesList)
        setFileName(fileNamesList.length > 1
          ? `${fileNamesList.length} Dateien`
          : fileNamesList[0]
        )
        setImportedAt(new Date().toISOString())
        
        // 5. Erfolgs-Feedback
        return {
          success: true,
          files: fileNamesList.length,
          total: merged.length,
          duplicates,
          totalRows,
          totalSkipped,
        }
      } catch (err) {
        console.error('[importFiles] failed:', err)
        setError('Fehler beim Importieren der Dateien.')
        return null
      } finally {
        setIsLoading(false)
      }
    },
    [anonymizeOptions],
  )

  const setSeriesCategory = useCallback((seriesKey: string, categoryId: CategoryId) => {
    setOverrides((prev) => ({
      ...prev,
      categories: { ...prev.categories, [seriesKey]: categoryId },
    }))
  }, [])

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
    referenceDate,
    dataRange,
    fileName,
    fileNames,
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
    monthOffset,
    setMonthOffset,
    importFile,
    importFiles,
    importCsvText,
    setSeriesCategory,
    setSeriesAmount,
    setSeriesName,
    setSeriesInterval,
    toggleExcluded,
    toggleConfirmed,
    togglePaid,
    addCustomCategory,
    removeCustomCategory,
    reset,
  }
}
