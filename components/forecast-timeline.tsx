'use client'

import { useState } from 'react'
import { CalendarIcon, InfoIcon } from 'lucide-react'
import { ForecastDetailDialog } from '@/components/forecast-detail-dialog'
import { Badge } from '@/components/ui/badge'
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
import { formatDateDe, formatEuro, INTERVAL_LABELS } from '@/lib/analyzer'
import { getCategory } from '@/lib/categories'
import type { Category, ForecastMonth, Series } from '@/lib/types'
import { cn } from '@/lib/utils'

type ForecastTimelineProps = {
  forecast: ForecastMonth[]
  categories: Category[]
  series?: Series[]
  seriesNames?: Record<string, string>
  paidEntries?: Record<string, boolean>
  onNameChange?: (seriesKey: string, name: string | null) => void
  onTogglePaid?: (month: string, seriesKey: string) => void
}

export function ForecastTimeline({
  forecast,
  categories,
  series = [],
  seriesNames = {},
  paidEntries = {},
  onNameChange,
  onTogglePaid,
}: ForecastTimelineProps) {
  const [selectedEntry, setSelectedEntry] = useState<typeof forecast[0]['entries'][0] | null>(
    null,
  )

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

  return (
    <div className="flex flex-col gap-4">
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
                          className="shrink-0 p-1 hover:bg-primary/20 rounded transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Checkbox
                            checked={paidEntries[`${month.month}:${entry.seriesKey}`] ?? false}
                            onCheckedChange={() => {
                              onTogglePaid?.(month.month, entry.seriesKey)
                            }}
                          />
                        </div>
                        <div 
                          onClick={() => setSelectedEntry(entry)}
                          className="flex min-w-0 flex-1 items-center gap-3"
                        >
                          <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground w-10">
                            {formatDateDe(entry.expectedDate).slice(0, 6)}
                          </span>
                          <div className="flex min-w-0 flex-1 flex-col gap-1">
                            <span className="truncate text-sm font-medium" title={seriesNames[entry.seriesKey] || entry.label}>
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
                          <span className="shrink-0 font-mono text-sm tabular-nums">
                            {formatEuro(entry.amount)}
                          </span>
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
