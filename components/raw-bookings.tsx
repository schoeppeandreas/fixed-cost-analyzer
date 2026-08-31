'use client'

import { useMemo, useState } from 'react'
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon, SearchIcon, ShoppingCartIcon, ShuffleIcon, XIcon } from 'lucide-react'
import type { Category, Series, Transaction } from '@/lib/types'
import { formatEuro, INTERVAL_LABELS } from '@/lib/analyzer'
import { categorize } from '@/lib/categories'
import { cn } from '@/lib/utils'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export function RawBookings({ transactions, categories, series, userIntervals, seriesCategories, transactionCategories, onCategoryChange, onSeriesCategoryChange, onGroceriesToggle, onVariableChange, onSeriesVariableChange }: { transactions: Transaction[]; categories: Category[]; series: Series[]; userIntervals: Record<string, string>; seriesCategories: Record<string, string>; transactionCategories: Record<string, string>; onCategoryChange: (transactionId: string, categoryId: string | null) => void; onSeriesCategoryChange?: (seriesKey: string, categoryId: string) => void; onGroceriesToggle?: (seriesKey: string) => void; onVariableChange?: (transactionId: string) => void; onSeriesVariableChange?: (seriesKey: string) => void }) {
  const [query, setQuery] = useState('')
  const [categoryFilters, setCategoryFilters] = useState<string[]>([])
  const [bucketFilters, setBucketFilters] = useState<string[]>([])
  const buckets = [
    { id: 'fixed', label: 'Fixkosten' },
    { id: 'variable', label: 'Variable Kosten' },
    { id: 'income', label: 'Eingänge' },
    { id: 'ignored', label: 'Umbuchungen' },
  ]

  const categoryLabel = (category: Category) => category.label
  const seriesByTransactionId = useMemo(() => {
    const lookup = new Map<string, Series>()
    for (const entry of series) {
      for (const transaction of entry.transactions) lookup.set(transaction.id, entry)
    }
    return lookup
  }, [series])
  const seriesFor = (transaction: Transaction) => seriesByTransactionId.get(transaction.id)
  const categoryByTransactionId = useMemo(() => {
    const lookup = new Map<string, string>()
    for (const transaction of transactions) {
      const linkedSeries = seriesFor(transaction)
      lookup.set(
        transaction.id,
        (linkedSeries && seriesCategories[linkedSeries.key]) ?? transactionCategories[transaction.id] ?? categorize(
          transaction.counterparty,
          transaction.purpose,
          transaction.bookingText,
          transaction.amount,
          categories,
        ),
      )
    }
    return lookup
  }, [transactions, seriesCategories, transactionCategories, categories, seriesByTransactionId])
  const categoryFor = (transaction: Transaction) => categoryByTransactionId.get(transaction.id) ?? 'uncategorized'
  const categoryBucketById = useMemo(() => new Map(categories.map((category) => [category.id, category.bucket])), [categories])
  const bucketByTransactionId = useMemo(() => {
    const lookup = new Map<string, string>()
    for (const transaction of transactions) {
      const categoryId = categoryFor(transaction)
      lookup.set(transaction.id, categoryBucketById.get(categoryId) ?? (categoryId === 'income' ? 'income' : ''))
    }
    return lookup
  }, [transactions, categoryByTransactionId, categoryBucketById])
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const transaction of transactions) {
      const categoryId = categoryFor(transaction)
      counts.set(categoryId, (counts.get(categoryId) ?? 0) + 1)
    }
    return counts
  }, [transactions, categoryByTransactionId])
  const bucketCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const bucket of bucketByTransactionId.values()) counts.set(bucket, (counts.get(bucket) ?? 0) + 1)
    return counts
  }, [bucketByTransactionId])
  const [sort, setSort] = useState<{ key: 'date' | 'amount' | 'counterparty'; ascending: boolean }>({ key: 'date', ascending: false })
  const sortBy = (key: 'date' | 'amount' | 'counterparty', label: string) => {
    const active = sort.key === key
    const Icon = active ? (sort.ascending ? ArrowUpIcon : ArrowDownIcon) : ArrowUpDownIcon
    return <button type="button" className="inline-flex items-center gap-1 hover:text-primary" onClick={() => setSort((current) => current.key === key ? { key, ascending: !current.ascending } : { key, ascending: true })} aria-label={`${label} sortieren`}>
      {label}<Icon className="size-4" aria-hidden="true" />
    </button>
  }
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return [...transactions]
      .filter((transaction) => {
        const matchesQuery = !needle || `${transaction.date} ${transaction.counterparty} ${transaction.purpose} ${transaction.bookingText}`.toLowerCase().includes(needle)
        const categoryId = categoryFor(transaction)
        const bucket = bucketByTransactionId.get(transaction.id)
        return matchesQuery &&
          (categoryFilters.length === 0 || categoryFilters.includes(categoryId)) &&
          (bucketFilters.length === 0 || bucketFilters.includes(bucket ?? ''))
      })
      .sort((a, b) => {
        const comparison = sort.key === 'date' ? a.date.localeCompare(b.date) : sort.key === 'amount' ? a.amount - b.amount : (a.counterparty || '').localeCompare(b.counterparty || '', 'de')
        return sort.ascending ? comparison : -comparison
      })
  }, [transactions, query, sort, categoryFilters, bucketFilters, bucketByTransactionId, categoryByTransactionId])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <InputGroup className="max-w-md">
          <InputGroupAddon><SearchIcon /></InputGroupAddon>
          <InputGroupInput placeholder="Originalbuchungen suchen" value={query} onChange={(event) => setQuery(event.target.value)} />
        </InputGroup>
      </div>
      <div className="flex max-h-32 flex-wrap content-start gap-1.5 overflow-y-auto pr-1" aria-label="Nach Kategorien filtern">
        <button type="button" onClick={() => setCategoryFilters([])} className={cn('min-h-11 rounded-full border px-2.5 py-2 text-sm', categoryFilters.length === 0 ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:bg-muted')}>
          Alle Kategorien ({transactions.length})
        </button>
        {categories
          .filter((category) => (categoryCounts.get(category.id) ?? 0) > 0)
          .sort((a, b) => categoryLabel(a).localeCompare(categoryLabel(b), 'de'))
          .map((category) => {
            const count = categoryCounts.get(category.id) ?? 0
            const selected = categoryFilters.includes(category.id)
            return (
              <button key={category.id} type="button" aria-pressed={selected} onClick={() => setCategoryFilters((current) => selected ? current.filter((id) => id !== category.id) : [...current, category.id])} className={cn('min-h-11 rounded-full border px-2.5 py-2 text-sm', selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:bg-muted')}>
                {categoryLabel(category)} ({count})
              </button>
            )
          })}
      </div>
      <div className="flex flex-wrap gap-1.5" aria-label="Nach Kostenarten filtern">
        {buckets.map((bucket) => {
          const count = bucketCounts.get(bucket.id) ?? 0
          if (count === 0) return null
          const selected = bucketFilters.includes(bucket.id)
          return (
            <button key={bucket.id} type="button" aria-pressed={selected} onClick={() => setBucketFilters((current) => selected ? current.filter((id) => id !== bucket.id) : [...current, bucket.id])} className={cn('min-h-11 rounded-md border px-3 py-2 text-sm', selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:bg-muted')}>
              {bucket.label} ({count})
            </button>
          )
        })}
      </div>
      {query.trim() ? (
        <div className="flex flex-wrap items-center gap-2" aria-label="Aktive Filter">
          <span className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-muted px-3 text-sm">
            Empfänger: {query.trim()}
            <button type="button" className="inline-flex size-7 items-center justify-center rounded-full hover:bg-background" onClick={() => setQuery('')} aria-label="Empfängerfilter entfernen" title="Empfängerfilter entfernen">
              <XIcon className="size-4" aria-hidden="true" />
            </button>
          </span>
        </div>
      ) : null}
      <div className="overflow-x-auto rounded-md border border-border">
          <Table className="w-max min-w-[72rem] table-auto text-sm">
          <colgroup>
            <col className="w-28" />
            <col className="w-32" />
            <col className="w-56" />
            <col className="w-80" />
            <col className="w-40" />
            <col className="w-64" />
            <col className="w-64" />
          </colgroup>
          <TableHeader><TableRow><TableHead className="whitespace-normal break-words">{sortBy('date', 'Datum')}</TableHead><TableHead className="whitespace-normal break-words">{sortBy('amount', 'Betrag')}</TableHead><TableHead className="whitespace-normal break-words">{sortBy('counterparty', 'Empfänger')}</TableHead><TableHead className="whitespace-normal break-words">Serie & Aktion</TableHead><TableHead className="whitespace-nowrap">Serienintervall</TableHead><TableHead className="whitespace-normal break-words">Verwendungszweck</TableHead><TableHead className="whitespace-normal break-words">Buchungstext</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.map((transaction, index) => (
              <TableRow key={`${transaction.date}-${transaction.amount}-${index}`}>
                <TableCell className="whitespace-normal break-words align-top font-mono text-xs leading-5">{transaction.date}</TableCell>
                <TableCell className="whitespace-normal break-words align-top text-right font-mono text-xs tabular-nums leading-5">{formatEuro(transaction.amount)}</TableCell>
                <TableCell className="min-w-0 max-w-full overflow-hidden whitespace-normal break-words align-top">
                  <button
                    type="button"
                    className="block w-full min-w-0 max-w-full overflow-hidden whitespace-normal break-words text-left [overflow-wrap:anywhere] hover:text-primary hover:underline hover:underline-offset-2"
                    title={`Nur ${transaction.counterparty || 'diesen Empfänger'} anzeigen`}
                    onClick={() => setQuery(transaction.counterparty || '')}
                  >
                    {transaction.counterparty || '—'}
                  </button>
                </TableCell>
                <TableCell className="w-[22rem] min-w-[22rem] max-w-[22rem] overflow-hidden whitespace-normal break-words align-top">
                  <div className="flex min-w-0 max-w-full flex-col gap-2 overflow-visible">
                    <span className="block min-w-0 max-w-full overflow-hidden whitespace-normal break-words [overflow-wrap:anywhere]">{seriesFor(transaction)?.label ?? 'Keine Serie'}</span>
                    <div className="flex w-[22rem] flex-wrap items-center gap-2 overflow-visible">
                      <Select value={categoryFor(transaction)} onValueChange={(value) => {
                          const linkedSeries = seriesFor(transaction)
                          if (linkedSeries && value) onSeriesCategoryChange?.(linkedSeries.key, value)
                          else onCategoryChange(transaction.id, value)
                        }}>
                        <SelectTrigger className="min-h-11 w-56 min-w-56 max-w-56" aria-label={`Kategorie für ${transaction.counterparty || 'Buchung'}`}>
                          <SelectValue>
                            {categories.find((category) => category.id === categoryFor(transaction))?.label ?? categoryFor(transaction)}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {categories.map((category) => (
                            <SelectItem key={category.id} value={category.id}>{categoryLabel(category)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <button type="button" className={cn('inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border', categoryFor(transaction) === 'groceries' ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted')} onClick={() => {
                          const linkedSeries = seriesFor(transaction)
                          if (linkedSeries) onGroceriesToggle?.(linkedSeries.key)
                          else onCategoryChange(transaction.id, 'groceries')
                        }} aria-label="Als Lebensmittel markieren" title="Als Lebensmittel markieren">
                        <ShoppingCartIcon className="size-5" aria-hidden="true" />
                      </button>
                      <button type="button" className={cn('inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border', seriesFor(transaction) && userIntervals[seriesFor(transaction)!.key] === 'irregular' ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted')} onClick={() => {
                          const linkedSeries = seriesFor(transaction)
                          if (linkedSeries) onSeriesVariableChange?.(linkedSeries.key)
                          else onVariableChange?.(transaction.id)
                        }} aria-label="Als variable Kosten markieren" title="Als variable Kosten markieren">
                        <ShuffleIcon className="size-5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="min-w-0 max-w-full overflow-hidden whitespace-normal break-words align-top">{seriesFor(transaction) ? INTERVAL_LABELS[userIntervals[seriesFor(transaction)!.key] as keyof typeof INTERVAL_LABELS] ?? INTERVAL_LABELS[seriesFor(transaction)!.interval] : '—'}</TableCell>
                <TableCell className="min-w-0 max-w-full overflow-hidden whitespace-normal break-words align-top text-muted-foreground [overflow-wrap:anywhere]">{transaction.purpose || '—'}</TableCell>
                <TableCell className="min-w-0 max-w-full overflow-hidden whitespace-normal break-words align-top text-muted-foreground [overflow-wrap:anywhere]">{transaction.bookingText || '—'}</TableCell>
              </TableRow>
            ))}
            {!rows.length ? <TableRow><TableCell colSpan={7} className="py-12 text-center text-muted-foreground">Keine Buchungen gefunden</TableCell></TableRow> : null}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">{rows.length} von {transactions.length} Originalbuchungen</p>
    </div>
  )
}
