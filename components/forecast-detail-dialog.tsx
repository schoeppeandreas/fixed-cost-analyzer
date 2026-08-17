'use client'

import { useState } from 'react'
import { TrashIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatDateDe, formatEuro, INTERVAL_LABELS } from '@/lib/analyzer'
import { getCategory } from '@/lib/categories'
import type { Category, ForecastEntry, Series } from '@/lib/types'

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

type ForecastDetailDialogProps = {
  entry: ForecastEntry | null
  series: Series | null
  displayName: string | null
  categories: Category[]
  open: boolean
  onOpenChange: (next: boolean) => void
  onNameChange: (seriesKey: string, name: string | null) => void
}

export function ForecastDetailDialog({
  entry,
  series,
  displayName,
  categories,
  open,
  onOpenChange,
  onNameChange,
}: ForecastDetailDialogProps) {
  const [editingName, setEditingName] = useState('')
  const [isEditing, setIsEditing] = useState(false)

  if (!entry) return null

  // Die letzten 4 Transaktionen, neueste zuerst
  const recentTransactions = series?.transactions.slice(-4).reverse() ?? []

  const category = getCategory(entry.categoryId, categories)
  const isRare = entry.interval !== 'monthly'

  const handleSave = () => {
    const finalName = editingName?.trim()
    if (finalName && finalName !== displayName) {
      onNameChange(entry.seriesKey, finalName)
    }
    setIsEditing(false)
  }

  const handleReset = () => {
    onNameChange(entry.seriesKey, null)
    setEditingName('')
    setIsEditing(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-fit min-w-[20rem] max-w-[min(90vw,42rem)] sm:max-w-[min(90vw,42rem)]">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2">
            <span className="truncate">Prognose-Details</span>
            {isRare && (
              <Badge variant="secondary" className="text-[10px] font-normal">
                {INTERVAL_LABELS[entry.interval]}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>{formatDateDe(entry.expectedDate)}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          {/* Name editing */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="forecast-name">Beschreibung</Label>
            {isEditing ? (
              <Input
                id="forecast-name"
                defaultValue={displayName || entry.label || ''}
                onChange={(e) => setEditingName(e.target.value)}
                placeholder={entry.label}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSave()
                  if (e.key === 'Escape') {
                    setIsEditing(false)
                  }
                }}
                onBlur={handleSave}
                className="flex-1"
              />
            ) : (
              <div 
                onClick={() => setIsEditing(true)}
                className="rounded-md border border-border bg-muted/40 px-3 py-2 cursor-pointer hover:bg-muted/60 transition-colors"
              >
                <p className="break-words text-sm font-medium">{displayName || entry.label}</p>
                {displayName ? (
                  <p className="text-xs text-muted-foreground">
                    (Original: {entry.label.length > 40 ? entry.label.slice(0, 37) + '…' : entry.label})
                  </p>
                ) : null}
                <p className="text-xs text-muted-foreground mt-1">Klicken zum bearbeiten</p>
              </div>
            )}
          </div>

          {/* Details table */}
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-4">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Betrag</span>
              <span className="font-mono font-semibold">{formatEuro(entry.amount)}</span>
            </div>

            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Kategorie</span>
              <span className="font-medium">{category.label}</span>
            </div>

            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Rhythmus</span>
              <span className="font-medium">{INTERVAL_LABELS[entry.interval]}</span>
            </div>

            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Fällig am</span>
              <span className="font-mono">{formatDateDe(entry.expectedDate)}</span>
            </div>

            {entry.confidence < 1 ? (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Konfidenz</span>
                <span className="font-mono">
                  {Math.round(entry.confidence * 100)}%
                </span>
              </div>
            ) : null}

            {isRare ? (
              <div className="flex items-center gap-2 rounded-md border border-amber-200/50 bg-amber-50/30 px-3 py-2 text-xs text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                <span>
                  Diese Zahlung fällt nur {INTERVAL_LABELS[entry.interval].toLowerCase()} an.
                  Sie erklärt, warum dieser Monat teurer ausfällt.
                </span>
              </div>
            ) : null}
          </div>

          {/* Empfänger */}
          {series ? (
            <div className="flex flex-col gap-2 border-t border-border pt-4">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Empfänger
              </span>
              <p className="text-sm font-medium">{series.counterparty}</p>
              {series.transactions[0]?.bookingText ? (
                <p className="text-xs text-muted-foreground">
                  {series.transactions[0].bookingText}
                </p>
              ) : null}
            </div>
          ) : null}

          {/* Recent transactions */}
          {recentTransactions.length > 0 ? (
            <div className="flex flex-col gap-3 border-t border-border pt-4">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Letzte Buchungen
              </span>
              <div className="overflow-x-auto">
                <Table className="text-xs">
                  <TableHeader>
                    <TableRow className="border-muted-foreground/20 hover:bg-transparent">
                      <TableHead className="h-auto py-1 px-2 text-muted-foreground font-medium">
                        Datum
                      </TableHead>
                      <TableHead className="h-auto py-1 px-2 text-right text-muted-foreground font-medium">
                        Betrag
                      </TableHead>
                      <TableHead className="h-auto py-1 px-2 text-muted-foreground font-medium">
                        Zweck
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentTransactions.map((tx) => (
                      <TableRow key={tx.id} className="border-muted-foreground/10 hover:bg-muted/50">
                        <TableCell className="py-1.5 px-2 font-mono text-muted-foreground">
                          {formatDateDe(tx.date).slice(0, 10)}
                        </TableCell>
                        <TableCell className="py-1.5 px-2 text-right font-mono font-semibold">
                          {formatEuro(Math.abs(tx.amount))}
                        </TableCell>
                        <TableCell className="py-1.5 px-2 max-w-xs truncate text-muted-foreground">
                          <span title={tx.purpose}>{cleanPurpose(tx.purpose)}</span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : null}

          {/* Reset button */}
          {displayName && !isEditing ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              className="gap-2"
            >
              <TrashIcon className="size-4" />
              Name zurücksetzen
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
