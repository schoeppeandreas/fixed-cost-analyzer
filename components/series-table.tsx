'use client'

import { useMemo, useState } from 'react'
import {
  AlertTriangleIcon,
  CheckIcon,
  EyeOffIcon,
  PencilIcon,
  SearchIcon,
} from 'lucide-react'
import { AmountDecisionDialog } from '@/components/amount-decision-dialog'
import { IntervalEditDialog } from '@/components/interval-edit-dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatDateDe, formatEuro, INTERVAL_LABELS } from '@/lib/analyzer'
import type { Category, Series } from '@/lib/types'
import { cn } from '@/lib/utils'

type SeriesTableProps = {
  series: Series[]
  categories: Category[]
  userIntervals?: Record<string, string>
  onCategoryChange: (seriesKey: string, categoryId: string) => void
  onAmountChange: (seriesKey: string, amount: number | null) => void
  onIntervalChange?: (seriesKey: string, interval: string | null) => void
  onToggleExcluded: (seriesKey: string) => void
  onToggleConfirmed: (seriesKey: string) => void
}

type FilterMode = 'all' | 'review' | 'irregular' | 'monthly' | 'periodic' | 'excluded'

/** Kurzer Hinweistext für die Badge in der Tabelle. */
const REVIEW_BADGE_TEXT: Record<string, string> = {
  lastIsOutlier: 'Betrag prüfen',
  recentOutlier: 'Betrag prüfen',
  rising: 'gestiegen',
  falling: 'gesunken',
  volatile: 'schwankend',
}

/**
 * Kennzeichnet Serien, die NICHT in die Fixkosten-Prognose einfließen,
 * mit ihrem tatsächlichen Bucket. Fixkosten bleiben ohne Badge.
 */
function bucketBadge(categoryId: string, categories: Category[]) {
  const bucket = categories.find((category) => category.id === categoryId)?.bucket
  if (!bucket || bucket === 'fixed') return null
  const label =
    bucket === 'income' ? 'Eingang' : bucket === 'ignored' ? 'ignoriert' : 'variabel'
  return (
    <Badge variant="outline" className="text-[10px]">
      {label}
    </Badge>
  )
}

