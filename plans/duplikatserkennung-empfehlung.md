# Empfehlung zur Duplikatserkennung

## Problem

Die aktuelle Implementierung verwendet:
```
Datum + Betrag + Empfänger + Verwendungszweck
```

**Warum das nicht funktioniert:**
- Empfänger und Verwendungszweck werden anonymisiert
- Nach der Anonymisierung sind die Werte unterschiedlich
- Duplikate werden nicht erkannt

## Empfohlene Lösung

### Strategie: Datum + Valuta + Betrag + Buchungstext

```typescript
function createTransactionFingerprint(tx: Transaction): string {
  const amountCents = Math.round(tx.amount * 100)
  const normalizedBookingText = tx.bookingText.trim().toLowerCase()
  const valuta = tx.valuta || tx.date
  
  return `${tx.date}|${valuta}|${amountCents}|${normalizedBookingText}`
}
```

### Warum diese Felder?

| Feld | Wird anonymisiert? | Eindeutigkeit | Begründung |
|------|-------------------|---------------|------------|
| **Datum** | ❌ Nein | Mittel | Grundlegendes Merkmal |
| **Valuta** | ❌ Nein | Mittel | Zusätzliche Unterscheidung |
| **Betrag** | ❌ Nein | Mittel | Kernmerkmal der Transaktion |
| **Buchungstext** | ❌ Nein | Hoch | "LASTSCHRIFT", "DAUERAUFTRAG", etc. |
| ~~Empfänger~~ | ✅ Ja | - | ❌ Wird anonymisiert |
| ~~Verwendungszweck~~ | ✅ Ja | - | ❌ Wird anonymisiert |

### Vorteile

✅ **Funktioniert nach Anonymisierung**: Alle verwendeten Felder bleiben unverändert  
✅ **Hohe Genauigkeit**: Kombination aus 4 Feldern ist sehr spezifisch  
✅ **Robust**: Keine Abhängigkeit von anonymisierten Daten  
✅ **Einfach**: Klare, nachvollziehbare Logik  

### Beispiel

**Original-Transaktion:**
```
Datum: 2024-01-15
Valuta: 2024-01-15
Betrag: -49.99 EUR
Buchungstext: LASTSCHRIFT
Empfänger: Netflix International B.V.
Verwendungszweck: Abo Januar 2024 Ref: 12345
```

**Nach Anonymisierung:**
```
Datum: 2024-01-15          ← unverändert
Valuta: 2024-01-15         ← unverändert
Betrag: -49.99 EUR         ← unverändert
Buchungstext: LASTSCHRIFT  ← unverändert
Empfänger: Netflix International B.V.  ← unverändert (kein IBAN)
Verwendungszweck: Abo Januar 2024 Ref: VERTRAG-01  ← anonymisiert!
```

**Fingerprint:**
```
2024-01-15|2024-01-15|-4999|lastschrift
```

✅ Beide Transaktionen haben identischen Fingerprint → Duplikat erkannt!

## Alternative: Mit Verwendungszweck (falls gewünscht)

Falls du zusätzliche Sicherheit möchtest, kann der Verwendungszweck hinzugefügt werden:

```typescript
function createTransactionFingerprint(tx: Transaction): string {
  const amountCents = Math.round(tx.amount * 100)
  const normalizedBookingText = tx.bookingText.trim().toLowerCase()
  const normalizedPurpose = tx.purpose.trim().toLowerCase().replace(/\s+/g, ' ')
  const valuta = tx.valuta || tx.date
  
  return `${tx.date}|${valuta}|${amountCents}|${normalizedBookingText}|${normalizedPurpose}`
}
```

**Vorteil**: Noch genauer  
**Nachteil**: Anonymisierung könnte zu Unterschieden führen (z.B. VERTRAG-01 vs VERTRAG-02)

## Implementierung

**Datei**: [`lib/transaction-merger.ts`](lib/transaction-merger.ts:16)

**Änderung**: Zeile 16-32 ersetzen durch:

```typescript
export function createTransactionFingerprint(tx: Transaction): string {
  // Betrag in Cent-Genauigkeit (vermeidet Floating-Point-Probleme)
  const amountCents = Math.round(tx.amount * 100)
  
  // Buchungstext normalisieren (wird NICHT anonymisiert)
  const normalizedBookingText = tx.bookingText
    .trim()
    .toLowerCase()
  
  // Valutadatum als zusätzliches Unterscheidungsmerkmal
  const valuta = tx.valuta || tx.date
  
  // Fingerprint: Nur nicht-anonymisierte Felder
  // Datum|Valuta|Betrag|Buchungstext
  return `${tx.date}|${valuta}|${amountCents}|${normalizedBookingText}`
}
```

## Nächste Schritte

1. ✅ Empfehlung dokumentiert
2. ⏳ Auf Bestätigung warten
3. ⏳ Implementierung in Code-Modus durchführen
4. ⏳ Testen mit deinen Daten

## Frage an dich

Möchtest du:
- **Option A**: Nur nicht-anonymisierte Felder (Datum + Valuta + Betrag + Buchungstext) - **EMPFOHLEN**
- **Option B**: Mit Verwendungszweck (zusätzliche Genauigkeit, aber Risiko durch Anonymisierung)
- **Option C**: Nur Datum + Betrag + Buchungstext (ohne Valuta, falls Valuta oft fehlt)
