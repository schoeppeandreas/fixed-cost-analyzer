'use client'

import { CalendarClockIcon, LayersIcon, RepeatIcon, TrendingUpIcon } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatEuro } from '@/lib/analyzer'
import type { ForecastMonth, Series } from '@/lib/types'

type SummaryCardsProps = {
  forecast: ForecastMonth[]
  series: Series[]
  fixedMonthlyBaseline: number
}

export function SummaryCards({ forecast, series, fixedMonthlyBaseline }: SummaryCardsProps) {
  const forecastTotal = forecast.reduce((sum, month) => sum + month.total, 0)
  const activeFixed = series.filter(
    (item) => item.status === 'active' && !item.excluded && item.interval !== 'irregular',
  )
  const peakMonth = forecast.reduce<ForecastMonth | null>(
    (max, month) => (max === null || month.total > max.total ? month : max),
    null,
  )

  const items = [
    {
      icon: CalendarClockIcon,
      label: 'Fixkosten nächste 3 Monate',
      value: formatEuro(forecastTotal),
      hint: `${forecast.map((m) => m.monthLabel.split(' ')[0]).join(' · ')}`,
    },
    {
      icon: TrendingUpIcon,
      label: 'Monatliche Grundlast',
      value: formatEuro(fixedMonthlyBaseline),
      hint: 'nur echte Monatszahler',
    },
    {
      icon: LayersIcon,
      label: 'Teuerster Monat',
      value: peakMonth ? formatEuro(peakMonth.total) : '—',
      hint: peakMonth ? peakMonth.monthLabel : 'keine Prognose',
    },
    {
      icon: RepeatIcon,
      label: 'Aktive Serien',
      value: String(activeFixed.length),
      hint: `${series.filter((s) => s.status === 'ended').length} beendet`,
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <Card key={item.label}>
          <CardHeader className="gap-1">
            <div className="flex items-center gap-2 text-muted-foreground">
              <item.icon className="size-4" />
              <CardDescription className="text-xs uppercase tracking-wide">
                {item.label}
              </CardDescription>
            </div>
            <CardTitle className="font-mono text-2xl tabular-nums">{item.value}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="truncate text-xs text-muted-foreground">{item.hint}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
