'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangleIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  ArrowUpDownIcon,
  CheckIcon,
  EyeOffIcon,
  PencilIcon,
  SearchIcon,
  ShoppingCartIcon,
  XIcon,
  ShuffleIcon,
} from 'lucide-react'
import { AmountDecisionDialog } from '@/components/amount-decision-dialog'
import { IntervalEditDialog } from '@/components/interval-edit-dialog'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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
  onReviewFood?: (seriesKey: string) => void
  onAmountChange: (seriesKey: string, amount: number | null) => void
  onIntervalChange?: (seriesKey: string, interval: string | null) => void
  onToggleExcluded: (seriesKey: string) => void
  onReactivate?: (seriesKey: string) => void
  onToggleConfirmed: (seriesKey: string) => void
}

type FilterMode = 'all' | 'review' | 'irregular' | 'monthly' | 'periodic' | 'excluded' | 'ended'
type SortKey = 'name' | 'category' | 'interval' | 'amount' | 'occurrences' | 'last'
type SortDirection = 'asc' | 'desc'

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
  onReviewFood,
  onAmountChange,
  onIntervalChange,
  onToggleExcluded,
  onReactivate,
  onToggleConfirmed,
}: SeriesTableProps) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<FilterMode>('all')
  const [showVariableCosts, setShowVariableCosts] = useState(false)
  const [showFixedCosts, setShowFixedCosts] = useState(true)
  const [showIncome, setShowIncome] = useState(false)
  const [showTransfers, setShowTransfers] = useState(false)
  const [showEnded, setShowEnded] = useState(false)
  const [categoryFilters, setCategoryFilters] = useState<string[]>([])
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editingCategoryKey, setEditingCategoryKey] = useState<string | null>(null)
  const [editingInterval, setEditingInterval] = useState<string | null>(null)
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({
    key: 'name',
    direction: 'asc',
  })

  const changeSort = (key: SortKey) => {
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' },
    )
  }

  const sortButton = (key: SortKey, label: string, className?: string) => {
    const active = sort.key === key
    const Icon = active
      ? sort.direction === 'asc'
        ? ArrowUpIcon
        : ArrowDownIcon
      : ArrowUpDownIcon
    return (
      <button
        type="button"
        onClick={() => changeSort(key)}
        className={cn(
          'inline-flex items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-muted',
          active && 'text-foreground',
          className,
        )}
        aria-label={`${label} sortieren (${active && sort.direction === 'asc' ? 'aufsteigend' : 'absteigend'})`}
      >
        {label}
        <Icon className="size-3.5 text-muted-foreground" />
      </button>
    )
  }

  const statusCounts = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const matchesVisibleBase = (item: Series) => {
      if (item.status === 'ended') return false
      if (categoryFilters.length > 0 && !categoryFilters.includes(item.categoryId)) return false
      if (needle && !`${item.label} ${item.counterparty}`.toLowerCase().includes(needle)) return false
      const bucket = categories.find((category) => category.id === item.categoryId)?.bucket
      if (bucket === 'variable') return showVariableCosts
      if (bucket === 'fixed') return showFixedCosts
      if (bucket === 'ignored') return showTransfers
      if (item.categoryId === 'income') return showIncome
      return true
    }

    return series.reduce(
      (counts, item) => {
        if (!matchesVisibleBase(item)) return counts
        if (item.needsAmountReview) counts.review += 1
        if (!item.excluded && item.interval === 'irregular') counts.irregular += 1
        return counts
      },
      { review: 0, irregular: 0 },
    )
  }, [series, query, categories, categoryFilters, showVariableCosts, showFixedCosts, showIncome, showTransfers])

  const reviewCount = statusCounts.review
  const irregularCount = statusCounts.irregular

  const categoryLabel = (category: (typeof categories)[number]) => {
    const labels: Record<string, string> = {
      dining: 'Restaurant & Freizeit',
      groceries: 'Lebensmittel & Einkauf',
      shopping: 'Shopping & Sonstiges',
      fuel: 'Tanken & Auto',
      cash: 'Bargeld',
      uncategorized: 'Nicht zugeordnet',
      transfer: 'Umbuchung & Eigenkonto',
      income: 'Einnahmen',
      housing: 'Wohnen & Miete',
      loans: 'Kredite & Darlehen',
      insurance: 'Versicherungen',
      health: 'Krankenkasse & Gesundheit',
      utilities: 'Strom, Gas & Wasser',
      telecom: 'Telefon & Internet',
      subscriptions: 'Abos & Streaming',
      fees: 'Gebühren & Abgaben',
      savings: 'Sparen & Vorsorge',
      transport_fixed: 'Mobilität (fix)',
      childcare: 'Kinder & Bildung',
      other_fixed: 'Sonstige Fixkosten',
    }
    return labels[category.id] ?? category.label
  }

  const maskAccountIdentifier = (value?: string) => {
    if (!value) return null
    const normalized = value.replace(/\s+/g, '')
    if (normalized.length <= 8) return normalized
    return `${normalized.slice(0, 4)}••••${normalized.slice(-4)}`
  }

  const categoryRows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return series
      .filter((item) => {
        if (item.status === 'ended') {
          return filter === 'ended' || (filter === 'all' && showEnded)
        }
        if (filter === 'ended') return false
        const bucket = categories.find((category) => category.id === item.categoryId)?.bucket
        if (filter === 'all') {
          if (bucket === 'variable') return showVariableCosts
          if (bucket === 'fixed') return showFixedCosts
          if (bucket === 'ignored') return showTransfers
          if (item.categoryId === 'income') return showIncome
        }
        return true
      })
      .filter((item) => {
        if (filter === 'review') return item.needsAmountReview
        if (filter === 'irregular') return !item.excluded && item.interval === 'irregular'
        if (filter === 'monthly') return item.interval === 'monthly'
        if (filter === 'periodic') return item.interval !== 'monthly' && item.interval !== 'irregular'
        if (filter === 'excluded') return item.excluded
        return true
      })
      .filter((item) => {
        if (!needle) return true
        return item.label.toLowerCase().includes(needle) || item.counterparty.toLowerCase().includes(needle)
      })
  }, [series, query, filter, categories, showVariableCosts, showFixedCosts, showIncome, showTransfers, showEnded])

  const costFilterCounts = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const visibleForCount = series.filter((item) => {
      if (item.status === 'ended') return showEnded
      if (filter === 'ended') return false
      if (filter === 'review') return item.needsAmountReview
      if (filter === 'irregular') return !item.excluded && item.interval === 'irregular'
      if (filter === 'monthly') return item.interval === 'monthly'
      if (filter === 'periodic') return item.interval !== 'monthly' && item.interval !== 'irregular'
      if (filter === 'excluded') return item.excluded
      if (needle && !`${item.label} ${item.counterparty}`.toLowerCase().includes(needle)) return false
      return true
    })
    return visibleForCount.reduce(
      (counts, item) => {
        const bucket = categories.find((category) => category.id === item.categoryId)?.bucket
        if (bucket === 'fixed') counts.fixed += 1
        else if (bucket === 'variable') counts.variable += 1
        else if (bucket === 'ignored') counts.transfers += 1
        else if (item.categoryId === 'income') counts.income += 1
        return counts
      },
      { fixed: 0, variable: 0, income: 0, transfers: 0, ended: series.filter((item) => item.status === 'ended').length },
    )
  }, [series, categories, query, filter, showEnded])

  const toggleCostFilter = (key: 'fixed' | 'variable' | 'income' | 'transfers' | 'ended') => {
    const current = {
      fixed: showFixedCosts,
      variable: showVariableCosts,
      income: showIncome,
      transfers: showTransfers,
      ended: showEnded,
    }
    const next = { ...current, [key]: !current[key] }
    const hasActiveFilter = Object.entries(next).some(([id, active]) => active && costFilterCounts[id as keyof typeof costFilterCounts] > 0)
    if (hasActiveFilter) {
      setShowFixedCosts(next.fixed)
      setShowVariableCosts(next.variable)
      setShowIncome(next.income)
      setShowTransfers(next.transfers)
      setShowEnded(next.ended)
    } else {
      setShowFixedCosts(true)
      setShowVariableCosts(true)
      setShowIncome(true)
      setShowTransfers(true)
      setShowEnded(true)
    }
  }

  useEffect(() => {
    if (categoryFilters.length === 0) return
    const availableCategoryIds = new Set(categoryRows.map((item) => item.categoryId))
    const hasUnavailableSelection = categoryFilters.some((categoryId) => !availableCategoryIds.has(categoryId))
    if (hasUnavailableSelection) setCategoryFilters([])
  }, [categoryFilters, categoryRows])

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return series
      // Beendete Serien bleiben in derselben Tabelle und werden nur über
      // den eigenen Filter ausgeblendet.
      .filter((item) => {
        // Beendete Serien sind nur in "Alle" und "Beendet" sichtbar.
        if (item.status === 'ended') {
          return filter === 'ended' || (filter === 'all' && showEnded)
        }
        if (filter === 'ended') return false
        if (categoryFilters.length === 0) {
          const bucket = categories.find((category) => category.id === item.categoryId)?.bucket
          if (bucket === 'variable') return showVariableCosts
          if (bucket === 'fixed') return showFixedCosts
          if (bucket === 'ignored') return showTransfers
          if (item.categoryId === 'income') return showIncome
        }
        return true
      })
      .filter((item) => categoryFilters.length === 0 || categoryFilters.includes(item.categoryId))
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
        const direction = sort.direction === 'asc' ? 1 : -1
        switch (sort.key) {
          case 'name': {
            // Standardsortierung: relevante Fixkosten zuerst, danach Name
            // und als Tie-Breaker die letzte Buchung.
            const aIsFixed = categories.find((category) => category.id === a.categoryId)?.bucket === 'fixed'
            const bIsFixed = categories.find((category) => category.id === b.categoryId)?.bucket === 'fixed'
            if (aIsFixed !== bIsFixed) return aIsFixed ? -1 : 1
            const byName = a.label.localeCompare(b.label, 'de', { sensitivity: 'base' })
            if (byName !== 0) return byName * direction
            return a.lastDate.localeCompare(b.lastDate) * direction
          }
          case 'category':
            return (
              (categories.find((category) => category.id === a.categoryId)?.label ?? '').localeCompare(
                categories.find((category) => category.id === b.categoryId)?.label ?? '',
                'de',
                { sensitivity: 'base' },
              ) * direction
            )
          case 'interval':
            return INTERVAL_LABELS[a.interval].localeCompare(INTERVAL_LABELS[b.interval], 'de') * direction
          case 'amount':
            return (a.forecastAmount - b.forecastAmount) * direction
          case 'occurrences':
            return (a.occurrences - b.occurrences) * direction
          case 'last':
            return a.lastDate.localeCompare(b.lastDate) * direction
        }
      })
  }, [series, query, filter, sort, categories, showVariableCosts, showFixedCosts, showIncome, showTransfers, showEnded, categoryFilters])

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

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Empfänger suchen</span>
          <InputGroup className="w-full">
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
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Kategorie</span>
          <div className="flex max-h-72 w-full flex-wrap content-start gap-2 overflow-y-auto pr-1" aria-label="Nach Kategorien filtern">
          <button
            type="button"
            onClick={() => {
              setCategoryFilters([])
              setShowFixedCosts(true)
              setShowVariableCosts(false)
              setShowIncome(false)
              setShowTransfers(false)
              setShowEnded(false)
            }}
            className={cn(
              'min-h-11 rounded-full border px-3 py-2 text-sm transition-colors',
              categoryFilters.length === 0
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border text-muted-foreground hover:bg-muted',
            )}
          >
            Alle Kategorien ({categoryRows.length})
          </button>
          {categories
            .map((category) => ({
              category,
              count: categoryRows.filter((item) => item.categoryId === category.id).length,
            }))
            .filter(({ count }) => count > 0)
            .sort((a, b) => categoryLabel(a.category).localeCompare(categoryLabel(b.category), 'de'))
            .map(({ category, count }) => {
              const selected = categoryFilters.includes(category.id)
              return (
                <button
                  key={category.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    setCategoryFilters((current) => {
                      const next = selected
                        ? current.filter((id) => id !== category.id)
                        : [...current, category.id]
                      const selectedCategories = categories.filter((entry) => next.includes(entry.id))
                      const buckets = new Set(selectedCategories.map((entry) => entry.bucket))
                      setShowFixedCosts(next.length === 0 || buckets.has('fixed'))
                      setShowVariableCosts(next.length === 0 || buckets.has('variable'))
                      setShowIncome(next.length === 0 || next.includes('income'))
                      setShowTransfers(next.length === 0 || buckets.has('ignored'))
                      return next
                    })
                  }}
                  className={cn(
                    'min-h-11 rounded-full border px-3 py-2 text-sm transition-colors',
                    selected
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border text-muted-foreground hover:bg-muted',
                  )}
                >
                  {categoryLabel(category)} ({count})
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Kostenart</span>
          <div className="flex w-full flex-wrap content-start gap-2" aria-label="Kostenarten filtern">
            {[
              { label: 'Fixkosten', count: costFilterCounts.fixed, checked: showFixedCosts, toggle: () => toggleCostFilter('fixed') },
              { label: 'Variable Kosten', count: costFilterCounts.variable, checked: showVariableCosts, toggle: () => toggleCostFilter('variable') },
              { label: 'Eingänge', count: costFilterCounts.income, checked: showIncome, toggle: () => toggleCostFilter('income') },
              { label: 'Umbuchungen', count: costFilterCounts.transfers, checked: showTransfers, toggle: () => toggleCostFilter('transfers') },
              { label: 'Beendete', count: costFilterCounts.ended, checked: showEnded, toggle: () => toggleCostFilter('ended') },
            ].filter(({ count }) => count > 0).map(({ label, count, checked, toggle }) => (
              <Button
                key={label}
                type="button"
                variant={checked ? 'default' : 'outline'}
                size="sm"
                className="min-h-11"
                aria-pressed={checked}
                onClick={toggle}
              >
                {label} ({count})
              </Button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Serienstatus</span>
          <ToggleGroup
          value={[filter]}
          onValueChange={(value) => {
            const next = value[0] as FilterMode | undefined
            setFilter(next ?? 'all')
          }}
          variant="outline"
          size="sm"
          className="flex-1 flex-wrap items-stretch gap-2 overflow-visible"
        >
          <ToggleGroupItem className="min-h-11 whitespace-normal text-center" value="all">Alle ({rows.length}/{series.length})</ToggleGroupItem>
          <ToggleGroupItem className="min-h-11 whitespace-normal text-center" value="review" disabled={reviewCount === 0}>
            Zu prüfen{reviewCount > 0 ? ` (${reviewCount})` : ''}
          </ToggleGroupItem>
          <ToggleGroupItem className="min-h-11 whitespace-normal text-center" value="irregular" disabled={irregularCount === 0}>
            Unregelmäßig{irregularCount > 0 ? ` (${irregularCount})` : ''}
          </ToggleGroupItem>
          <ToggleGroupItem className="min-h-11 whitespace-normal text-center" value="monthly">Monatlich</ToggleGroupItem>
          <ToggleGroupItem className="min-h-11 whitespace-normal text-center" value="periodic">Periodisch</ToggleGroupItem>
          <ToggleGroupItem className="min-h-11 whitespace-normal text-center" value="excluded">Ausgeschlossen</ToggleGroupItem>
          <ToggleGroupItem className="min-h-11 whitespace-normal text-center" value="ended">Beendet</ToggleGroupItem>
        </ToggleGroup>
        </div>
      </div>

      {query.trim() ? (
        <div className="flex flex-wrap items-center gap-2" aria-label="Aktive Filter">
          <Badge variant="secondary" className="min-h-11 gap-2 rounded-full px-3 text-sm">
            Empfänger: {query.trim()}
            <button type="button" className="inline-flex size-7 items-center justify-center rounded-full hover:bg-muted" onClick={() => setQuery('')} aria-label="Empfängerfilter entfernen" title="Empfängerfilter entfernen">
              <XIcon className="size-4" aria-hidden="true" />
            </button>
          </Badge>
        </div>
      ) : null}
      <div className="overflow-hidden rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14 text-right">Nr.</TableHead>
              <TableHead>{sortButton('name', 'Empfänger')}</TableHead>
              <TableHead className="text-center">Variabel</TableHead>
              <TableHead className="text-center">Einkauf</TableHead>
              <TableHead>{sortButton('category', 'Kategorie')}</TableHead>
              <TableHead>{sortButton('interval', 'Intervall')}</TableHead>
              <TableHead className="text-right">{sortButton('amount', 'Prognose je Zahlung', 'ml-auto')}</TableHead>
              <TableHead className="text-right">
                <span title="Durchschnitt der tatsächlichen Zahlungen der letzten 90 Tage">
                  Ø letzte 3 Monate
                </span>
              </TableHead>
              <TableHead className="text-right">{sortButton('occurrences', 'Buchungen', 'ml-auto')}</TableHead>
              <TableHead>{sortButton('last', 'Letzte')}</TableHead>
              <TableHead className="text-right">Aktion</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="py-10 text-center text-muted-foreground">
                  Keine Serien für diesen Filter.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((item, index) => (
                <TableRow
                  key={item.key}
                  className={cn('cursor-pointer transition-colors hover:bg-muted/50', item.excluded && 'opacity-50')}
                  data-state={item.confirmed ? 'selected' : undefined}
                  onClick={(event) => {
                    const target = event.target as HTMLElement
                    if (target.closest('button, [role="button"], input')) return
                    setEditingCategoryKey(item.key)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setEditingCategoryKey(item.key)
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={`${item.label} bearbeiten`}
                >
                  <TableCell className="w-14 text-right font-mono text-sm tabular-nums text-muted-foreground">
                    {index + 1}
                  </TableCell>
                  <TableCell className="max-w-[220px]">
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        className="min-w-0 truncate text-left font-medium hover:text-primary hover:underline hover:underline-offset-2"
                        title={`Nur ${item.label} anzeigen`}
                        onClick={() => setQuery(item.label)}
                      >
                        {item.label}
                      </button>
                      {item.accountIdentifier ? (
                        <span
                          className="font-mono text-[11px] text-muted-foreground"
                          title="IBAN/Kontonummer aus dem Import"
                        >
                          {maskAccountIdentifier(item.accountIdentifier)}
                        </span>
                      ) : null}
                      {item.status === 'ended' ? (
                        <Badge variant="outline" className="w-fit text-[10px]">
                          Beendet
                        </Badge>
                      ) : null}
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

                  <TableCell className="text-center">
                    {onIntervalChange ? (
                      <Button
                        variant="outline"
                        size="icon"
                        className={cn(
                          'size-11 border-2 transition-colors',
                          (userIntervals[item.key] === 'irregular' || item.interval === 'irregular')
                            ? 'border-foreground bg-foreground text-background hover:bg-foreground/90 hover:text-background'
                            : 'border-muted-foreground/50 bg-transparent text-muted-foreground hover:border-foreground hover:bg-muted hover:text-foreground',
                        )}
                        aria-label="Als variabel kennzeichnen"
                        title="Als unregelmäßig kennzeichnen: fließt nicht in die Prognose ein"
                        onClick={() =>
                          onIntervalChange(
                            item.key,
                            userIntervals[item.key] === 'irregular' ? null : 'irregular',
                          )
                        }
                      >
                        <ShuffleIcon className="size-5" aria-hidden="true" />
                      </Button>
                    ) : null}
                  </TableCell>

                  <TableCell className="text-center">
                    <Button
                      type="button"
                      variant={item.categoryId === 'groceries' && item.interval === 'irregular' ? 'default' : 'outline'}
                      size="icon"
                      className="size-11"
                      onClick={() => onReviewFood?.(item.key)}
                      aria-label="Als Lebensmittel und variabel markieren"
                      title="Als Lebensmittel und variabel markieren"
                    >
                      <ShoppingCartIcon className="size-5" aria-hidden="true" />
                    </Button>
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
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setEditingInterval(item.key)}
                        className="flex cursor-pointer flex-col gap-1 rounded px-1 py-0.5 transition-colors hover:bg-muted"
                      >
                        <span className="text-sm font-medium">{INTERVAL_LABELS[item.interval]}</span>
                        <span className="text-xs text-muted-foreground">
                          {item.intervalConfidence >= 0.7
                            ? 'hohe Sicherheit'
                            : item.intervalConfidence >= 0.4
                              ? 'mittel'
                              : 'gering'}
                        </span>
                      </button>
                    </div>
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
                            {item.outliers.length > 0 ? (
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
                    {(() => {
                      const end = new Date()
                      const start = new Date(end)
                      start.setDate(start.getDate() - 90)
                      const startIso = start.toISOString().slice(0, 10)
                      const endIso = end.toISOString().slice(0, 10)
                      const total = item.transactions.reduce((sum, transaction) => {
                        if (transaction.date < startIso || transaction.date > endIso) return sum
                        return sum + Math.abs(transaction.amount)
                      }, 0)
                      return formatEuro(total / 3)
                    })()}
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
                              onClick={() =>
                                item.status === 'ended' && onReactivate
                                  ? onReactivate(item.key)
                                  : onToggleConfirmed(item.key)
                              }
                              aria-label={
                                item.status === 'ended'
                                  ? 'Serie reaktivieren'
                                  : item.confirmed
                                    ? 'Bestätigung aufheben'
                                    : 'Serie bestätigen'
                              }
                            >
                              <CheckIcon />
                            </Button>
                          }
                        />
                        <TooltipContent>
                          {item.status === 'ended'
                            ? 'Serie reaktivieren'
                            : item.confirmed
                              ? 'Bestätigung aufheben'
                              : 'Als korrekt bestätigen'}
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() =>
                                item.status === 'ended' && onReactivate
                                  ? onReactivate(item.key)
                                  : onToggleExcluded(item.key)
                              }
                              aria-label={
                                item.status === 'ended'
                                  ? 'Serie reaktivieren'
                                  : item.excluded
                                    ? 'In Prognose aufnehmen'
                                    : 'Aus Prognose ausschließen'
                              }
                            >
                              <EyeOffIcon />
                            </Button>
                          }
                        />
                        <TooltipContent>
                          {item.status === 'ended'
                            ? 'Serie reaktivieren'
                            : item.excluded
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

      <Dialog
        open={editingCategoryKey !== null}
        onOpenChange={(open) => {
          if (!open) setEditingCategoryKey(null)
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Serie bearbeiten</DialogTitle>
            <DialogDescription>
              Kategorie für diese Serie ändern. Die Änderung gilt für alle Buchungen dieser Serie.
            </DialogDescription>
          </DialogHeader>
          {(() => {
            const item = rows.find((entry) => entry.key === editingCategoryKey)
            if (!item) return null
            return (
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">{item.label}</span>
                <Select
                  value={item.categoryId}
                  onValueChange={(value) => {
                    onCategoryChange(item.key, String(value))
                    setEditingCategoryKey(null)
                  }}
                >
                  <SelectTrigger aria-label="Kategorie auswählen">
                    <SelectValue />
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
              </div>
            )
          })()}
        </DialogContent>
      </Dialog>

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
