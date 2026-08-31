'use client'

import { useState } from 'react'
import { CalendarIcon, CheckIcon, ChevronLeftIcon, InfoIcon, ShoppingCartIcon, ShuffleIcon } from 'lucide-react'
import { ForecastDetailDialog } from '@/components/forecast-detail-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Separator } from '@/components/ui/separator'
import { Checkbox } from '@/components/ui/checkbox'
import { AmountDecisionDialog } from '@/components/amount-decision-dialog'
import { formatDateDe, formatEuro, INTERVAL_LABELS } from '@/lib/analyzer'
import { getCategory } from '@/lib/categories'
import type { Category, CurrentMonthActuals, ForecastMonth, Series } from '@/lib/types'
import { cn } from '@/lib/utils'

type ForecastTimelineProps = {
  forecast: ForecastMonth[]
  categories: Category[]
  series?: Series[]
  seriesNames?: Record<string, string>
  paidEntries?: Record<string, boolean>
  currentMonthActuals?: CurrentMonthActuals | null
  onNameChange?: (seriesKey: string, name: string | null) => void
  onAmountChange?: (seriesKey: string, amount: number | null) => void
  onTogglePaid?: (month: string, seriesKey: string) => void
  onCategoryChange?: (seriesKey: string, categoryId: string) => void
  onIntervalChange?: (seriesKey: string, interval: string | null) => void
  onToggleConfirmed?: (seriesKey: string) => void
}

