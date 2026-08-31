'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { formatDateDe, formatEuro, INTERVAL_LABELS } from '@/lib/analyzer'
import { getCategory } from '@/lib/categories'
import type { Category, Series } from '@/lib/types'

/**
 * Bereinigt den Verwendungszweck von überflüssigen oder redundanten Teilen
 */
function cleanPurpose(purpose: string): string {
  // Entferne überflüssige Hinweise am Ende
  let cleaned = purpose
    .replace(/\s*siehe\s+anlage\s*$/i, '')
    .replace(/\s*s\.\s*o\.\s*$/i, '')
    .replace(/\s*siehe\s+oben\s*$/i, '')
    .replace(/\s*wie\s+oben\s*$/i, '')
    .trim()

  // Verkürze sehr lange Strings, aber behalte Aussagekraft
  if (cleaned.length > 100) {
    const parts = cleaned.split(/\s+/)
    const keywords = []
    for (const part of parts) {
      if (part.length > 3 || /^[A-Z]/.test(part)) {
        keywords.push(part)
        if (keywords.length >= 8) break
      }
    }
    if (keywords.length < parts.length) {
      cleaned = keywords.join(' ')
    }
  }

  return cleaned
}

type SeriesDetailDialogProps = {
  series: Series | null
  categories: Category[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SeriesDetailDialog({
  series,
  categories,
  open,
  onOpenChange,
}: SeriesDetailDialogProps) {
  if (!series) return null

  const category = getCategory(series.categoryId, categories)
  const isRare = series.interval !== 'monthly'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2">
            <span className="truncate">{series.label}</span>
            {isRare && (
              <Badge variant="secondary" className="text-[10px] font-normal">
                {INTERVAL_LABELS[series.interval]}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>{series.counterparty}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 text-sm">
          {/* Hauptdetails */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <span className="text-xs text-muted-foreground">Kategorie</span>
              <p className="truncate font-medium text-sm leading-tight">{category?.label ?? 'Unbekannt'}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Rhythmus</span>
              <p className="font-medium text-sm">{INTERVAL_LABELS[series.interval]}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Prognosebetrag</span>
              <p className="font-mono font-semibold text-sm">{formatEuro(series.forecastAmount)}</p>
            </div>
          </div>

          {isRare && (
            <div className="flex items-center gap-2 rounded-md border border-amber-200/50 bg-amber-50/30 px-3 py-2 text-xs text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
              <span>
                Diese Serie wird nur {INTERVAL_LABELS[series.interval].toLowerCase()} bebucht.
                {series.occurrences > 1
                  ? ` Es gibt ${series.occurrences} bekannte Vorkommen.`
                  : ' Es gibt nur eine bekannte Zahlung.'}
              </span>
            </div>
          )}

          {series.transactions.length > 0 && (
            <div className="flex flex-col gap-3 border-t border-border pt-4">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Letzte Buchungen ({series.transactions.length})
              </span>
              <div className="overflow-x-auto">
                <Table className="text-xs">
                  <TableHeader>
                    <TableRow className="border-muted-foreground/20 hover:bg-transparent">
                      <TableHead className="h-auto py-1 px-2 text-muted-foreground font-medium">
                        Datum
                      </TableHead>
                      <TableHead className="h-auto py-1 px-2 text-muted-foreground font-medium text-right">
                        Betrag
                      </TableHead>
                      <TableHead className="h-auto py-1 px-2 text-muted-foreground font-medium">
                        Verwendungszweck
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {series.transactions
                      .slice()
                      .reverse()
                      .map((tx, index) => (
                        <TableRow key={`${tx.date}-${index}`} className="border-muted-foreground/10">
                          <TableCell className="py-1 px-2 font-mono text-muted-foreground">
                            {formatDateDe(tx.date)}
                          </TableCell>
                          <TableCell className="py-1 px-2 text-right font-mono font-semibold">
                            {formatEuro(Math.abs(tx.amount))}
                          </TableCell>
                          <TableCell className="py-1 px-2 max-w-xs truncate" title={tx.purpose}>
                            {cleanPurpose(tx.purpose)}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
