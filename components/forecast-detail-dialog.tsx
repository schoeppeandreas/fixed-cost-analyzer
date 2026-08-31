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

  // Mindestens ein vollständiges Jahr Historie anzeigen, neueste zuerst.
  // Bei kürzeren Serien werden alle vorhandenen Buchungen dargestellt.
  const recentTransactions = (() => {
    if (!series?.transactions.length) return []
    const sorted = [...series.transactions].sort((a, b) => b.date.localeCompare(a.date))
    const newest = new Date(`${sorted[0].date}T00:00:00Z`)
    const yearAgo = new Date(newest)
    yearAgo.setUTCFullYear(yearAgo.getUTCFullYear() - 1)
    return sorted.filter((transaction) => new Date(`${transaction.date}T00:00:00Z`) >= yearAgo)
  })()

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

            {entry.purpose ? (
              <div className="flex flex-col gap-1 text-sm">
                <span className="text-muted-foreground">Verwendungszweck der Referenzbuchung</span>
                <span className="break-words text-right text-foreground">{cleanPurpose(entry.purpose)}</span>
              </div>
            ) : null}

            {entry.confidence < 1 ? (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Konfidenz</span>
                <span className="font-mono">
                  {Math.round(entry.confidence * 100)}%
                </span>
              </div>
            ) : null}

            {series?.transactions.length ? (() => {
              const paymentCount = series.transactions.length
              const paymentTotal = series.transactions.reduce(
                (sum, transaction) => sum + Math.abs(transaction.amount),
                0,
              )
              const firstDate = new Date(`${series.firstDate}T00:00:00Z`)
              const since = `${firstDate.getUTCMonth() + 1}/${String(firstDate.getUTCFullYear()).slice(-2)}`

              return (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    Gesamtsumme aller Zahlungen ({paymentCount}x seit {since})
                  </span>
                  <span className="font-mono font-semibold">
                    {formatEuro(paymentTotal)}
                  </span>
                </div>
              )
            })() : null}

            {isRare ? (
              <div className="flex items-center gap-2 rounded-md border border-amber-500/60 bg-amber-500/15 px-3 py-2 text-xs leading-relaxed text-foreground">
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
                        <TableCell className="py-1.5 px-2 max-w-[24rem] text-muted-foreground">
                          <span className="break-words" title={tx.purpose}>
                            {cleanPurpose(tx.purpose)}
                          </span>
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
