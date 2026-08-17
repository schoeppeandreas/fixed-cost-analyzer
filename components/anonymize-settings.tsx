'use client'

import { useState } from 'react'
import { PlusIcon, ShieldCheckIcon, XIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import type { AnonymizeOptions, DateFieldOption } from '@/lib/anonymizer'
import { DATE_FIELD_DESCRIPTIONS } from '@/lib/date-utils'

type AnonymizeSettingsProps = {
  options: AnonymizeOptions
  onChange: (options: AnonymizeOptions) => void
}

const TOGGLES: {
  key: 'redactIban' | 'redactNumbers' | 'redactContact'
  label: string
  hint: string
}[] = [
  {
    key: 'redactIban',
    label: 'IBAN und BIC ersetzen',
    hint: 'Kontonummern werden zu IBAN-01, IBAN-02 …',
  },
  {
    key: 'redactNumbers',
    label: 'Vertrags- und Kartennummern ersetzen',
    hint: 'Kunden-, Mandats- und Darlehensnummern werden zu VERTRAG-01 …',
  },
  {
    key: 'redactContact',
    label: 'E-Mail und Telefonnummern ersetzen',
    hint: 'Kommen bei PayPal- und Online-Zahlungen häufig im Verwendungszweck vor',
  },
]

export function AnonymizeSettings({ options, onChange }: AnonymizeSettingsProps) {
  const [nameDraft, setNameDraft] = useState('')

  const addName = () => {
    const value = nameDraft.trim()
    if (value.length < 3) return
    if (options.names.some((entry) => entry.toLowerCase() === value.toLowerCase())) {
      setNameDraft('')
      return
    }
    onChange({ ...options, names: [...options.names, value] })
    setNameDraft('')
  }

  const removeName = (name: string) => {
    onChange({ ...options, names: options.names.filter((entry) => entry !== name) })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <CardTitle className="flex items-center gap-2">
              <ShieldCheckIcon className="size-4 text-primary" />
              Anonymisierung beim Import
            </CardTitle>
            <CardDescription>
              Sensible Kennungen werden direkt beim Einlesen durch Platzhalter ersetzt –
              bevor irgendetwas gespeichert wird. Empfängernamen und Beträge bleiben
              erhalten, damit die Analyse aussagekräftig bleibt.
            </CardDescription>
          </div>
          <Switch
            checked={options.enabled}
            onCheckedChange={(checked) => onChange({ ...options, enabled: checked })}
            aria-label="Anonymisierung aktivieren"
          />
        </div>

        <p className="mt-3 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2.5 text-xs leading-relaxed text-foreground">
          <span className="font-medium">Unabhängig von diesen Einstellungen:</span> Aus der
          CSV werden ausschließlich Datum, Empfänger, Verwendungszweck, Buchungstext und
          Betrag eingelesen. Die Spalten IBAN, BIC, Gläubiger-ID und Mandatsreferenz werden
          gar nicht übernommen – sie können deshalb auch nicht gespeichert werden.
        </p>
      </CardHeader>

      {options.enabled ? (
        <CardContent className="flex flex-col gap-5">
          <Separator />

          <Field>
            <FieldLabel htmlFor="own-name">Eigene Namen entfernen</FieldLabel>
            <div className="flex gap-2">
              <Input
                id="own-name"
                placeholder="z. B. Max Mustermann"
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing || event.keyCode === 229) return
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    addName()
                  }
                }}
              />
              <Button type="button" variant="outline" onClick={addName}>
                <PlusIcon data-icon="inline-start" />
                Hinzufügen
              </Button>
            </div>
            <FieldDescription>
              Wird als ganzes Wort in Empfänger und Verwendungszweck ersetzt – auch
              einzelne Namensteile und andere Groß-/Kleinschreibung. Füge auch Namen von
              Familienmitgliedern hinzu, die in Buchungen auftauchen.
            </FieldDescription>
            {options.names.length > 0 ? (
              <div className="flex flex-wrap gap-2 pt-1">
                {options.names.map((name) => (
                  <Badge key={name} variant="secondary" className="gap-1 py-1 pl-2.5 pr-1">
                    {name}
                    <button
                      type="button"
                      onClick={() => removeName(name)}
                      className="rounded-sm p-0.5 hover:bg-background"
                      aria-label={`${name} entfernen`}
                    >
                      <XIcon className="size-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            ) : null}
          </Field>

          <Separator />

          <div className="flex flex-col gap-4">
            {TOGGLES.map((toggle) => (
              <div key={toggle.key} className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">{toggle.label}</span>
                  <span className="text-xs leading-relaxed text-muted-foreground">
                    {toggle.hint}
                  </span>
                </div>
                <Switch
                  checked={options[toggle.key]}
                  onCheckedChange={(checked) =>
                    onChange({ ...options, [toggle.key]: checked })
                  }
                  aria-label={toggle.label}
                />
              </div>
            ))}
          </div>

          <p className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
            Die Platzhalter sind fortlaufend nummeriert und werden nicht aus dem
            Originalwert berechnet. Es gibt also keinen Hash, der zurückgerechnet werden
            könnte. Gleiche Werte erhalten denselben Platzhalter, damit zwei Kredite
            derselben Bank getrennt bleiben.
          </p>
        </CardContent>
      ) : null}
    </Card>
  )
}
