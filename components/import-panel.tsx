'use client'

import { useCallback, useRef, useState } from 'react'
import {
  AlertTriangleIcon,
  FileSpreadsheetIcon,
  LockIcon,
  ShieldCheckIcon,
  SparklesIcon,
  UploadIcon,
} from 'lucide-react'
import { AnonymizeSettings } from '@/components/anonymize-settings'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import type { AnonymizeOptions } from '@/lib/anonymizer'
import { generateDemoCsv } from '@/lib/demo-data'
import { cn } from '@/lib/utils'

type ImportPanelProps = {
  onFiles: (files: File[]) => void
  onDemo: (csv: string) => void
  isLoading: boolean
  error: string | null
  anonymizeOptions: AnonymizeOptions
  onAnonymizeChange: (options: AnonymizeOptions) => void
}

export function ImportPanel({
  onFiles,
  onDemo,
  isLoading,
  error,
  anonymizeOptions,
  onAnonymizeChange,
}: ImportPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      setIsDragging(false)
      const files = Array.from(event.dataTransfer.files ?? [])
      if (files.length > 0) onFiles(files)
    },
    [onFiles],
  )

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-3 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-xl border border-border bg-card">
          <FileSpreadsheetIcon className="size-6 text-primary" />
        </div>
        <h1 className="text-balance font-sans text-3xl font-semibold tracking-tight">
          Fixkosten aus Kontoumsätzen ermitteln
        </h1>
        <p className="mx-auto max-w-xl text-pretty leading-relaxed text-muted-foreground">
          Importiere den CSV-Export deines Girokontos. Die App erkennt wiederkehrende
          Buchungen, klassifiziert deren Intervall und prognostiziert die Fixkosten der
          kommenden drei Monate.
        </p>
      </div>

      <Alert>
        <ShieldCheckIcon />
        <AlertTitle>Deine Daten verlassen diesen Browser nicht</AlertTitle>
        <AlertDescription>
          <p className="leading-relaxed">
            Die CSV wird vollständig lokal in deinem Browser verarbeitet. Es gibt keinen
            Upload, keinen Server-Request und keine Datenbank. Optional wird das Ergebnis
            in IndexedDB auf diesem Gerät gespeichert, damit du nicht bei jedem Besuch neu
            importieren musst.
          </p>
        </AlertDescription>
      </Alert>

      <AnonymizeSettings options={anonymizeOptions} onChange={onAnonymizeChange} />

      <Card>
        <CardHeader>
          <CardTitle>CSV-Datei einlesen</CardTitle>
          <CardDescription>
            Optimiert für den CAMT-CSV-Export von Sparkasse und Volksbank. Andere Formate
            (DKB, ING, Comdirect, N26) werden automatisch mit erkannt.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div
            onDragOver={(event) => {
              event.preventDefault()
              setIsDragging(true)
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={cn(
              'flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border px-6 py-10 transition-colors',
              isDragging && 'border-primary bg-accent',
            )}
          >
            <UploadIcon className="size-8 text-muted-foreground" />
            <div className="flex flex-col items-center gap-1 text-center">
              <p className="font-medium">Dateien hierher ziehen</p>
              <p className="text-sm text-muted-foreground">
                eine oder mehrere &middot; .csv, .txt
              </p>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.txt,text/csv"
              multiple
              className="sr-only"
              onChange={(event) => {
                const files = Array.from(event.target.files ?? [])
                if (files.length > 0) onFiles(files)
                event.target.value = ''
              }}
            />
            <Button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={isLoading}
            >
              <FileSpreadsheetIcon data-icon="inline-start" />
              Dateien auswählen
            </Button>
          </div>

          {error ? (
            <Alert variant="destructive">
              <AlertTriangleIcon />
              <AlertTitle>Import fehlgeschlagen</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              oder
            </span>
            <Separator className="flex-1" />
          </div>

          <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/40 p-4">
            <div className="flex items-start gap-3">
              <SparklesIcon className="mt-0.5 size-5 shrink-0 text-primary" />
              <div className="flex flex-col gap-1">
                <p className="font-medium">Mit Beispieldaten testen</p>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  24 Monate synthetische Umsätze mit monatlichen, quartalsweisen und
                  jährlichen Buchungen sowie gekündigten Verträgen. Ideal, um die Analyse
                  zu prüfen, bevor du echte Daten verwendest.
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              className="self-start"
              onClick={() => onDemo(generateDemoCsv(24))}
              disabled={isLoading}
            >
              Beispieldaten laden
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-start gap-3 rounded-lg border border-border px-4 py-3">
        <LockIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <p className="text-sm leading-relaxed text-muted-foreground">
          Tipp: Exportiere im Online-Banking möglichst 24 Monate. Je länger der Zeitraum,
          desto sicherer erkennt die Analyse jährliche und quartalsweise Buchungen.
        </p>
      </div>
    </div>
  )
}
