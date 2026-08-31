/**
 * Erzeugt einen realistischen Beispiel-CSV-Export im Sparkassen-CAMT-Format
 * über 24 Monate. Dient zum Ausprobieren, ohne echte Kontodaten zu verwenden.
 */

type Recipe = {
  counterparty: string
  purpose: string
  bookingText: string
  amount: number
  /** Intervall in Monaten */
  every: number
  /** Buchungstag im Monat */
  day: number
  /** Zufällige Betragsschwankung in Prozent */
  jitter?: number
  /** Monat (0-basiert, relativ zum Start) ab dem gebucht wird */
  startMonth?: number
  /** Monat, ab dem NICHT mehr gebucht wird (gekündigt) */
  endMonth?: number
  /** Für jährliche/quartalsweise Posten: in welchem Monat des Jahres */
  monthOffset?: number
}

const RECIPES: Recipe[] = [
  // Fixkosten monatlich
  {
    counterparty: 'Hausverwaltung Meridian GmbH',
    purpose: 'MIETE WHG 12 OBJ 4471 DE89370400440532013000',
    bookingText: 'DAUERAUFTRAG',
    amount: -890,
    every: 1,
    day: 1,
  },
  {
    counterparty: 'Sparkasse Musterstadt',
    purpose: 'DARLEHEN 6641772003 ANNUITAET TILGUNG UND ZINSEN',
    bookingText: 'LASTSCHRIFT',
    amount: -412.5,
    every: 1,
    day: 30,
  },
  {
    counterparty: 'Santander Consumer Bank AG',
    purpose: 'RATENKREDIT KTO 4471998210 RATE 18 VON 48',
    bookingText: 'FOLGELASTSCHRIFT',
    amount: -238.9,
    every: 1,
    day: 15,
  },
  {
    counterparty: 'Stadtwerke Musterstadt Energie GmbH',
    purpose: 'ABSCHLAG STROM VERTRAG 88213377 MONAT',
    bookingText: 'BASISLASTSCHRIFT',
    amount: -98,
    every: 1,
    day: 5,
    jitter: 0.02,
  },
  {
    counterparty: 'Stadtwerke Musterstadt Erdgas',
    purpose: 'ABSCHLAG ERDGAS VERTRAG 88213401',
    bookingText: 'BASISLASTSCHRIFT',
    amount: -76,
    every: 1,
    day: 5,
    jitter: 0.03,
  },
  {
    // Jahresabrechnung des Gasversorgers: einmalige Nachzahlung im letzten
    // Monat. Demonstriert, dass die Prognose danach nicht mit dem hohen
    // Betrag weiterrechnet, sondern zum Abschlag zurückkehrt.
    counterparty: 'Stadtwerke Musterstadt Erdgas',
    purpose: 'JAHRESABRECHNUNG ERDGAS VERTRAG 88213401 NACHZAHLUNG',
    bookingText: 'BASISLASTSCHRIFT',
    amount: -412,
    every: 999,
    day: 18,
    startMonth: 23,
  },
  {
    counterparty: 'Telekom Deutschland GmbH',
    purpose: 'RECHNUNG 1122334455 MAGENTA ZUHAUSE L',
    bookingText: 'FOLGELASTSCHRIFT',
    amount: -49.95,
    every: 1,
    day: 8,
    jitter: 0.05,
  },
  {
    counterparty: 'Vodafone GmbH',
    purpose: 'MOBILFUNK KUNDENNR 772110394 RECHNUNG',
    bookingText: 'FOLGELASTSCHRIFT',
    amount: -34.99,
    every: 1,
    day: 12,
  },
  {
    counterparty: 'AOK Bayern',
    purpose: 'BEITRAG KRANKENVERSICHERUNG MITGL 4471209',
    bookingText: 'LASTSCHRIFT',
    amount: -212.4,
    every: 1,
    day: 25,
  },
  {
    counterparty: 'HUK-COBURG Versicherung',
    purpose: 'KFZ-VERSICHERUNG VS-NR 7712009834',
    bookingText: 'FOLGELASTSCHRIFT',
    amount: -62.3,
    every: 1,
    day: 3,
  },
  {
    counterparty: 'Allianz Lebensversicherung AG',
    purpose: 'RENTENVERSICHERUNG VERTRAG 90112447',
    bookingText: 'LASTSCHRIFT',
    amount: -125,
    every: 1,
    day: 2,
  },
  {
    counterparty: 'Netflix International B.V.',
    purpose: 'NETFLIX ABO STANDARD',
    bookingText: 'FOLGELASTSCHRIFT',
    amount: -13.99,
    every: 1,
    day: 18,
  },
  {
    counterparty: 'Spotify AB',
    purpose: 'SPOTIFY PREMIUM FAMILY',
    bookingText: 'FOLGELASTSCHRIFT',
    amount: -17.99,
    every: 1,
    day: 20,
  },
  {
    counterparty: 'FitX Deutschland GmbH',
    purpose: 'MITGLIEDSBEITRAG STUDIO MUSTERSTADT',
    bookingText: 'FOLGELASTSCHRIFT',
    amount: -29.99,
    every: 1,
    day: 1,
    endMonth: 17,
  },
  {
    counterparty: 'Kita Sonnenschein e.V.',
    purpose: 'ELTERNBEITRAG KINDERBETREUUNG',
    bookingText: 'LASTSCHRIFT',
    amount: -180,
    every: 1,
    day: 4,
  },
  {
    counterparty: 'Trade Republic Bank GmbH',
    purpose: 'SPARPLAN ETF WERTPAPIERKAUF',
    bookingText: 'DAUERAUFTRAG',
    amount: -250,
    every: 1,
    day: 16,
  },

  // Quartalsweise
  {
    counterparty: 'ARD ZDF Deutschlandradio Beitragsservice',
    purpose: 'RUNDFUNKBEITRAG BEITRAGSNR 447120983 QUARTAL',
    bookingText: 'LASTSCHRIFT',
    amount: -55.08,
    every: 3,
    day: 15,
    monthOffset: 1,
  },
  {
    counterparty: 'Stadtkasse Musterstadt',
    purpose: 'GRUNDSTEUER B AZ 4471-22-9 VIERTELJAHR',
    bookingText: 'LASTSCHRIFT',
    amount: -142.75,
    every: 3,
    day: 15,
    monthOffset: 2,
  },
  {
    counterparty: 'Provinzial Versicherung AG',
    purpose: 'HAUSRATVERSICHERUNG VS 88120394 VIERTELJAEHRLICH',
    bookingText: 'FOLGELASTSCHRIFT',
    amount: -48.6,
    every: 3,
    day: 7,
    monthOffset: 0,
  },

  // Halbjährlich
  {
    counterparty: 'Wuerttembergische Versicherung AG',
    purpose: 'HAFTPFLICHT UND RECHTSSCHUTZ VS 55120983',
    bookingText: 'LASTSCHRIFT',
    amount: -118.4,
    every: 6,
    day: 10,
    monthOffset: 3,
  },

  // Jährlich
  {
    counterparty: 'Hauptzollamt Musterstadt',
    purpose: 'KRAFTFAHRZEUGSTEUER MU-AB1234 JAHRESBETRAG',
    bookingText: 'LASTSCHRIFT',
    amount: -164,
    every: 12,
    day: 20,
    monthOffset: 4,
  },
  {
    counterparty: 'ADAC e.V.',
    purpose: 'MITGLIEDSBEITRAG PLUS MITGLNR 447120983',
    bookingText: 'LASTSCHRIFT',
    amount: -94,
    every: 12,
    day: 11,
    monthOffset: 8,
  },
  {
    counterparty: 'Sparkasse Musterstadt',
    purpose: 'ENTGELTABSCHLUSS KONTOFUEHRUNG JAHRESPREIS',
    bookingText: 'ENTGELTABSCHLUSS',
    amount: -71.4,
    every: 12,
    day: 30,
    monthOffset: 11,
  },

  // Einnahmen
  {
    counterparty: 'Muster Maschinenbau GmbH',
    purpose: 'LOHN GEHALT 04 PERS-NR 88213',
    bookingText: 'GUTSCHRIFT',
    amount: 3280,
    every: 1,
    day: 28,
    jitter: 0.04,
  },
  {
    counterparty: 'Familienkasse Bayern Nord',
    purpose: 'KINDERGELD KG-NR 447FK120983',
    bookingText: 'GUTSCHRIFT',
    amount: 250,
    every: 1,
    day: 10,
  },

  // Variable Kosten - häufig, unregelmäßig
  {
    counterparty: 'REWE Markt GmbH Musterstadt',
    purpose: 'REWE SAGT DANKE KARTENZAHLUNG',
    bookingText: 'KARTENZAHLUNG',
    amount: -68,
    every: 0.25,
    day: 6,
    jitter: 0.45,
  },
  {
    counterparty: 'EDEKA Suedbayern',
    purpose: 'EDEKA MUSTERSTADT KARTENZAHLUNG',
    bookingText: 'KARTENZAHLUNG',
    amount: -52,
    every: 0.3,
    day: 14,
    jitter: 0.5,
  },
  {
    counterparty: 'ALDI SUED Musterstadt',
    purpose: 'ALDI SUED FIL 4471 KARTENZAHLUNG',
    bookingText: 'KARTENZAHLUNG',
    amount: -41,
    every: 0.4,
    day: 21,
    jitter: 0.4,
  },
  {
    counterparty: 'Aral Tankstelle Musterstadt',
    purpose: 'ARAL STATION 4471209 TANKEN',
    bookingText: 'KARTENZAHLUNG',
    amount: -78,
    every: 0.5,
    day: 9,
    jitter: 0.25,
  },
  {
    counterparty: 'Shell Deutschland Oil GmbH',
    purpose: 'SHELL STATION 88120 KRAFTSTOFF',
    bookingText: 'KARTENZAHLUNG',
    amount: -72,
    every: 0.6,
    day: 23,
    jitter: 0.3,
  },
  {
    counterparty: 'dm-drogerie markt',
    purpose: 'DM FILIALE 4471 KARTENZAHLUNG',
    bookingText: 'KARTENZAHLUNG',
    amount: -34,
    every: 0.8,
    day: 17,
    jitter: 0.5,
  },
  {
    counterparty: 'AMAZON.DE',
    purpose: 'AMZN MKTP DE BESTELLUNG 302-4471209-8834',
    bookingText: 'FOLGELASTSCHRIFT',
    amount: -47,
    every: 0.7,
    day: 13,
    jitter: 0.8,
  },
  {
    counterparty: 'Bargeldauszahlung',
    purpose: 'GAA MUSTERSTADT HAUPTSTR AUSZAHLUNG',
    bookingText: 'BARGELDAUSZAHLUNG',
    amount: -150,
    every: 1,
    day: 22,
    jitter: 0.35,
  },

  // Einmalige / beendete Posten
  {
    counterparty: 'MediaMarkt Musterstadt',
    purpose: 'WASCHMASCHINE BESTELLNR 88120394',
    bookingText: 'KARTENZAHLUNG',
    amount: -649,
    every: 999,
    day: 14,
    startMonth: 7,
  },
  {
    counterparty: 'Autohaus Krueger GmbH',
    purpose: 'REPARATUR RECHNUNG 2024-4471',
    bookingText: 'UEBERWEISUNG',
    amount: -1284.9,
    every: 999,
    day: 19,
    startMonth: 13,
  },
  {
    counterparty: 'Lufthansa AG',
    purpose: 'FLUGBUCHUNG BUCHUNGSNR XK88TZ',
    bookingText: 'KARTENZAHLUNG',
    amount: -486,
    every: 999,
    day: 8,
    startMonth: 10,
  },
  {
    counterparty: 'Sky Deutschland Fernsehen',
    purpose: 'SKY ABO KUNDENNR 4471209834',
    bookingText: 'FOLGELASTSCHRIFT',
    amount: -39.99,
    every: 1,
    day: 24,
    endMonth: 9,
  },
  {
    counterparty: 'Zalando SE',
    purpose: 'ZALANDO BESTELLUNG 10044712098',
    bookingText: 'FOLGELASTSCHRIFT',
    amount: -129.85,
    every: 999,
    day: 26,
    startMonth: 20,
  },
]

