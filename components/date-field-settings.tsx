'use client'

import { CalendarIcon } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { AnonymizeOptions, DateFieldOption } from '@/lib/anonymizer'
import { DATE_FIELD_DESCRIPTIONS } from '@/lib/date-utils'

type DateFieldSettingsProps = {
  options: AnonymizeOptions
  onChange: (options: AnonymizeOptions) => void
}

export function DateFieldSettings({ options, onChange }: DateFieldSettingsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarIcon className="size-4 text-primary" />
          Datumsfeld für Analyse
        </CardTitle>
        <CardDescription>
          Bestimmt, welches Datum für die Prognose-Berechnung und Monatszuordnung verwendet
          wird. Bei Buchungen am Monatsende (z.B. 31.07. für August) ist das Valutadatum
          genauer.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <Field>
          <FieldLabel htmlFor="date-field">Datumsfeld</FieldLabel>
          <FieldDescription>
            Wähle, ob Buchungsdatum oder Valutadatum (Wertstellung) verwendet werden soll
          </FieldDescription>
          <Select
            value={options.useDateField}
            onValueChange={(value) =>
              onChange({ ...options, useDateField: value as DateFieldOption })
            }
          >
            <SelectTrigger id="date-field">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(DATE_FIELD_DESCRIPTIONS) as DateFieldOption[]).map((key) => (
                <SelectItem key={key} value={key}>
                  <div className="flex flex-col gap-0.5 py-1">
                    <span className="font-medium">{DATE_FIELD_DESCRIPTIONS[key].label}</span>
                    <span className="text-xs text-muted-foreground">
                      {DATE_FIELD_DESCRIPTIONS[key].description}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <div className="mt-4 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          <span className="font-medium">Beispiel:</span> Eine Versicherung wird am 31.07. für
          den Zeitraum 01.08.-01.09. (August) gebucht. Mit Valutadatum wird sie korrekt dem
          August zugeordnet, mit Buchungsdatum dem Juli.
        </div>
      </CardContent>
    </Card>
  )
}
