'use client'

import { useRef, useMemo } from 'react'
import {
  ArchiveIcon,
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
import { EndedContracts } from '@/components/ended-contracts'
import { ForecastTimeline } from '@/components/forecast-timeline'
import { SeriesTable } from '@/components/series-table'
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
    forecast,
    categories,
    variableAverages,
    dataRange,
    fileName,
    redaction,
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

  const endedCount = series.filter((item) => item.status === 'ended').length
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
          <div className="flex items-center gap-2">
            <CategoryManager
              categories={categories}
              onAdd={addCustomCategory}
              onRemove={removeCustomCategory}
            />
            <Button variant="ghost" size="sm" onClick={handleExport} title="Einstellungen exportieren">
              <DownloadIcon data-icon="inline-start" />
              Exportieren
            </Button>
            <Button variant="ghost" size="sm" onClick={handleImportClick} title="Einstellungen importieren">
              <UploadIcon data-icon="inline-start" />
              Importieren
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileSelected}
              className="hidden"
              aria-hidden="true"
            />
            <Button variant="ghost" size="sm" onClick={reset}>
              <Trash2Icon data-icon="inline-start" />
              Daten löschen
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
        <TabsList>
          <TabsTrigger value="forecast">
            <CalendarClockIcon data-icon="inline-start" />
            Prognose
          </TabsTrigger>
          <TabsTrigger value="categories">
            <LayersIcon data-icon="inline-start" />
            Kategorien
          </TabsTrigger>
          <TabsTrigger value="review">
            <ListChecksIcon data-icon="inline-start" />
            Serien prüfen
            <Badge variant="secondary" className="ml-1.5">
              {activeCount}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="ended">
            <ArchiveIcon data-icon="inline-start" />
            Beendet
            <Badge variant="secondary" className="ml-1.5">
              {endedCount}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="variable">
            <ShoppingCartIcon data-icon="inline-start" />
            Variable Kosten
          </TabsTrigger>
        </TabsList>

        <TabsContent value="forecast" className="pt-4">
          <ForecastTimeline
            forecast={forecast}
            categories={categories}
            series={series}
            seriesNames={props.overrides.names}
            paidEntries={props.overrides.paid}
            onNameChange={setSeriesName}
            onTogglePaid={togglePaid}
          />
        </TabsContent>

        <TabsContent value="categories" className="pt-4">
          <CategoryBreakdown series={series} categories={categories} />
        </TabsContent>

        <TabsContent value="review" className="pt-4">
          <SeriesTable
            series={series}
            categories={categories}
            userIntervals={props.overrides.intervals}
            onCategoryChange={setSeriesCategory}
            onAmountChange={setSeriesAmount}
            onIntervalChange={setSeriesInterval}
            onToggleExcluded={toggleExcluded}
            onToggleConfirmed={toggleConfirmed}
          />
        </TabsContent>

        <TabsContent value="ended" className="pt-4">
          <EndedContracts
            series={series}
            categories={categories}
            onToggleExcluded={toggleExcluded}
          />
        </TabsContent>

        <TabsContent value="variable" className="pt-4">
          <VariableCosts averages={variableAverages} categories={categories} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
