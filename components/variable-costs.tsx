'use client'

import { useMemo } from 'react'
import { ShoppingCartIcon } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { formatEuro } from '@/lib/analyzer'
import { getCategory } from '@/lib/categories'
import type { Category } from '@/lib/types'

type VariableCostsProps = {
  averages: Map<string, { average: number; total: number; months: number }>
  categories: Category[]
}

export function VariableCosts({ averages, categories }: VariableCostsProps) {
  const rows = useMemo(() => {
    const variableIds = new Set(
      categories.filter((c) => c.bucket === 'variable').map((c) => c.id),
    )
    return [...averages.entries()]
      .filter(([id]) => variableIds.has(id))
      .map(([id, stats]) => ({ category: getCategory(id, categories), ...stats }))
      .sort((a, b) => b.average - a.average)
  }, [averages, categories])

  if (rows.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ShoppingCartIcon />
          </EmptyMedia>
          <EmptyTitle>Keine variablen Kosten erkannt</EmptyTitle>
          <EmptyDescription>
            Es wurden keine Buchungen den Kategorien Einkauf, Tanken oder Freizeit
            zugeordnet.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  const monthlyTotal = rows.reduce((sum, row) => sum + row.average, 0)
  const maxAverage = Math.max(...rows.map((row) => row.average), 1)
  const monthsCovered = rows[0]?.months ?? 0

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="gap-1">
          <CardDescription className="text-xs uppercase tracking-wide">
            Variable Kosten im Monatsdurchschnitt
          </CardDescription>
          <CardTitle className="font-mono text-3xl tabular-nums">
            {formatEuro(monthlyTotal)}
          </CardTitle>
          <CardDescription>
            Basis: die letzten {monthsCovered} Monate. Diese Beträge sind steuerbar und
            fließen nicht in die Fixkosten-Prognose ein.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-5 pt-6">
          {rows.map((row) => (
            <div key={row.category.id} className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium">{row.category.label}</span>
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-sm tabular-nums">
                    {formatEuro(row.average)}
                  </span>
                  <span className="w-24 shrink-0 text-right text-xs text-muted-foreground">
                    ges. {formatEuro(row.total)}
                  </span>
                </div>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary/70"
                  style={{ width: `${(row.average / maxAverage) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
