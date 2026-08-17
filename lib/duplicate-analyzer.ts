import type { Transaction } from './types'

/**
 * Analyse-Tool für die Duplikatserkennung.
 * Zeigt, welche Felder am besten zur Identifikation geeignet sind.
 */

export type DuplicateAnalysis = {
  totalTransactions: number
  uniqueByDateAmount: number
  uniqueByDateAmountBooking: number
  uniqueByDateAmountPurpose: number
  uniqueByDateAmountBookingPurpose: number
  uniqueByDateValutaAmountBooking: number
  sampleTransactions: Array<{
    date: string
    valuta?: string
    amount: number
    bookingText: string
    purpose: string
    counterparty: string
  }>
}

/**
 * Analysiert Transaktionen und zeigt, wie gut verschiedene
 * Fingerprint-Strategien funktionieren würden.
 */
export function analyzeDuplicateStrategies(
  transactions: Transaction[]
): DuplicateAnalysis {
  const dateAmount = new Set<string>()
  const dateAmountBooking = new Set<string>()
  const dateAmountPurpose = new Set<string>()
  const dateAmountBookingPurpose = new Set<string>()
  const dateValutaAmountBooking = new Set<string>()

  for (const tx of transactions) {
    const amountCents = Math.round(tx.amount * 100)
    const normalizedBooking = tx.bookingText.trim().toLowerCase()
    const normalizedPurpose = tx.purpose.trim().toLowerCase().replace(/\s+/g, ' ')
    const valuta = tx.valuta || tx.date

    dateAmount.add(`${tx.date}|${amountCents}`)
    dateAmountBooking.add(`${tx.date}|${amountCents}|${normalizedBooking}`)
    dateAmountPurpose.add(`${tx.date}|${amountCents}|${normalizedPurpose}`)
    dateAmountBookingPurpose.add(
      `${tx.date}|${amountCents}|${normalizedBooking}|${normalizedPurpose}`
    )
    dateValutaAmountBooking.add(
      `${tx.date}|${valuta}|${amountCents}|${normalizedBooking}`
    )
  }

  // Beispiel-Transaktionen (erste 5)
  const sampleTransactions = transactions.slice(0, 5).map((tx) => ({
    date: tx.date,
    valuta: tx.valuta,
    amount: tx.amount,
    bookingText: tx.bookingText,
    purpose: tx.purpose.substring(0, 80), // Gekürzt für Übersicht
    counterparty: tx.counterparty.substring(0, 50),
  }))

  return {
    totalTransactions: transactions.length,
    uniqueByDateAmount: dateAmount.size,
    uniqueByDateAmountBooking: dateAmountBooking.size,
    uniqueByDateAmountPurpose: dateAmountPurpose.size,
    uniqueByDateAmountBookingPurpose: dateAmountBookingPurpose.size,
    uniqueByDateValutaAmountBooking: dateValutaAmountBooking.size,
    sampleTransactions,
  }
}

/**
 * Gibt eine lesbare Zusammenfassung der Analyse aus.
 */
export function formatAnalysis(analysis: DuplicateAnalysis): string {
  const total = analysis.totalTransactions
  
  return `
Duplikatserkennung - Analyse von ${total} Transaktionen
${'='.repeat(60)}

Strategie-Vergleich (je höher, desto genauer):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Datum + Betrag
   Eindeutige: ${analysis.uniqueByDateAmount} von ${total}
   Genauigkeit: ${((analysis.uniqueByDateAmount / total) * 100).toFixed(1)}%
   ⚠️  Zu ungenau - mehrere Transaktionen pro Tag möglich

2. Datum + Betrag + Buchungstext
   Eindeutige: ${analysis.uniqueByDateAmountBooking} von ${total}
   Genauigkeit: ${((analysis.uniqueByDateAmountBooking / total) * 100).toFixed(1)}%
   ✓  Robust gegen Anonymisierung

3. Datum + Betrag + Verwendungszweck
   Eindeutige: ${analysis.uniqueByDateAmountPurpose} von ${total}
   Genauigkeit: ${((analysis.uniqueByDateAmountPurpose / total) * 100).toFixed(1)}%
   ⚠️  Kann durch Anonymisierung beeinträchtigt werden

4. Datum + Betrag + Buchungstext + Verwendungszweck
   Eindeutige: ${analysis.uniqueByDateAmountBookingPurpose} von ${total}
   Genauigkeit: ${((analysis.uniqueByDateAmountBookingPurpose / total) * 100).toFixed(1)}%
   ✓  Sehr genau, aber Verwendungszweck wird anonymisiert

5. Datum + Valuta + Betrag + Buchungstext
   Eindeutige: ${analysis.uniqueByDateValutaAmountBooking} von ${total}
   Genauigkeit: ${((analysis.uniqueByDateValutaAmountBooking / total) * 100).toFixed(1)}%
   ✓✓ EMPFOHLEN - Genau und robust

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Beispiel-Transaktionen:
${analysis.sampleTransactions
  .map(
    (tx, i) => `
${i + 1}. ${tx.date} | ${tx.amount.toFixed(2)} EUR
   Valuta: ${tx.valuta || 'nicht vorhanden'}
   Buchungstext: ${tx.bookingText}
   Empfänger: ${tx.counterparty}
   Verwendungszweck: ${tx.purpose}
`
  )
  .join('\n')}

Empfehlung:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Strategie 5 (Datum + Valuta + Betrag + Buchungstext) bietet
die beste Balance zwischen Genauigkeit und Robustheit gegen
Anonymisierung.
`
}
