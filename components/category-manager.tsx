'use client'

import { useState } from 'react'
import { PlusIcon, TagsIcon, Trash2Icon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import type { Category } from '@/lib/types'

type CategoryManagerProps = {
  categories: Category[]
  onAdd: (label: string, bucket: Category['bucket'], keywords: string[]) => void
  onRemove: (id: string) => void
}

export function CategoryManager({ categories, onAdd, onRemove }: CategoryManagerProps) {
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [bucket, setBucket] = useState<Category['bucket']>('fixed')
  const [keywords, setKeywords] = useState('')

  const custom = categories.filter((category) => category.custom)

  const handleSubmit = () => {
    const trimmed = label.trim()
    if (!trimmed) return
    const parsedKeywords = keywords
      .split(',')
      .map((keyword) => keyword.trim().toLowerCase())
      .filter(Boolean)
    onAdd(trimmed, bucket, parsedKeywords)
    setLabel('')
    setKeywords('')
    setBucket('fixed')
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <TagsIcon data-icon="inline-start" />
            Kategorien
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Eigene Kategorien</DialogTitle>
          <DialogDescription>
            Ergänze eigene Kategorien und ordne sie den Fixkosten oder den variablen Kosten
            zu. Schlüsselwörter sorgen dafür, dass passende Buchungen automatisch
            einsortiert werden.
          </DialogDescription>
        </DialogHeader>

        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="cat-label">Bezeichnung</FieldLabel>
            <Input
              id="cat-label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="z. B. Vereinsbeiträge"
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="cat-bucket">Zuordnung</FieldLabel>
            <Select value={bucket} onValueChange={(value) => setBucket(value as Category['bucket'])}>
              <SelectTrigger id="cat-bucket">
                <SelectValue>
                  {(value: string) =>
                    value === 'fixed'
                      ? 'Fixkosten'
                      : value === 'variable'
                        ? 'Variable Kosten'
                        : 'Ignorieren'
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="fixed">Fixkosten</SelectItem>
                  <SelectItem value="variable">Variable Kosten</SelectItem>
                  <SelectItem value="ignored">Ignorieren</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldDescription>
              Nur Fixkosten fließen in die 3-Monats-Prognose ein.
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="cat-keywords">Schlüsselwörter</FieldLabel>
            <Input
              id="cat-keywords"
              value={keywords}
              onChange={(event) => setKeywords(event.target.value)}
              placeholder="sportverein, musikschule"
            />
            <FieldDescription>
              Kommagetrennt. Wird im Empfängernamen und Verwendungszweck gesucht.
            </FieldDescription>
          </Field>
        </FieldGroup>

        {custom.length > 0 ? (
          <>
            <Separator />
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">Eigene Kategorien</p>
              <ul className="flex flex-col gap-2">
                {custom.map((category) => (
                  <li
                    key={category.id}
                    className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-sm">{category.label}</span>
                      <Badge variant="secondary" className="text-[10px]">
                        {category.bucket === 'fixed'
                          ? 'fix'
                          : category.bucket === 'variable'
                            ? 'variabel'
                            : 'ignoriert'}
                      </Badge>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onRemove(category.id)}
                      aria-label={`${category.label} löschen`}
                    >
                      <Trash2Icon />
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          </>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Schließen
          </Button>
          <Button onClick={handleSubmit} disabled={!label.trim()}>
            <PlusIcon data-icon="inline-start" />
            Hinzufügen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
