'use client'

import { ArchiveIcon, RotateCcwIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
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
import type { Category, Series } from '@/lib/types'

type EndedContractsProps = {
  series: Series[]
  categories: Category[]
  onReactivate: (seriesKey: string) => void
}

export function EndedContracts({ series, categories, onReactivate }: EndedContractsProps) {
  const ended = series
    .filter((item) => item.status === 'ended')
    .sort((a, b) => b.lastDate.localeCompare(a.lastDate))

  if (ended.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ArchiveIcon />
          </EmptyMedia>
          <EmptyTitle>Keine beendeten Serien</EmptyTitle>
          <EmptyDescription>
            Alle erkannten wiederkehrenden Buchungen sind noch aktiv.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  const savedPerMonth = ended.reduce((sum, item) => {
    const monthly =
      item.interval === 'monthly'
        ? item.medianAmount
        : item.interval === 'quarterly'
          ? item.medianAmount / 3
          : item.interval === 'annual'
            ? item.medianAmount / 12
            : item.interval === 'semiannual'
              ? item.medianAmount / 6
              : item.interval === 'bimonthly'
                ? item.medianAmount / 2
                : 0
    return sum + monthly
  }, 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1 rounded-lg border border-border bg-muted/40 px-4 py-3">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Diese Serien liefen früher regelmäßig, wurden aber seit längerem nicht mehr
          abgebucht. Sie sind aus der Prognose ausgenommen. Zusammen entsprachen sie einer
          monatlichen Belastung von{' '}
          <span className="font-mono font-medium text-foreground tabular-nums">
            {formatEuro(savedPerMonth)}
          </span>
          .
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Empfänger</TableHead>
              <TableHead>Kategorie</TableHead>
              <TableHead>Intervall</TableHead>
              <TableHead className="text-right">Betrag</TableHead>
              <TableHead>Letzte Buchung</TableHead>
              <TableHead className="text-right">Pause</TableHead>
              <TableHead className="text-right">Aktion</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ended.map((item) => (
              <TableRow key={item.key}>
                <TableCell className="max-w-[220px]">
                  <span className="truncate font-medium" title={item.counterparty}>
                    {item.label}
                  </span>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {getCategory(item.categoryId, categories).label}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{INTERVAL_LABELS[item.interval]}</Badge>
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {formatEuro(item.medianAmount)}
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                  {formatDateDe(item.lastDate)}
                </TableCell>
                <TableCell className="text-right font-mono text-sm tabular-nums text-muted-foreground">
                  {Math.round(item.daysSinceLast / 30)} Mon.
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onReactivate(item.key)}
                  >
                    <RotateCcwIcon data-icon="inline-start" />
                    Reaktivieren
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
