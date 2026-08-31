'use client'

import { useState } from 'react'
import { ShoppingCartIcon } from 'lucide-react'
import type { Category, Series } from '@/lib/types'
import { buildFoodForecast, formatEuro } from '@/lib/analyzer'
import { CategoryEditDialog } from '@/components/category-edit-dialog'

export function FoodForecast({
  series,
  categories,
  referenceDate,
  onCategoryChange,
}: {
  series: Series[]
  categories: Category[]
  referenceDate: string
  onCategoryChange: (seriesKey: string, categoryId: string) => void
}) {
  const history = buildFoodForecast(series, categories, referenceDate)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const editingItem = history.months
    .flatMap((month) => month.items)
    .find((item) => item.key === editingKey)

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">Tatsächliche Ausgaben</p>
        <h2 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <ShoppingCartIcon className="size-5 text-muted-foreground" />
          Lebensmittelkosten
        </h2>
        <p className="text-sm text-muted-foreground">
          Übersicht der letzten drei abgeschlossenen Monate sowie des laufenden Monats. Es werden nur tatsächliche Ausgaben der Kategorie „Lebensmittel & Einkauf“ berücksichtigt.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {history.months.map((month) => (
          <article
            key={month.month}
            className={`flex min-w-0 flex-col gap-4 rounded-lg border p-5 ${
              month.isCurrent ? 'border-primary/40 bg-primary/5' : 'border-border bg-card'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm text-muted-foreground">{month.monthLabel}</p>
                <p className="font-mono text-2xl font-semibold">{formatEuro(month.total)}</p>
              </div>
              <span className="shrink-0 text-right text-xs text-muted-foreground">{month.occurrences} Buchungen</span>
            </div>
            <div className="flex flex-col gap-2 border-t border-border pt-3">
              {month.items.length ? month.items.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setEditingKey(item.key)}
                  className="flex items-center justify-between gap-3 rounded-md px-1 py-0.5 text-left text-sm transition-colors hover:bg-muted/50"
                  aria-label={`${item.label} bearbeiten`}
                >
                  <span className="min-w-0 truncate" title={item.label}>{item.label}</span>
                  <span className="shrink-0 font-mono">{formatEuro(item.total)}</span>
                </button>
              )) : (
                <p className="text-sm text-muted-foreground">Keine Ausgaben</p>
              )}
            </div>
          </article>
        ))}
      </div>

      <CategoryEditDialog
        item={editingItem ?? null}
        categories={categories}
        open={editingKey !== null}
        onOpenChange={(open) => {
          if (!open) setEditingKey(null)
        }}
        onCategoryChange={onCategoryChange}
      />
    </section>
  )
}
