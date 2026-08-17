'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangleIcon, TrendingDownIcon, TrendingUpIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Label } from '@/components/ui/label'
import { formatDateDe, formatEuro, INTERVAL_LABELS } from '@/lib/analyzer'
import type { Series } from '@/lib/types'
import { cn } from '@/lib/utils'

type AmountDecisionDialogProps = {
  series: Series | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (seriesKey: string, amount: number | null) => void
}

/** Erklärt in einem Satz, warum diese Serie geprüft werden sollte. */
function reviewText(item: Series): string {
  const last = item.outliers[0]
  switch (item.reviewReason) {
    case 'lastIsOutlier':
      return `Die letzte Buchung über ${formatEuro(last?.amount ?? 0)} weicht stark vom typischen Betrag ab – das sieht nach einer Abrechnung oder Nachzahlung aus. Die Prognose rechnet deshalb weiter mit dem üblichen Betrag.`
    case 'recentOutlier':
      return `Vor kurzem gab es eine Buchung über ${formatEuro(last?.amount ?? 0)}, die vom typischen Betrag abweicht. Sie ist als Einmal-Effekt aus der Prognose ausgenommen.`
    case 'rising':
      return 'Der Betrag ist dauerhaft gestiegen. Die Prognose nutzt das neue Niveau.'
    case 'falling':
      return 'Der Betrag ist dauerhaft gesunken. Die Prognose nutzt das neue Niveau.'
    case 'volatile':
      return 'Der Betrag schwankt deutlich. Die Prognose nutzt den typischen Wert der letzten Buchungen.'
    default:
      return 'Lege fest, mit welchem Betrag die Prognose für diese Serie weiterrechnen soll.'
  }
}

export function AmountDecisionDialog({
  series,
  open,
  onOpenChange,
  onConfirm,
}: AmountDecisionDialogProps) {
  const [value, setValue] = useState('')

  // Beim Öffnen den aktuell wirksamen Betrag vorbelegen
  useEffect(() => {
    if (open && series) {
      setValue(series.forecastAmount.toFixed(2).replace('.', ','))
    }
  }, [open, series])

  /** Die letzten Buchungen als Verlauf, neueste zuerst. */
  const history = useMemo(() => {
    if (!series) return []
    const outlierDates = new Set(series.outliers.map((o) => o.date))
    const byDate = new Map<string, number>()
    for (const tx of series.transactions) {
      byDate.set(tx.date, (byDate.get(tx.date) ?? 0) + Math.abs(tx.amount))
    }
    return [...byDate.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 8)
      .map(([date, amount]) => ({ date, amount, isOutlier: outlierDates.has(date) }))
  }, [series])

  if (!series) return null

  const parsed = Number.parseFloat(value.replace(/\./g, '').replace(',', '.'))
  const isValid = Number.isFinite(parsed) && parsed >= 0

  const handleConfirm = () => {
    if (!isValid) return
    onConfirm(series.key, parsed)
    onOpenChange(false)
  }

  const suggestions = [
    { label: 'Typischer Betrag', amount: series.medianAmount },
    { label: 'Letzte Buchung', amount: series.lastAmount },
  ].filter(
    (suggestion, index, list) =>
      suggestion.amount > 0 &&
      list.findIndex((other) => Math.abs(other.amount - suggestion.amount) < 0.01) === index,
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-pretty">{series.label}</DialogTitle>
          <DialogDescription className="text-pretty leading-relaxed">
            {reviewText(series)}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary">{INTERVAL_LABELS[series.interval]}</Badge>
            <span>{series.occurrences} Buchungen</span>
            <span>seit {formatDateDe(series.firstDate)}</span>
            {series.amountTrend !== 'stable' ? (
              <span className="flex items-center gap-1">
                {series.amountTrend === 'rising' ? (
                  <TrendingUpIcon className="size-3.5" />
                ) : (
                  <TrendingDownIcon className="size-3.5" />
                )}
                {series.amountTrend === 'rising' ? 'steigend' : 'fallend'}
              </span>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              Bisherige Buchungen
            </span>
            <ul className="flex flex-col gap-1">
              {history.map((entry) => (
                <li
                  key={entry.date}
                  className={cn(
                    'flex items-center justify-between rounded-md px-2.5 py-1.5 text-sm',
                    entry.isOutlier
                      ? 'bg-destructive/10 text-foreground'
                      : 'odd:bg-muted/40',
                  )}
                >
                  <span className="flex items-center gap-2">
                    {formatDateDe(entry.date)}
                    {entry.isOutlier ? (
                      <Badge variant="outline" className="gap-1 text-[10px]">
                        <AlertTriangleIcon className="size-3" />
                        Einmal-Effekt
                      </Badge>
                    ) : null}
                  </span>
                  <span className="font-mono tabular-nums">{formatEuro(entry.amount)}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-2.5">
            <Label htmlFor="forecast-amount">Prognose rechnet weiter mit</Label>
            <InputGroup>
              <InputGroupInput
                id="forecast-amount"
                inputMode="decimal"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                    event.preventDefault()
                    handleConfirm()
                  }
                }}
                className="font-mono tabular-nums"
                aria-invalid={!isValid}
              />
              <InputGroupAddon align="inline-end">EUR</InputGroupAddon>
            </InputGroup>

            <div className="flex flex-wrap gap-2">
              {suggestions.map((suggestion) => (
                <Button
                  key={suggestion.label}
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setValue(suggestion.amount.toFixed(2).replace('.', ','))
                  }
                >
                  {suggestion.label}: {formatEuro(suggestion.amount)}
                </Button>
              ))}
              <Button variant="outline" size="sm" onClick={() => setValue('0,00')}>
                Läuft aus (0 EUR)
              </Button>
            </div>
            {!isValid ? (
              <p className="text-xs text-destructive">
                Bitte einen Betrag wie 135,00 eingeben.
              </p>
            ) : null}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {series.forecastAmountSource === 'user' ? (
            <Button
              variant="ghost"
              onClick={() => {
                onConfirm(series.key, null)
                onOpenChange(false)
              }}
            >
              Automatik wiederherstellen
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <DialogClose render={<Button variant="outline">Abbrechen</Button>} />
            <Button onClick={handleConfirm} disabled={!isValid}>
              Betrag übernehmen
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
