# Problem: Valutadatum vs. Buchungsdatum

## Beobachtung

Im Screenshot sieht man:
- **Prognose-Datum**: 02.09.2026
- **Letzte Buchung**: 31.07.2026 (Buchungsdatum)
- **Zeitraum im Verwendungszweck**: 01.08.2026-01.09.2026

Die Versicherung für **August** wurde am **31. Juli** gebucht, aber die Prognose rechnet ab dem Buchungsdatum, nicht ab dem Valutadatum/Zeitraum.

## Ursache

Die App verwendet aktuell das **Buchungsdatum** (`date`) für:
1. Serienerkennung (Abstände zwischen Buchungen)
2. Prognose-Berechnung (nächste erwartete Buchung)
3. Monatszuordnung

Das **Valutadatum** (`valuta`) wird zwar importiert, aber nicht für die Analyse verwendet.

## Problem

Bei monatlichen Buchungen, die am Monatsende für den Folgemonat gebucht werden:
- Buchung am 31.07. für August
- Buchung am 31.08. für September
- etc.

Die Prognose berechnet dann:
- Letzte Buchung: 31.07.
- Intervall: ~30 Tage
- Nächste Buchung: ~31.08. oder 01.09.

Aber eigentlich sollte die Prognose sein:
- Letzter Zeitraum: August (01.08.-01.09.)
- Nächster Zeitraum: September (01.09.-01.10.)
- Erwartete Buchung: Ende August für September

## Lösungsansätze

### Option 1: Valutadatum bevorzugen (EMPFOHLEN)

Verwende `valuta` statt `date` für die Analyse, falls vorhanden:

```typescript
const effectiveDate = tx.valuta || tx.date
```

**Vorteile:**
- Genauere Zuordnung zu Monaten
- Bessere Prognose für Folgemonat-Buchungen

**Nachteile:**
- Nicht alle Banken exportieren Valutadatum
- Kann bei manchen Transaktionen zu Verwirrung führen

### Option 2: Intelligente Erkennung

Erkenne, ob eine Buchung für den Folgemonat ist (z.B. am Monatsende):

```typescript
if (buchungstag >= 28 && valuta im nächsten Monat) {
  verwende valuta
} else {
  verwende date
}
```

**Vorteile:**
- Flexibler
- Funktioniert auch ohne Valutadatum

**Nachteile:**
- Komplexer
- Kann Fehler machen

### Option 3: Benutzer entscheiden lassen

Einstellung in den Anonymisierungs-Optionen:

```typescript
type AnalysisOptions = {
  useDateField: 'booking' | 'valuta' | 'auto'
}
```

**Vorteile:**
- Maximale Flexibilität
- Nutzer kann selbst entscheiden

**Nachteile:**
- Mehr UI-Komplexität
- Nutzer muss verstehen, was das bedeutet

## Empfehlung

**Option 1** ist am einfachsten und löst das Problem für die meisten Fälle:

1. In [`lib/analyzer.ts`](lib/analyzer.ts:1) die `buildSeries()` Funktion anpassen
2. Verwende `tx.valuta || tx.date` für alle Datumsberechnungen
3. Speichere beide Daten in der Serie für Transparenz

## Betroffene Dateien

- [`lib/analyzer.ts`](lib/analyzer.ts:414) - `buildSeries()` Funktion
- [`lib/types.ts`](lib/types.ts:1) - Eventuell Series-Type erweitern
- Eventuell UI-Komponenten für Anzeige

## Nächste Schritte

1. Entscheidung: Welche Option soll implementiert werden?
2. Implementierung in `buildSeries()`
3. Testing mit realen Daten
4. UI-Anpassungen falls nötig

## Hinweis

Dies ist eine größere Änderung, die die Kern-Logik der App betrifft. Es sollte gründlich getestet werden, da es die Prognose für ALLE Serien beeinflusst.
