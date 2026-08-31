'use client'

import { useRef, useMemo } from 'react'
import {
  CalendarClockIcon,
  DownloadIcon,
  LayersIcon,
  ListChecksIcon,
  ShieldCheckIcon,
  ShoppingCartIcon,
  Trash2Icon,
  UploadIcon,
} from 'lucide-react'
import { CategoryBreakdown } from '@/components/category-breakdown'
import { CategoryManager } from '@/components/category-manager'
import { ForecastTimeline } from '@/components/forecast-timeline'
import { FoodForecast } from '@/components/food-forecast'
import { SeriesTable } from '@/components/series-table'
import { RawBookings } from '@/components/raw-bookings'
import { SummaryCards } from '@/components/summary-cards'
import { VariableCosts } from '@/components/variable-costs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatDateDe, INTERVAL_MONTHS } from '@/lib/analyzer'
import { exportOverrides, importOverrides } from '@/lib/local-store'
import type { useAnalysis } from '@/hooks/use-analysis'

type DashboardProps = ReturnType<typeof useAnalysis>

export function Dashboard(props: DashboardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const {
    series,
    transactions,
    forecast,
    categories,
    variableAverages,
    currentMonthActuals,
    dataRange,
    fileName,
    redaction,
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
  } = props

  const handleExport = () => {
    exportOverrides(props.overrides, fileName || 'einstellungen')
  }

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const imported = await importOverrides(file)
    if (!imported) {
      alert('Fehler beim Importieren der Einstellungen')
      return
    }

    // Merge the imported overrides
    Object.entries(imported.categories).forEach(([key, value]) => {
      if (value) setSeriesCategory(key, value)
    })
    Object.entries(imported.amounts).forEach(([key, value]) => {
      if (value !== null && value !== undefined) setSeriesAmount(key, value)
    })
    Object.entries(imported.names).forEach(([key, value]) => {
      if (value) setSeriesName(key, value)
    })
    Object.entries(imported.intervals).forEach(([key, value]) => {
      if (value) setSeriesInterval(key, value)
    })
    Object.entries(imported.excluded).forEach(([key, value]) => {
      if (value) toggleExcluded(key)
    })
    Object.entries(imported.confirmed).forEach(([key, value]) => {
      if (value) toggleConfirmed(key)
    })
    Object.entries(imported.paid).forEach(([key, value]) => {
      if (value) {
        const [month, seriesKey] = key.split(':')
        if (month && seriesKey) togglePaid(month, seriesKey)
      }
    })

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }

    alert('Einstellungen erfolgreich importiert!')
  }

  const fixedMonthlyBaseline = useMemo(() => {
    const fixedIds = new Set(categories.filter((c) => c.bucket === 'fixed').map((c) => c.id))
    return series
      .filter(
        (item) =>
          item.status === 'active' &&
          !item.excluded &&
          fixedIds.has(item.categoryId) &&
          INTERVAL_MONTHS[item.interval] > 0,
      )
      // forecastAmount statt medianAmount: sonst würde die Grundlast
      // Einmal-Effekte wie Jahresabrechnungen mittragen und der Prognose
      // widersprechen.
      .reduce((sum, item) => sum + item.forecastAmount / INTERVAL_MONTHS[item.interval], 0)
  }, [series, categories])

  /**
   * Übersicht der Ersetzungen. Macht sichtbar, was die Anonymisierung
   * tatsächlich gegriffen hat – und deckt auf, wenn z. B. keine IBAN
   * gefunden wurde, weil der Export sie nicht enthält.
   */
  const redactionSummary = useMemo(() => {
    if (!redaction) return null
    const stats = redaction.stats
    const entries = [
      { label: 'IBAN', count: stats.iban },
      { label: 'BIC', count: stats.bic },
      { label: 'Vertragsnr.', count: stats.contractNumber },
      { label: 'Kartennr.', count: stats.cardNumber },
      { label: 'E-Mail', count: stats.email },
      { label: 'Telefon', count: stats.phone },
      { label: 'Name', count: stats.name },
    ].filter((entry) => entry.count > 0)
    return entries.length > 0 ? entries : null
  }, [redaction])

  const activeCount = series.filter((item) => item.status === 'active').length

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">Fixkosten-Prognose</h1>
            <p className="text-sm text-muted-foreground">
              {fileName ? <span className="font-medium">{fileName}</span> : 'Beispieldaten'}
              {dataRange ? (
                <>
                  {' '}
                  &middot; {formatDateDe(dataRange.from)} – {formatDateDe(dataRange.to)}{' '}
                  &middot; {dataRange.months} Monate Historie
                </>
              ) : null}
            </p>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <CategoryManager
              categories={categories}
              onAdd={addCustomCategory}
              onRemove={removeCustomCategory}
            />
            <Button variant="ghost" size="sm" className="min-w-0 whitespace-normal" onClick={handleExport} title="Einstellungen exportieren">
              <DownloadIcon data-icon="inline-start" />
              <span className="whitespace-normal break-words">Exportieren</span>
            </Button>
            <Button variant="ghost" size="sm" className="min-w-0 whitespace-normal" onClick={handleImportClick} title="Einstellungen importieren">
              <UploadIcon data-icon="inline-start" />
              <span className="whitespace-normal break-words">Importieren</span>
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileSelected}
              className="hidden"
              aria-hidden="true"
            />
            <Button variant="ghost" size="sm" className="min-w-0 whitespace-normal text-left" onClick={reset}>
              <Trash2Icon data-icon="inline-start" />
              <span className="whitespace-normal break-words">Daten löschen</span>
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/40 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <ShieldCheckIcon className="size-4 shrink-0 text-muted-foreground" />
            <p className="text-xs leading-relaxed text-muted-foreground">
              Alle Daten liegen ausschließlich in diesem Browser. Mit &quot;Daten
              löschen&quot; entfernst du sie vollständig, inklusive lokalem Speicher.
            </p>
          </div>
          {redactionSummary ? (
            <div className="flex flex-wrap items-center gap-1.5 pl-6">
              <span className="text-xs text-muted-foreground">
                Beim Import anonymisiert:
              </span>
              {redactionSummary.map((entry) => (
                <Badge key={entry.label} variant="secondary" className="font-mono text-[10px]">
                  {entry.count}× {entry.label}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
      </header>

      <SummaryCards
        forecast={forecast}
        series={series}
        fixedMonthlyBaseline={fixedMonthlyBaseline}
      />

      <Separator />

      <Tabs defaultValue="forecast">
        <TabsList className="!grid !h-auto w-full max-w-full grid-cols-2 items-stretch gap-1 overflow-visible p-1 sm:!flex sm:justify-start">
          <TabsTrigger value="forecast" className="h-auto min-h-11 min-w-0 w-full flex-none whitespace-normal text-center sm:flex-1">
            <CalendarClockIcon data-icon="inline-start" />
            Prognose Fix
          </TabsTrigger>
          <TabsTrigger value="review" className="h-auto min-h-11 min-w-0 w-full flex-none whitespace-normal text-center sm:flex-1">
            <ListChecksIcon data-icon="inline-start" />
            Serien prüfen
            <Badge variant="secondary" className="ml-1.5">
              {activeCount}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="raw" className="h-auto min-h-11 min-w-0 w-full flex-none whitespace-normal text-center sm:flex-1">
            <ListChecksIcon data-icon="inline-start" />
            Original Buchung
          </TabsTrigger>
          <TabsTrigger value="food" className="h-auto min-h-11 min-w-0 w-full flex-none whitespace-normal text-center sm:flex-1">
            <ShoppingCartIcon data-icon="inline-start" />
            Prognose Lebensmittel
          </TabsTrigger>
          <TabsTrigger value="categories" className="h-auto min-h-11 min-w-0 w-full flex-none whitespace-normal text-center sm:flex-1">
            <LayersIcon data-icon="inline-start" />
            Kategorien
          </TabsTrigger>
          <TabsTrigger value="variable" className="h-auto min-h-11 min-w-0 w-full flex-none whitespace-normal text-center sm:flex-1">
            <ShoppingCartIcon data-icon="inline-start" />
            Variable Kosten
          </TabsTrigger>
        </TabsList>

        <TabsContent value="forecast" className="mt-4 pt-0">
          <ForecastTimeline
            forecast={forecast}
            categories={categories}
            series={series}
            seriesNames={props.overrides.names}
            paidEntries={props.overrides.paid}
            currentMonthActuals={currentMonthActuals}
            onNameChange={setSeriesName}
            onAmountChange={setSeriesAmount}
            onTogglePaid={togglePaid}
            onCategoryChange={setSeriesCategory}
            onIntervalChange={setSeriesInterval}
            onToggleConfirmed={toggleConfirmed}
          />
        </TabsContent>

        <TabsContent value="food" className="mt-4 pt-0">
          <FoodForecast
            series={series}
            categories={categories}
            referenceDate={props.referenceDate}
            onCategoryChange={setSeriesCategory}
          />
        </TabsContent>

        <TabsContent value="categories" className="mt-4 pt-0">
          <CategoryBreakdown series={series} categories={categories} />
        </TabsContent>

        <TabsContent value="review" className="mt-4 pt-0">
          <SeriesTable
            series={series}
            categories={categories}
            userIntervals={props.overrides.intervals}
            onCategoryChange={setSeriesCategory}
            onReviewFood={setReviewAsFood}
            onAmountChange={setSeriesAmount}
            onIntervalChange={setSeriesInterval}
            onToggleExcluded={toggleExcluded}
            onReactivate={reactivateSeries}
            onToggleConfirmed={toggleConfirmed}
          />
        </TabsContent>

        <TabsContent value="variable" className="mt-4 pt-0">
          <VariableCosts averages={variableAverages} categories={categories} />
        </TabsContent>

        <TabsContent value="raw" className="mt-4 pt-0">
          <RawBookings transactions={transactions} categories={categories} series={series} userIntervals={props.overrides.intervals} seriesCategories={props.overrides.categories} transactionCategories={props.overrides.transactionCategories} onCategoryChange={setTransactionCategory} onSeriesCategoryChange={setSeriesCategory} onGroceriesToggle={toggleSeriesGroceries} onVariableChange={setTransactionVariable} onSeriesVariableChange={setSeriesVariable} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
