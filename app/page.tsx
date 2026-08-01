'use client'

import { Dashboard } from '@/components/dashboard'
import { ImportPanel } from '@/components/import-panel'
import { Skeleton } from '@/components/ui/skeleton'
import { useAnalysis } from '@/hooks/use-analysis'

export default function Page() {
  const analysis = useAnalysis()

  return (
    <main className="min-h-svh px-4 py-8 md:px-8 md:py-12">
      <div className="mx-auto w-full max-w-6xl">
        {analysis.isRestoring ? (
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
            <Skeleton className="h-12 w-2/3" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : analysis.hasData ? (
          <Dashboard {...analysis} />
        ) : (
          <ImportPanel
            onFile={analysis.importFile}
            onDemo={(csv) => analysis.importCsvText(csv, 'Beispieldaten.csv')}
            isLoading={analysis.isLoading}
            error={analysis.error}
            anonymizeOptions={analysis.anonymizeOptions}
            onAnonymizeChange={analysis.setAnonymizeOptions}
          />
        )}
      </div>
    </main>
  )
}
