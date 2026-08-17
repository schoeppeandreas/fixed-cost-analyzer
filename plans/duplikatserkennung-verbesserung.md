# Verbesserung der Duplikatserkennung

## Problem

Die aktuelle Duplikatserkennung funktioniert nicht korrekt, weil:

1. **Anonymisierung verändert die Daten**: Der `counterparty` und `purpose` werden anonymisiert, bevor die Duplikatserkennung läuft
2. **Zu viele Felder**: Die Verwendung von `counterparty` macht die Erkennung zu streng
3. **Keine Transaktionsnummer**: Es gibt keine eindeutige ID aus dem Bank-Export

## Aktueller Fingerprint

```typescript
`${tx.date}|${amountCents}|${normalizedCounterparty}|${normalizedPurpose}`
```

**Problem**: Nach der Anonymisierung sind `counterparty` und `purpose` unterschiedlich!

## Lösung: Vereinfachter Fingerprint

### Option 1: Nur Datum + Betrag + Verwendungszweck (EMPFOHLEN)

```typescript
`${tx.date}|${amountCents}|${normalizedPurpose}`
```

**Vorteile**:
- Funktioniert auch nach Anonymisierung
- Verwendungszweck ist meist eindeutig genug
- Einfach und robust

**Nachteile**:
- Zwei unterschiedliche Transaktionen am selben Tag mit gleichem Betrag und ähnlichem Verwendungszweck könnten fälschlich als Duplikat erkannt werden

### Option 2: Nur Datum + Betrag

```typescript
`${tx.date}|${amountCents}`
```

**Vorteile**:
- Sehr einfach
- Funktioniert garantiert nach Anonymisierung

**Nachteile**:
- Zu ungenau: Mehrere Transaktionen am selben Tag mit gleichem Betrag würden als Duplikate erkannt

### Option 3: Duplikatserkennung VOR Anonymisierung

**Besserer Ansatz**: Die Duplikatserkennung muss VOR der Anonymisierung stattfinden!

```
Neue CSV → Parse → Merge mit ROHDATEN → Anonymisierung der gesamten Datenmenge
```

**Vorteile**:
- Kann alle Felder nutzen (Datum, Betrag, Empfänger, Verwendungszweck)
- Maximale Genauigkeit
- Konsistente Pseudonyme durch Re-Anonymisierung

**Implementierung**:
1. Bestehende Transaktionen sind bereits anonymisiert → Problem!
2. Wir müssten die Original-Rohdaten speichern → Sicherheitsrisiko!

### Option 4: Erweiterte Felder für Duplikatserkennung

Zusätzliche Felder aus der CSV nutzen, die NICHT anonymisiert werden:
- `bookingText` (z.B. "LASTSCHRIFT", "DAUERAUFTRAG")
- `valuta` (Valutadatum)

```typescript
`${tx.date}|${tx.valuta}|${amountCents}|${normalizedBookingText}`
```

## Empfohlene Lösung

**Kombination aus Option 1 und 4**:

```typescript
function createTransactionFingerprint(tx: Transaction): string {
  const amountCents = Math.round(tx.amount * 100)
  
  // Verwendungszweck normalisieren (ohne Pseudonyme zu berücksichtigen)
  const normalizedPurpose = tx.purpose
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
  
  // Buchungstext normalisieren
  const normalizedBookingText = tx.bookingText
    .trim()
    .toLowerCase()
  
  // Valutadatum als zusätzliches Unterscheidungsmerkmal
  const valuta = tx.valuta || tx.date
  
  // Fingerprint: Datum|Valuta|Betrag|Buchungstext|Verwendungszweck
  return `${tx.date}|${valuta}|${amountCents}|${normalizedBookingText}|${normalizedPurpose}`
}
```

**Warum das funktioniert**:
- `date`, `valuta`, `amount`, `bookingText` werden NICHT anonymisiert
- `purpose` wird anonymisiert, aber die Struktur bleibt ähnlich genug
- Kombination aller Felder macht Duplikaterkennung sehr zuverlässig

## Alternative: Nur nicht-anonymisierte Felder

Wenn die Anonymisierung zu viele Unterschiede erzeugt:

```typescript
function createTransactionFingerprint(tx: Transaction): string {
  const amountCents = Math.round(tx.amount * 100)
  const normalizedBookingText = tx.bookingText.trim().toLowerCase()
  const valuta = tx.valuta || tx.date
  
  // NUR nicht-anonymisierte Felder
  return `${tx.date}|${valuta}|${amountCents}|${normalizedBookingText}`
}
```

**Risiko**: Weniger genau, aber funktioniert garantiert nach Anonymisierung.

## Test-Szenario

Zwei identische Transaktionen:
```
Datum: 2024-01-15
Betrag: -49.99
Empfänger: "Netflix International B.V."
Verwendungszweck: "Abo Monat Januar 2024 Ref: 12345"
Buchungstext: "LASTSCHRIFT"
```

Nach Anonymisierung:
```
Empfänger: "Netflix International B.V." (bleibt gleich, kein IBAN/etc.)
Verwendungszweck: "Abo Monat Januar 2024 Ref: VERTRAG-01"
```

**Fingerprint (empfohlene Lösung)**:
```
2024-01-15|2024-01-15|-4999|lastschrift|abo monat januar 2024 ref: vertrag-01
```

✅ Beide Transaktionen haben den gleichen Fingerprint → Duplikat erkannt!

## Implementierung

Datei: [`lib/transaction-merger.ts`](lib/transaction-merger.ts:16)

Änderung in `createTransactionFingerprint()`:
- Empfänger (`counterparty`) ENTFERNEN
- Valutadatum und Buchungstext HINZUFÜGEN
- Verwendungszweck BEHALTEN (trotz Anonymisierung meist ähnlich genug)
