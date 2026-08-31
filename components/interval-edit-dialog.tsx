'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { INTERVAL_LABELS } from '@/lib/analyzer'
import type { Interval, Series } from '@/lib/types'

type IntervalEditDialogProps = {
  seriesKey: string
  series: Series | null
  open: boolean
  onOpenChange: (next: boolean) => void
  onConfirm: (seriesKey: string, interval: string | null) => void
}

const INTERVAL_OPTIONS: { value: Interval; label: string; description: string }[] = [
  {
    value: 'weekly',
    label: INTERVAL_LABELS['weekly'],
    description: 'Jede Woche',
  },
  {
    value: 'monthly',
    label: INTERVAL_LABELS['monthly'],
    description: 'Jeden Monat',
  },
  {
    value: 'bimonthly',
    label: INTERVAL_LABELS['bimonthly'],
    description: 'Alle zwei Monate',
  },
  {
    value: 'quarterly',
    label: INTERVAL_LABELS['quarterly'],
    description: 'Vierteljährlich',
  },
  {
    value: 'semiannual',
    label: INTERVAL_LABELS['semiannual'],
    description: 'Halbjährlich',
  },
  {
    value: 'annual',
    label: INTERVAL_LABELS['annual'],
    description: 'Jährlich',
  },
  {
    value: 'irregular',
    label: INTERVAL_LABELS['irregular'],
    description: 'Unregelmäßig (manuelle Prüfung)',
  },
  {
    value: 'irregularForecast',
    label: INTERVAL_LABELS['irregularForecast'],
    description: 'Bekannte Termine und Beträge in die Prognose übernehmen',
  },
]

export function IntervalEditDialog({
  seriesKey,
  series,
  open,
  onOpenChange,
  onConfirm,
}: IntervalEditDialogProps) {
  const [selectedInterval, setSelectedInterval] = useState<string | null>(
    series?.interval ?? null,
  )

  if (!series) return null

  const handleConfirm = () => {
    if (selectedInterval !== series.interval) {
      onConfirm(seriesKey, selectedInterval)
    }
    onOpenChange(false)
  }

  const handleReset = () => {
    onConfirm(seriesKey, null)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Zahlungsrhythmus anpassen</DialogTitle>
          <DialogDescription>{series.label}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {INTERVAL_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => setSelectedInterval(option.value)}
              className={`w-full flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors ${
                selectedInterval === option.value
                  ? 'border-primary bg-primary/5'
                  : 'border-muted hover:bg-muted'
              }`}
            >
              <span className="font-medium">{option.label}</span>
              <span className="text-xs text-muted-foreground">{option.description}</span>
            </button>
          ))}

          <div className="flex gap-2 pt-4">
            <Button variant="outline" onClick={handleReset} className="flex-1">
              Automatik wiederherstellen
            </Button>
            <Button onClick={handleConfirm} className="flex-1">
              Übernehmen
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
