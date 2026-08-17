import type { DateFieldOption } from './anonymizer'
import type { Transaction } from './types'

/**
 * Ermittelt das effektive Datum einer Transaktion basierend auf der
 * Benutzereinstellung.
 * 
 * - 'booking': Verwendet immer das Buchungsdatum
 * - 'valuta': Verwendet Valutadatum, falls vorhanden, sonst Buchungsdatum
 * - 'auto': Intelligente Erkennung (Valuta bei Monatsend-Buchungen)
 */
export function getEffectiveDate(
  tx: Transaction,
  option: DateFieldOption
): string {
  switch (option) {
    case 'booking':
      return tx.date
    
    case 'valuta':
      return tx.valuta || tx.date
    
    case 'auto': {
      // Wenn kein Valutadatum vorhanden, Buchungsdatum verwenden
      if (!tx.valuta) return tx.date
      
      // Wenn Valuta = Buchung, Buchungsdatum verwenden
      if (tx.valuta === tx.date) return tx.date
      
      // Intelligente Erkennung: Valuta verwenden, wenn Buchung am Monatsende
      // und Valuta im Folgemonat liegt
      const bookingDate = new Date(tx.date)
      const valutaDate = new Date(tx.valuta)
      
      const bookingDay = bookingDate.getDate()
      const bookingMonth = bookingDate.getMonth()
      const valutaMonth = valutaDate.getMonth()
      
      // Buchung in den letzten 3 Tagen des Monats UND Valuta im nächsten Monat
      const daysInMonth = new Date(
        bookingDate.getFullYear(),
        bookingMonth + 1,
        0
      ).getDate()
      
      const isEndOfMonth = bookingDay >= daysInMonth - 2
      const isNextMonth = 
        (valutaMonth === bookingMonth + 1) || 
        (bookingMonth === 11 && valutaMonth === 0) // Dezember → Januar
      
      if (isEndOfMonth && isNextMonth) {
        return tx.valuta
      }
      
      return tx.date
    }
    
    default:
      return tx.date
  }
}

/**
 * Beschreibung der Datumsfeld-Optionen für die UI
 */
export const DATE_FIELD_DESCRIPTIONS: Record<DateFieldOption, {
  label: string
  description: string
}> = {
  booking: {
    label: 'Buchungsdatum',
    description: 'Verwendet das Datum, an dem die Buchung auf dem Konto erscheint',
  },
  valuta: {
    label: 'Valutadatum (empfohlen)',
    description: 'Verwendet das Wertstellungsdatum, falls vorhanden. Genauer für Monatsend-Buchungen',
  },
  auto: {
    label: 'Automatisch',
    description: 'Erkennt automatisch, ob Valuta- oder Buchungsdatum besser passt',
  },
}
