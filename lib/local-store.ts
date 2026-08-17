import type { AnonymizeOptions } from './anonymizer'
import type { Transaction, UserOverrides } from './types'

/**
 * Lokale Persistenz über IndexedDB. Die Daten verlassen das Gerät nicht —
 * es gibt keinen Server-Aufruf, keine API und keine Datenbank in der Cloud.
 */

const DB_NAME = 'fixkosten-analyse'
const DB_VERSION = 1
const STORE = 'state'

export type StoredState = {
  transactions: Transaction[]
  overrides: UserOverrides
  fileName: string
  importedAt: string
  /** Anonymisierungs-Einstellungen vom ersten Import */
  anonymizeOptions?: AnonymizeOptions
  /** Liste aller importierten Dateinamen */
  fileNames?: string[]
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB ist in diesem Browser nicht verfügbar.'))
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function saveState(state: StoredState): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(state, 'current')
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch (error) {
    console.log('[v0] saveState failed:', error)
  }
}

export async function loadState(): Promise<StoredState | null> {
  try {
    const db = await openDb()
    const result = await new Promise<StoredState | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const request = tx.objectStore(STORE).get('current')
      request.onsuccess = () => resolve(request.result as StoredState | undefined)
      request.onerror = () => reject(request.error)
    })
    db.close()
    return result ?? null
  } catch (error) {
    console.log('[v0] loadState failed:', error)
    return null
  }
}

export async function clearState(): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete('current')
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch (error) {
    console.log('[v0] clearState failed:', error)
  }
}

export const EMPTY_OVERRIDES: UserOverrides = {
  categories: {},
  excluded: {},
  confirmed: {},
  amounts: {},
  names: {},
  intervals: {},
  paid: {},
  customCategories: [],
}

/**
 * Ergänzt fehlende Felder in gespeicherten Overrides. Ältere Sitzungen
 * kennen z. B. `amounts`, `names`, `intervals` oder `paid` noch nicht – ohne Auffüllen würde der Zugriff
 * darauf zur Laufzeit fehlschlagen.
 */
export function normalizeOverrides(stored: Partial<UserOverrides> | undefined): UserOverrides {
  return {
    categories: stored?.categories ?? {},
    excluded: stored?.excluded ?? {},
    confirmed: stored?.confirmed ?? {},
    amounts: stored?.amounts ?? {},
    names: stored?.names ?? {},
    intervals: stored?.intervals ?? {},
    paid: stored?.paid ?? {},
    customCategories: stored?.customCategories ?? [],
  }
}

/**
 * Normalisiert gespeicherten State für Abwärtskompatibilität.
 * Ältere Versionen kennen anonymizeOptions und fileNames noch nicht.
 */
export function normalizeStoredState(stored: Partial<StoredState> | undefined): StoredState | null {
  if (!stored) return null
  
  return {
    transactions: stored.transactions ?? [],
    overrides: normalizeOverrides(stored.overrides),
    fileName: stored.fileName ?? '',
    importedAt: stored.importedAt ?? '',
    anonymizeOptions: stored.anonymizeOptions,
    fileNames: stored.fileNames ?? (stored.fileName ? [stored.fileName] : []),
  }
}

/**
 * Exportiert die Anpassungen (Overrides) als JSON-Datei
 */
export function exportOverrides(overrides: UserOverrides, fileName: string = 'einstellungen'): void {
  const exportData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    overrides,
  }
  
  const json = JSON.stringify(exportData, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${fileName}-anpassungen-${new Date().toISOString().split('T')[0]}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Importiert Anpassungen aus einer JSON-Datei
 */
export async function importOverrides(file: File): Promise<UserOverrides | null> {
  try {
    const text = await file.text()
    const data = JSON.parse(text)
    
    if (data.version !== 1 || !data.overrides) {
      throw new Error('Ungültiges Format der Einstellungsdatei')
    }
    
    return normalizeOverrides(data.overrides)
  } catch (error) {
    console.log('[v0] importOverrides failed:', error)
    return null
  }
}