export function SeriesTable({
  series,
  categories,
  userIntervals = {},
  onCategoryChange,
  onAmountChange,
  onIntervalChange,
  onToggleExcluded,
  onToggleConfirmed,
}: SeriesTableProps) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<FilterMode>('all')
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editingInterval, setEditingInterval] = useState<string | null>(null)

  const reviewCount = useMemo(
    () => series.filter((item) => item.status === 'active' && item.needsAmountReview).length,
    [series],
  )

  const irregularCount = useMemo(
    () =>
      series.filter(
        (item) => item.status === 'active' && !item.excluded && item.interval === 'irregular',
      ).length,
    [series],
  )

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return series
      .filter((item) => item.status === 'active')
      .filter((item) => {
        if (filter === 'review') return item.needsAmountReview
        if (filter === 'irregular') return !item.excluded && item.interval === 'irregular'
        if (filter === 'monthly') return item.interval === 'monthly'
        if (filter === 'periodic')
          return item.interval !== 'monthly' && item.interval !== 'irregular'
        if (filter === 'excluded') return item.excluded
        return true
      })
      .filter((item) => {
        if (!needle) return true
        return (
          item.label.toLowerCase().includes(needle) ||
          item.counterparty.toLowerCase().includes(needle)
        )
      })
      .sort((a, b) => {
        if (a.excluded !== b.excluded) return a.excluded ? 1 : -1
        // Zu prüfende Serien nach oben, damit sie nicht übersehen werden
        if (a.needsAmountReview !== b.needsAmountReview) return a.needsAmountReview ? -1 : 1
        return b.forecastAmount - a.forecastAmount
      })
  }, [series, query, filter])

  return (
    <div className="flex flex-col gap-4">
      {irregularCount > 0 ? (
        <Alert className="border-orange-200 bg-orange-50">
          <AlertTriangleIcon className="text-orange-600" />
          <AlertTitle className="text-orange-900">
            {irregularCount === 1
              ? '1 unregelmäßige Zahlung'
              : `${irregularCount} unregelmäßige Zahlungen`}
          </AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-2 text-orange-800">
            <p className="text-pretty leading-relaxed">
              Diese Serien haben unregelmäßige Abstände und tauchen daher nicht in der Prognose
              auf. Beispiele: unterschiedliche KFZ-Steuern für mehrere Fahrzeuge, Versicherungen
              mit variablen Terminen, oder einmalige Zahlungen. Du kannst sie hier ausschließen.
            </p>
            {filter !== 'irregular' ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFilter('irregular')}
                className="border-orange-300 bg-transparent text-orange-900 hover:bg-orange-100 hover:text-orange-900"
              >
                Nur diese anzeigen
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {reviewCount > 0 ? (
        <Alert>
          <AlertTriangleIcon />
          <AlertTitle>
            {reviewCount === 1
              ? '1 Serie mit auffälligem Betrag'
              : `${reviewCount} Serien mit auffälligem Betrag`}
          </AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-2">
            <p className="text-pretty leading-relaxed">
              Einmal-Effekte wie Jahresabrechnungen sind bereits aus der Prognose
              herausgerechnet. Prüfe, ob der Betrag stimmt, mit dem weitergerechnet wird.
            </p>
            {filter !== 'review' ? (
              <Button variant="outline" size="sm" onClick={() => setFilter('review')}>
                Nur diese anzeigen
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <InputGroup className="sm:max-w-xs">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            placeholder="Empfänger suchen"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Empfänger suchen"
          />
        </InputGroup>

        <ToggleGroup
          value={[filter]}
          onValueChange={(value) => {
            const next = value[0] as FilterMode | undefined
            if (next) setFilter(next)
          }}
          variant="outline"
          size="sm"
        >
          <ToggleGroupItem value="all">Alle</ToggleGroupItem>
          <ToggleGroupItem value="review" disabled={reviewCount === 0}>
            Zu prüfen{reviewCount > 0 ? ` (${reviewCount})` : ''}
          </ToggleGroupItem>
          <ToggleGroupItem value="irregular" disabled={irregularCount === 0}>
            Unregelmäßig{irregularCount > 0 ? ` (${irregularCount})` : ''}
          </ToggleGroupItem>
          <ToggleGroupItem value="monthly">Monatlich</ToggleGroupItem>
          <ToggleGroupItem value="periodic">Periodisch</ToggleGroupItem>
          <ToggleGroupItem value="excluded">Ausgeschlossen</ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Empfänger</TableHead>
              <TableHead>Kategorie</TableHead>
              <TableHead>Intervall</TableHead>
              <TableHead className="text-right">Prognose je Zahlung</TableHead>
              <TableHead className="text-right">Buchungen</TableHead>
              <TableHead>Letzte</TableHead>
              <TableHead className="text-right">Aktion</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  Keine Serien für diesen Filter.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((item) => (
                <TableRow
                  key={item.key}
                  className={cn(item.excluded && 'opacity-50')}
                  data-state={item.confirmed ? 'selected' : undefined}
                >
                  <TableCell className="max-w-[220px]">
                    <div className="flex flex-col gap-1">
                      <span className="truncate font-medium" title={item.counterparty}>
                        {item.label}
                      </span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {item.needsAmountReview && item.reviewReason ? (
                          <Badge
                            variant={
                              item.reviewReason === 'lastIsOutlier' ||
                              item.reviewReason === 'recentOutlier'
                                ? 'destructive'
                                : 'outline'
                            }
                            className="gap-1 text-[10px]"
                          >
                            <AlertTriangleIcon className="size-3" />
                            {REVIEW_BADGE_TEXT[item.reviewReason]}
                          </Badge>
                        ) : null}
                        {bucketBadge(item.categoryId, categories)}
                      </div>
                    </div>
                  </TableCell>

                  <TableCell>
                    <Select
                      value={item.categoryId}
                      onValueChange={(value) => onCategoryChange(item.key, String(value))}
                    >
                      <SelectTrigger size="sm" className="w-[190px]">
                        <SelectValue>
                          {(value: string) =>
                            categories.find((category) => category.id === value)?.label ?? value
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {categories.map((category) => (
                            <SelectItem key={category.id} value={category.id}>
                              {category.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </TableCell>

                  <TableCell>
                    <button
                      onClick={() => setEditingInterval(item.key)}
                      className="flex cursor-pointer flex-col gap-1 rounded px-1 py-0.5 transition-colors hover:bg-muted"
                    >
                      <span className="text-sm font-medium">{INTERVAL_LABELS[item.interval]}</span>
                      {userIntervals[item.key] && (
                        <span className="text-xs font-semibold text-orange-600">von dir gesetzt</span>
                      )}
                      {!userIntervals[item.key] && (
                        <span className="text-xs text-muted-foreground">
                          {item.intervalConfidence >= 0.7
                            ? 'hohe Sicherheit'
                            : item.intervalConfidence >= 0.4
                              ? 'mittel'
                              : 'gering'}
                        </span>
                      )}
                    </button>
                  </TableCell>

                  <TableCell className="text-right">
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingKey(item.key)}
                            className={cn(
                              'h-auto flex-col items-end gap-0.5 px-2 py-1 font-mono tabular-nums',
                              item.needsAmountReview && 'text-foreground',
                            )}
                          >
                            <span className="flex items-center gap-1.5 text-sm font-medium">
                              {formatEuro(item.forecastAmount)}
                              <PencilIcon className="size-3 text-muted-foreground" />
                            </span>
                            {item.forecastAmountSource === 'user' ? (
                              <span className="font-sans text-[10px] font-normal text-muted-foreground">
                                von dir gesetzt
                              </span>
                            ) : item.outliers.length > 0 ? (
                              <span className="font-sans text-[10px] font-normal text-muted-foreground">
                                {item.outliers.length} Einmal-Effekt
                                {item.outliers.length > 1 ? 'e' : ''} ignoriert
                              </span>
                            ) : null}
                          </Button>
                        }
                      />
                      <TooltipContent>Prognosebetrag festlegen</TooltipContent>
                    </Tooltip>
                  </TableCell>

                  <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                    {item.occurrences}
                  </TableCell>

                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {formatDateDe(item.lastDate)}
                  </TableCell>

                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              variant={item.confirmed ? 'default' : 'ghost'}
                              size="icon-sm"
                              onClick={() => onToggleConfirmed(item.key)}
                              aria-label={
                                item.confirmed ? 'Bestätigung aufheben' : 'Serie bestätigen'
                              }
                            >
                              <CheckIcon />
                            </Button>
                          }
                        />
                        <TooltipContent>
                          {item.confirmed ? 'Bestätigung aufheben' : 'Als korrekt bestätigen'}
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => onToggleExcluded(item.key)}
                              aria-label={
                                item.excluded
                                  ? 'In Prognose aufnehmen'
                                  : 'Aus Prognose ausschließen'
                              }
                            >
                              <EyeOffIcon />
                            </Button>
                          }
                        />
                        <TooltipContent>
                          {item.excluded
                            ? 'Wieder in Prognose aufnehmen'
                            : 'Aus Prognose ausschließen'}
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <AmountDecisionDialog
        series={rows.find((item) => item.key === editingKey) ?? null}
        open={editingKey !== null}
        onOpenChange={(next) => {
          if (!next) setEditingKey(null)
        }}
        onConfirm={onAmountChange}
      />

      {editingInterval ? (
        <IntervalEditDialog
          seriesKey={editingInterval}
          series={rows.find((item) => item.key === editingInterval) ?? null}
          open={editingInterval !== null}
          onOpenChange={(next) => {
            if (!next) setEditingInterval(null)
          }}
          onConfirm={onIntervalChange || (() => {})}
        />
      ) : null}
    </div>
  )
}
