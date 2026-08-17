import type { Transaction } from './types'

/**
 * Duplikatserkennung und Zusammenführung von Transaktionen aus mehreren
 * CSV-Importen. Verhindert, dass überlappende Zeiträume zu doppelten
 * Einträgen führen.
 */

/**
 * Erstellt einen eindeutigen Fingerprint für eine Transaktion.
 *
 * WICHTIG: Diese Funktion wird VOR der Anonymisierung aufgerufen!
 * Daher können wir alle Felder verwenden, einschließlich Empfänger
 * und Verwendungszweck.
 *
 * Verwendet für maximale Genauigkeit:
 * - Datum (Buchungstag)
 * - Betrag (in Cent-Genauigkeit)
 * - Empfänger (normalisiert)
 * - Verwendungszweck (normalisiert)
 */
export function createTransactionFingerprint(tx: Transaction): string {
  // Betrag in Cent-Genauigkeit (vermeidet Floating-Point-Probleme)
  const amountCents = Math.round(tx.amount * 100)
  
  // Empfänger normalisieren
  const normalizedCounterparty = tx.counterparty
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
  
  // Verwendungszweck normalisieren
  const normalizedPurpose = tx.purpose
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
  
  // Fingerprint: Datum|Betrag|Empfänger|Verwendungszweck
  return `${tx.date}|${amountCents}|${normalizedCounterparty}|${normalizedPurpose}`
}

/**
 * Führt neue Transaktionen mit bestehenden zusammen und entfernt Duplikate.
 * 
 * @param existing - Bereits vorhandene Transaktionen
 * @param newTransactions - Neu importierte Transaktionen
 * @returns Zusammengeführte Liste mit Statistik
 */
export function mergeTransactions(
  existing: Transaction[],
  newTransactions: Transaction[]
): {
  /** Zusammengeführte und sortierte Transaktionsliste */
  merged: Transaction[]
  /** Anzahl erkannter Duplikate */
  duplicates: number
  /** Anzahl hinzugefügter neuer Transaktionen */
  added: number
} {
  // Set für O(1) Lookup-Performance
  const existingFingerprints = new Set(
    existing.map(createTransactionFingerprint)
  )
  
  const added: Transaction[] = []
  let duplicates = 0
  
  // Neue Transaktionen prüfen
  for (const tx of newTransactions) {
    const fingerprint = createTransactionFingerprint(tx)
    
    if (existingFingerprints.has(fingerprint)) {
      // Duplikat gefunden - überspringen
      duplicates++
    } else {
      // Neue Transaktion - hinzufügen
      added.push(tx)
      existingFingerprints.add(fingerprint)
    }
  }
  
  // Zusammenführen und chronologisch sortieren
  const merged = [...existing, ...added].sort((a, b) => 
    a.date.localeCompare(b.date)
  )
  
  return {
    merged,
    duplicates,
    added: added.length,
  }
}

/**
 * Prüft, ob zwei Transaktionen identisch sind (für Testing).
 */
export function areTransactionsEqual(a: Transaction, b: Transaction): boolean {
  return createTransactionFingerprint(a) === createTransactionFingerprint(b)
}