/** Deterministischer Pseudo-Zufall, damit die Demo reproduzierbar bleibt. */
function seededRandom(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function generateDemoCsv(monthsOfHistory = 24): string {
  const random = seededRandom(20240719)
  const today = new Date()
  const rows: { date: Date; line: string[] }[] = []

  const startYear = today.getFullYear()
  const startMonth = today.getMonth() - monthsOfHistory + 1

  for (const recipe of RECIPES) {
    if (recipe.every >= 999) {
      // Einmalzahlung
      const monthIndex = recipe.startMonth ?? 0
      const date = new Date(startYear, startMonth + monthIndex, recipe.day)
      if (date <= today) {
        rows.push({ date, line: buildRow(recipe, date, recipe.amount) })
      }
      continue
    }

    if (recipe.every < 1) {
      // Häufige, unregelmäßige Buchungen (variable Kosten)
      const perMonth = Math.round(1 / recipe.every)
      for (let monthIndex = 0; monthIndex < monthsOfHistory; monthIndex++) {
        for (let k = 0; k < perMonth; k++) {
          const dayJitter = Math.floor(random() * 26) + 1
          const date = new Date(startYear, startMonth + monthIndex, dayJitter)
          if (date > today) continue
          const factor = 1 + (random() - 0.5) * 2 * (recipe.jitter ?? 0.3)
          rows.push({
            date,
            line: buildRow(recipe, date, recipe.amount * factor),
          })
        }
      }
      continue
    }

    // Regelmäßige Posten
    const offset = recipe.monthOffset ?? 0
    for (let monthIndex = 0; monthIndex < monthsOfHistory; monthIndex++) {
      if ((monthIndex - offset) % recipe.every !== 0) continue
      if (monthIndex < offset) continue
      if (recipe.startMonth !== undefined && monthIndex < recipe.startMonth) continue
      if (recipe.endMonth !== undefined && monthIndex >= recipe.endMonth) continue

      // Buchungstag um Wochenenden verschieben (realistisch)
      let day = recipe.day
      const probe = new Date(startYear, startMonth + monthIndex, day)
      const weekday = probe.getDay()
      if (weekday === 0) day += 1
      if (weekday === 6) day += 2

      const date = new Date(startYear, startMonth + monthIndex, day)
      if (date > today) continue

      const factor = 1 + (random() - 0.5) * 2 * (recipe.jitter ?? 0)
      rows.push({ date, line: buildRow(recipe, date, recipe.amount * factor) })
    }
  }

  rows.sort((a, b) => a.date.getTime() - b.date.getTime())

  const header = [
    'Auftragskonto',
    'Buchungstag',
    'Valutadatum',
    'Buchungstext',
    'Verwendungszweck',
    'Beguenstigter/Zahlungspflichtiger',
    'Kontonummer/IBAN',
    'BIC (SWIFT-Code)',
    'Betrag',
    'Waehrung',
    'Info',
  ]

  const lines = [header.join(';'), ...rows.map((r) => r.line.join(';'))]
  return lines.join('\r\n')
}

function demoCounterpartyAccount(counterparty: string): string {
  let hash = 0
  for (const character of counterparty) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  }
  const suffix = String(hash % 100000000000).padStart(11, '0')
  return `DE44${suffix.slice(0, 4)}${suffix.slice(4, 8)}${suffix.slice(8, 11)}0`
}

function buildRow(recipe: Recipe, date: Date, amount: number): string[] {
  const dateStr = `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`
  const valutaStr = dateStr
  const amountStr = amount
    .toFixed(2)
    .replace('.', ',')
    .replace(/\B(?=(\d{3})+(?!\d)(?=,))/g, '.')

  const quote = (value: string) => `"${value.replace(/"/g, '""')}"`

  return [
    quote('DE89370400440532013000'),
    dateStr,
    valutaStr,
    quote(recipe.bookingText),
    quote(recipe.purpose),
    quote(recipe.counterparty),
    quote(demoCounterpartyAccount(recipe.counterparty)),
    quote('BYLADEM1001'),
    amountStr,
    'EUR',
    quote('Umsatz gebucht'),
  ]
}
