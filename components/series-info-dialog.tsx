'use client'

import { ShoppingCartIcon, Undo2Icon } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { formatDateDe, formatEuro } from '@/lib/analyzer'
import type { Series } from '@/lib/types'

/**
 * Detail-Popup für eine Serie: zeigt Kontodaten, Kennzahlen und alle
 * Einzelbuchungen. Statt einer vollen Kategorieauswahl gibt es nur eine
 * Aktion – die Serie in die Lebensmittelkosten aufnehmen oder wieder
 * daraus entfernen. Wird in der Serientabelle und der Lebensmittelprognose
 * gleichermaßen verwendet.
 */
export function SeriesInfoDialog({
  series,
  open,
  onOpenChange,
  onToggleGroceries,
}: {
  series: Series | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onToggleGroceries: (seriesKey: string) => void
}) {
  const isGroceries = series?.categoryId === 'groceries'
  const transactionsDesc = series
    ? [...series.transactions].sort((a, b) => (a.date < b.date ? 1 : -1))
    : []
  const average = series && series.occurrences > 0 ? series.total / series.occurrences : 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-balance">{series?.label}</DialogTitle>
          <DialogDescription>
            {series?.accountIdentifier
              ? `Konto/Karte: ${series.accountIdentifier}`
              : 'Keine Konto- oder Kartenkennung in den Rohdaten vorhanden.'}
          </DialogDescription>
        </DialogHeader>

        {series ? (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/30 p-3 sm:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">Gesamt</p>
                <p className="font-mono text-sm font-semibold">{formatEuro(series.total)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Ø je Buchung</p>
                <p className="font-mono text-sm font-semibold">{formatEuro(average)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Buchungen</p>
                <p className="font-mono text-sm font-semibold">{series.occurrences}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Zeitraum</p>
                <p className="text-sm font-medium">
                  {formatDateDe(series.firstDate)} – {formatDateDe(series.lastDate)}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-muted-foreground">Einzelbuchungen dieser Serie</p>
              <div className="max-h-64 overflow-y-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <tbody>
                    {transactionsDesc.map((transaction) => (
                      <tr key={transaction.id} className="border-b border-border last:border-b-0">
                        <td className="whitespace-nowrap px-3 py-2 align-top text-muted-foreground">
                          {formatDateDe(transaction.date)}
                        </td>
                        <td className="min-w-0 px-3 py-2 align-top">
                          <span className="line-clamp-2 break-words" title={transaction.purpose}>
                            {transaction.purpose || transaction.bookingText || '—'}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right align-top font-mono">
                          {formatEuro(transaction.amount, true)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <Button
              type="button"
              variant={isGroceries ? 'outline' : 'default'}
              className="w-full gap-2"
              onClick={() => {
                onToggleGroceries(series.key)
                onOpenChange(false)
              }}
            >
              {isGroceries ? (
                <>
                  <Undo2Icon className="size-4" aria-hidden="true" />
                  Aus Lebensmittel entfernen
                </>
              ) : (
                <>
                  <ShoppingCartIcon className="size-4" aria-hidden="true" />
                  Als Lebensmittel markieren
                </>
              )}
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
