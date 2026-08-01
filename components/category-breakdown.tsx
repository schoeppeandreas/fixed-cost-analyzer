'use client'

import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { SeriesDetailDialog } from '@/components/series-detail-dialog'
import { formatEuro, INTERVAL_LABELS, INTERVAL_MONTHS } from '@/lib/analyzer'
import { getCategory } from '@/lib/categories'
import type { Category, Series } from '@/lib/types'

type CategoryBreakdownProps = {
  series: Series[]
  categories: Category[]
}

export function CategoryBreakdown({ series, categories }: CategoryBreakdownProps) {
  const [selectedSeries, setSelectedSeries] = useState<Series | null>(null)

  const groups = useMemo(() => {
    const fixedIds = new Set(categories.filter((c) => c.bucket === 'fixed').map((c) => c.id))
    const map = new Map<string, { monthly: number; items: Series[] }>()

    for (const item of series) {
      if (item.status !== 'active' || item.excluded) continue
      if (!fixedIds.has(item.categoryId)) continue
      const months = INTERVAL_MONTHS[item.interval]
      if (!months) continue
      // Zukunftsbezogene Kennzahl: forecastAmount schließt Einmal-Effekte
      // wie Jahresabrechnungen aus.
      const monthly = item.forecastAmount / months
      const bucket = map.get(item.categoryId) ?? { monthly: 0, items: [] }
      bucket.monthly += monthly
      bucket.items.push(item)
      map.set(item.categoryId, bucket)
    }

    return [...map.entries()]
      .map(([id, value]) => ({ category: getCategory(id, categories), ...value }))
      .sort((a, b) => b.monthly - a.monthly)
  }, [series, categories])

  const total = groups.reduce((sum, group) => sum + group.monthly, 0)

  if (groups.length === 0) return null

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="gap-1">
          <CardDescription className="text-xs uppercase tracking-wide">
            Fixkosten normalisiert pro Monat
          </CardDescription>
          <CardTitle className="font-mono text-3xl tabular-nums">
            {formatEuro(total)}
          </CardTitle>
          <CardDescription className="leading-relaxed">
            Quartals- und Jahresbeträge sind hier auf Monate umgerechnet. Diese Zahl zeigt
            deine echte durchschnittliche Belastung, unabhängig davon, in welchem Monat
            abgebucht wird.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {groups.map((group) => (
          <Card key={group.category.id}>
            <CardHeader className="gap-1">
              <div className="flex items-baseline justify-between gap-3">
                <CardTitle className="text-base">{group.category.label}</CardTitle>
                <span className="font-mono text-lg tabular-nums">
                  {formatEuro(group.monthly)}
                </span>
              </div>
              <CardDescription>
                {group.items.length} {group.items.length === 1 ? 'Serie' : 'Serien'} &middot;{' '}
                {((group.monthly / total) * 100).toFixed(0)} % der Fixkosten
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-2">
                {group.items
                  .slice()
                  .sort(
                    (a, b) =>
                      b.forecastAmount / INTERVAL_MONTHS[b.interval] -
                      a.forecastAmount / INTERVAL_MONTHS[a.interval],
                  )
                  .map((item) => (
                    <li
                      key={item.key}
                      onClick={() => setSelectedSeries(item)}
                      className="flex cursor-pointer items-center justify-between gap-3 rounded px-2 py-1.5 transition-colors hover:bg-muted"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-sm" title={item.counterparty}>
                          {item.label}
                        </span>
                        {item.interval !== 'monthly' ? (
                          <Badge variant="outline" className="shrink-0 text-[10px]">
                            {INTERVAL_LABELS[item.interval]}
                          </Badge>
                        ) : null}
                      </div>
                      <span className="shrink-0 font-mono text-sm tabular-nums text-muted-foreground">
                        {formatEuro(item.forecastAmount)}
                      </span>
                    </li>
                  ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>

      {selectedSeries ? (
        <SeriesDetailDialog
          series={selectedSeries}
          categories={categories}
          open={selectedSeries !== null}
          onOpenChange={(open) => {
            if (!open) setSelectedSeries(null)
          }}
        />
      ) : null}
    </div>
  )
}