export function ForecastTimeline({
  forecast,
  categories,
  series = [],
  seriesNames = {},
  paidEntries = {},
  currentMonthActuals = null,
  onNameChange,
  onAmountChange,
  onTogglePaid,
  onCategoryChange,
  onIntervalChange,
  onToggleConfirmed,
}: ForecastTimelineProps) {
  const [selectedEntry, setSelectedEntry] = useState<typeof forecast[0]['entries'][0] | null>(
    null,
  )
  const [editingSeries, setEditingSeries] = useState<Series | null>(null)
  // Ist-Ansicht des laufenden Monats einblenden (per "Zurück"-Button)
  const [showCurrentMonth, setShowCurrentMonth] = useState(false)

  // Schnelle Suche: seriesKey -> Serie
  const seriesMap = new Map(series.map((s) => [s.key, s]))

  // Berechne effektive Summe pro Monat (abzüglich bezahlter Einträge)
  const effectiveForecasts = forecast.map((month) => {
    const paidTotal = month.entries.reduce((sum, entry) => {
      const key = `${month.month}:${entry.seriesKey}`
      return paidEntries[key] ? sum + entry.amount : sum
    }, 0)
    return {
      ...month,
      effectiveTotal: Math.max(0, month.total - paidTotal),
      paidTotal,
    }
  })

  const hasEntries = effectiveForecasts.some((month) => month.entries.length > 0)

  if (!hasEntries) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CalendarIcon />
          </EmptyMedia>
          <EmptyTitle>Keine Prognose möglich</EmptyTitle>
          <EmptyDescription>
            Es wurden keine aktiven wiederkehrenden Buchungen erkannt. Prüfe im Tab
            &quot;Serien prüfen&quot;, ob Buchungen fälschlich ausgeschlossen sind.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  const maxTotal = Math.max(...effectiveForecasts.map((month) => month.effectiveTotal), 1)

  // Dynamische Summe des laufenden Monats: abgehakte bzw. bereits gebuchte
  // Positionen zählen NICHT mit (analog zu effectiveTotal der Prognosemonate).
  const currentMonthOpen = currentMonthActuals
    ? currentMonthActuals.entries.reduce(
        (acc, entry) => {
          const key = `${currentMonthActuals.month}:${entry.seriesKey}`
          const checked = entry.kind === 'actual' ? true : (paidEntries[key] ?? false)
          if (checked) return acc
          if (entry.amount < 0) acc.expenses += Math.abs(entry.amount)
          else acc.income += entry.amount
          return acc
        },
        { expenses: 0, income: 0 },
      )
    : { expenses: 0, income: 0 }

  return (
    <div className="flex flex-col gap-4">
      {currentMonthActuals ? (
        <div className="flex items-center justify-between gap-2">
          <Button
            variant={showCurrentMonth ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setShowCurrentMonth((prev) => !prev)}
          >
            <ChevronLeftIcon data-icon="inline-start" />
            {showCurrentMonth ? 'Laufenden Monat ausblenden' : 'Laufender Monat'}
          </Button>
          {showCurrentMonth ? (
            <span className="text-xs text-muted-foreground">
              Gebucht bis {formatDateDe(currentMonthActuals.through)}
            </span>
          ) : null}
        </div>
      ) : null}

      {showCurrentMonth && currentMonthActuals ? (
        <Card className="border-primary/40 bg-primary/5">
          <CardHeader className="gap-2">
            <div className="flex items-baseline justify-between gap-2">
              <CardTitle className="text-base">
                {currentMonthActuals.monthLabel}
              </CardTitle>
              <Badge variant="secondary" className="font-normal">
                Ist &amp; Prognose
              </Badge>
            </div>
            <div className="flex flex-col gap-0.5">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-xl tabular-nums text-foreground">
                  {formatEuro(currentMonthOpen.expenses)}
                </span>
                <span className="text-xs text-muted-foreground">noch offen</span>
              </div>
              <span className="text-xs text-muted-foreground">
                von {formatEuro(currentMonthActuals.expenses)} gesamt
              </span>
            </div>
            {currentMonthOpen.income > 0 ? (
              <div className="text-xs text-muted-foreground">
                {formatEuro(currentMonthOpen.income)} Einnahmen offen
              </div>
            ) : null}
          </CardHeader>
          <Separator />
          <CardContent className="p-0">
            {currentMonthActuals.entries.length === 0 ? (
              <p className="px-6 py-6 text-sm text-muted-foreground">
                Keine periodischen Kosten in diesem Monat.
              </p>
            ) : (
              <ul className="flex flex-col">
                {currentMonthActuals.entries.map((entry) => {
                  const category = getCategory(entry.categoryId, categories)
                  const paidKey = `${currentMonthActuals.month}:${entry.seriesKey}`
                  // Ist-Positionen gelten als bezahlt; Prognosen folgen dem Override.
                  const isChecked =
                    entry.kind === 'actual'
                      ? true
                      : paidEntries[paidKey] ?? false
                  return (
                    <li
                      key={entry.id}
                      className={cn(
                        'flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0 transition-colors',
                        entry.kind === 'forecast' && 'bg-muted/30',
                        isChecked && 'opacity-50 line-through',
                      )}
                    >
                      <div className="shrink-0 p-1" aria-label={isChecked ? 'Als offen markieren' : 'Als bezahlt markieren'}>
                        <Checkbox
                          checked={isChecked}
                          disabled={entry.kind === 'actual'}
                          onCheckedChange={() => {
                            if (entry.kind === 'actual') return
                            onTogglePaid?.(currentMonthActuals.month, entry.seriesKey)
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                      <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground w-10">
                        {formatDateDe(entry.date).slice(0, 6)}
                      </span>
                        <div
                          className="flex min-w-0 flex-1 cursor-pointer flex-col gap-1 rounded-sm hover:bg-muted/50"
                          role="button"
                          tabIndex={0}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              event.currentTarget.click()
                            }
                          }}
                          onClick={() => {
                            const sourceSeries = seriesMap.get(entry.seriesKey)
                            setSelectedEntry({
                              seriesKey: entry.seriesKey,
                              label: entry.label,
                              categoryId: entry.categoryId,
                              expectedDate: entry.date,
                              amount: entry.amount,
                              interval: sourceSeries?.interval ?? 'monthly',
                              confidence: sourceSeries?.intervalConfidence ?? 1,
                            })
                          }}
                        >
                          <span className="truncate text-sm font-medium" title={entry.label}>
                          {entry.label}
                        </span>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs text-muted-foreground">
                            {category.label}
                          </span>
                          <Badge variant="outline" className="text-[10px]">
                            {entry.kind === 'actual' ? 'gebucht' : 'erwartet'}
                          </Badge>
                        </div>
                      </div>
                      <span
                        className={cn(
                          'shrink-0 font-mono text-sm tabular-nums',
                          entry.amount < 0 ? 'text-foreground' : 'text-primary',
                        )}
                      >
                        {formatEuro(entry.amount)}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {effectiveForecasts.map((month) => (
          <Card key={month.month} className="flex flex-col">
            <CardHeader className="gap-2">
              <div className="flex items-baseline justify-between gap-2">
                <CardTitle className="text-base">{month.monthLabel}</CardTitle>
                <Badge variant="secondary" className="font-mono tabular-nums">
                  {month.entries.length}
                </Badge>
              </div>
              <CardDescription className="font-mono text-xl tabular-nums text-foreground">
                {formatEuro(month.effectiveTotal)}
              </CardDescription>
              {month.paidTotal > 0 && (
                <div className="text-xs text-muted-foreground">
                  {formatEuro(month.paidTotal)} bezahlt
                </div>
              )}
              <div
                className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
                role="presentation"
              >
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${(month.effectiveTotal / maxTotal) * 100}%` }}
                />
              </div>
            </CardHeader>
            <Separator />
            <CardContent className="flex flex-1 flex-col gap-0 p-0">
              {month.entries.length === 0 ? (
                <p className="px-6 py-6 text-sm text-muted-foreground">
                  Keine Buchungen erwartet.
                </p>
              ) : (
                <ul className="flex flex-col">
                  {month.entries.map((entry, index) => {
                    const category = getCategory(entry.categoryId, categories)
                    const sourceSeries = seriesMap.get(entry.seriesKey)
                    const needsReview = (sourceSeries?.needsAmountReview ?? false) && !(sourceSeries?.confirmed ?? false)
                    const isRare = entry.interval !== 'monthly'
                    return (
                      <li
                        key={`${entry.seriesKey}-${entry.expectedDate}-${index}`}
                        className={cn(
                          'flex cursor-pointer items-center gap-3 border-b border-border px-4 py-3 last:border-b-0 transition-colors hover:bg-muted/60 group',
                          isRare && 'bg-muted/40',
                          paidEntries[`${month.month}:${entry.seriesKey}`] && 'opacity-50 line-through',
                        )}
                      >
                        <div
                          role="button"
                          tabIndex={0}
                          aria-label={paidEntries[`${month.month}:${entry.seriesKey}`] ? 'Als offen markieren' : 'Als bezahlt markieren'}
                          onClick={(e) => {
                            e.stopPropagation()
                            onTogglePaid?.(month.month, entry.seriesKey)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              e.stopPropagation()
                              onTogglePaid?.(month.month, entry.seriesKey)
                            }
                          }}
                          className="shrink-0 rounded p-1 hover:bg-primary/20 transition-colors"
                        >
                          <Checkbox
                            checked={paidEntries[`${month.month}:${entry.seriesKey}`] ?? false}
                            onCheckedChange={() => {
                              onTogglePaid?.(month.month, entry.seriesKey)
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                        <div 
                          onClick={() => setSelectedEntry(entry)}
                          className="flex min-w-0 flex-1 flex-col gap-2"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                          <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground w-10">
                            {formatDateDe(entry.expectedDate).slice(0, 6)}
                          </span>
                          <div className="flex min-w-0 flex-1 flex-col gap-1">
                            <span className="min-w-0 whitespace-normal break-words text-sm font-medium leading-5" title={seriesNames[entry.seriesKey] || entry.label}>
                              {seriesNames[entry.seriesKey] || entry.label}
                            </span>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-xs text-muted-foreground">
                                {category.label}
                              </span>
                              {isRare ? (
                                <Badge variant="outline" className="text-[10px]">
                                  {INTERVAL_LABELS[entry.interval]}
                                </Badge>
                              ) : null}
                              {entry.confidence < 0.5 ? (
                                <Badge variant="outline" className="text-[10px]">
                                  unsicher
                                </Badge>
                              ) : null}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="shrink-0 rounded-sm font-mono text-sm tabular-nums underline decoration-dotted underline-offset-4 hover:text-primary"
                            onClick={(event) => {
                              event.stopPropagation()
                              setEditingSeries(sourceSeries ?? null)
                            }}
                            aria-label={`Prognosebetrag ${formatEuro(entry.amount)} bearbeiten`}
                          >
                            {formatEuro(entry.amount)}
                          </button>
                          </div>
                          {needsReview ? (
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="size-9"
                              title="Als Lebensmittel markieren"
                              aria-label="Als Lebensmittel markieren"
                              onClick={(event) => {
                                event.stopPropagation()
                                onCategoryChange?.(entry.seriesKey, 'groceries')
                                onIntervalChange?.(entry.seriesKey, 'irregular')
                              }}
                            >
                              <ShoppingCartIcon className="size-4" aria-hidden="true" />
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="size-9"
                              title="Als variabel markieren"
                              aria-label="Als variabel markieren"
                              onClick={(event) => {
                                event.stopPropagation()
                                onIntervalChange?.(entry.seriesKey, 'irregular')
                              }}
                            >
                              <ShuffleIcon className="size-4" aria-hidden="true" />
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="size-9"
                              title="Prognose bestätigen"
                              aria-label="Prognose bestätigen"
                              onClick={(event) => {
                                event.stopPropagation()
                                onToggleConfirmed?.(entry.seriesKey)
                              }}
                            >
                              <CheckIcon className="size-4" aria-hidden="true" />
                            </Button>
                          </div>
                        ) : null}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3">
        <InfoIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <p className="text-sm leading-relaxed text-muted-foreground">
          Grau hinterlegte Zeilen sind keine Monatszahler, sondern Quartals-, Halbjahres-
          oder Jahresbuchungen. Sie erklären, warum einzelne Monate deutlich teurer
          ausfallen als andere.
        </p>
      </div>

      {editingSeries ? (
        <AmountDecisionDialog
          series={editingSeries}
          open={!!editingSeries}
          onOpenChange={(open) => {
            if (!open) setEditingSeries(null)
          }}
          onConfirm={(seriesKey, amount) => {
            if (onAmountChange) onAmountChange(seriesKey, amount)
          }}
        />
      ) : null}

      {selectedEntry ? (
        <ForecastDetailDialog
          entry={selectedEntry}
          series={seriesMap.get(selectedEntry.seriesKey) || null}
          displayName={seriesNames[selectedEntry.seriesKey] || null}
          categories={categories}
          open={!!selectedEntry}
          onOpenChange={(next) => {
            if (!next) setSelectedEntry(null)
          }}
          onNameChange={onNameChange || (() => {})}
        />
      ) : null}
    </div>
  )
}
