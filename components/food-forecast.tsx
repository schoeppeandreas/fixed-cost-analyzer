'use client'

import { ShoppingCartIcon } from 'lucide-react'
import type { Category, Series } from '@/lib/types'
import { buildFoodForecast, formatEuro } from '@/lib/analyzer'

export function FoodForecast({ series, categories, referenceDate }: { series: Series[]; categories: Category[]; referenceDate: string }) {
  const history = buildFoodForecast(series, categories, referenceDate)

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">Tatsächliche Ausgaben</p>
        <h2 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <ShoppingCartIcon className="size-5 text-muted-foreground" />
          Lebensmittelkosten
        </h2>
        <p className="text-sm text-muted-foreground">
          Übersicht der letzten drei abgeschlossenen Monate. Es werden nur tatsächliche Ausgaben der Kategorie „Lebensmittel & Einkauf“ berücksichtigt.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {history.months.map((month) => (
          <article key={month.month} className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">{month.monthLabel}</p>
                <p className="font-mono text-2xl font-semibold">{formatEuro(month.total)}</p>
              </div>
              <span className="text-right text-xs text-muted-foreground">{month.occurrences} Buchungen</span>
            </div>
            <div className="flex flex-col gap-2 border-t border-border pt-3">
              {month.items.length ? month.items.map((item) => (
                <div key={item.label} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate" title={item.label}>{item.label}</span>
                  <span className="shrink-0 font-mono">{formatEuro(item.total)}</span>
                </div>
              )) : (
                <p className="text-sm text-muted-foreground">Keine Ausgaben</p>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
