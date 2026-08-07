/** National public holidays for multiple countries (works for any year via the Gauss Easter algorithm). */

export type HolidayCountry = 'de' | 'at' | 'ch' | 'us' | 'gb' | 'fr' | 'es' | 'it' | 'nl' | 'pl' | 'se' | 'jp'

export interface Holiday {
  date: Date
  name: string
}

interface CountryHolidays {
  label: string
  fixed: Array<[number, number, string]>
  easter: Array<[number, string]>
  nth: Array<[number, number, number, string]>
  last: Array<[number, number, string]>
  rules: Array<(year: number) => Holiday | null>
}

function easterSunday(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day)
}

function addDays(d: Date, days: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + days)
  return x
}

const EMPTY: CountryHolidays = { label: '', fixed: [], easter: [], nth: [], last: [], rules: [] }

const COUNTRIES: Record<HolidayCountry, CountryHolidays> = {
  de: {
    label: 'Deutschland',
    fixed: [
      [0, 1, 'Neujahr'],
      [4, 1, 'Tag der Arbeit'],
      [9, 3, 'Tag der Deutschen Einheit'],
      [11, 25, '1. Weihnachtstag'],
      [11, 26, '2. Weihnachtstag']
    ],
    easter: [
      [-2, 'Karfreitag'],
      [1, 'Ostermontag'],
      [39, 'Christi Himmelfahrt'],
      [50, 'Pfingstmontag']
    ],
    nth: [],
    last: [],
    rules: []
  },
  at: {
    label: 'Österreich',
    fixed: [
      [0, 1, 'Neujahr'],
      [0, 6, 'Heilige Drei Könige'],
      [4, 1, 'Staatsfeiertag'],
      [7, 15, 'Mariä Himmelfahrt'],
      [9, 26, 'Nationalfeiertag'],
      [10, 1, 'Allerheiligen'],
      [11, 8, 'Mariä Empfängnis'],
      [11, 25, 'Christtag'],
      [11, 26, 'Stefanitag']
    ],
    easter: [
      [1, 'Ostermontag'],
      [39, 'Christi Himmelfahrt'],
      [50, 'Pfingstmontag'],
      [60, 'Fronleichnam']
    ],
    nth: [],
    last: [],
    rules: []
  },
  ch: {
    label: 'Schweiz',
    fixed: [
      [0, 1, 'Neujahr'],
      [0, 2, 'Berchtoldstag'],
      [7, 1, 'Nationalfeiertag'],
      [11, 25, 'Weihnachten']
    ],
    easter: [
      [-2, 'Karfreitag'],
      [1, 'Ostermontag'],
      [39, 'Auffahrt'],
      [50, 'Pfingstmontag']
    ],
    nth: [],
    last: [],
    rules: []
  },
  us: {
    label: 'United States',
    fixed: [
      [0, 1, "New Year's Day"],
      [5, 19, 'Juneteenth'],
      [6, 4, 'Independence Day'],
      [10, 11, 'Veterans Day'],
      [11, 25, 'Christmas Day']
    ],
    easter: [],
    nth: [
      [0, 3, 1, 'MLK Day'],
      [1, 3, 1, "Washington's Birthday"],
      [8, 1, 1, 'Labor Day'],
      [9, 2, 1, 'Columbus Day'],
      [10, 4, 4, 'Thanksgiving']
    ],
    last: [[4, 1, 'Memorial Day']],
    rules: []
  },
  gb: {
    label: 'United Kingdom',
    fixed: [
      [0, 1, "New Year's Day"],
      [11, 25, 'Christmas Day'],
      [11, 26, 'Boxing Day']
    ],
    easter: [
      [-2, 'Good Friday'],
      [1, 'Easter Monday']
    ],
    nth: [[4, 1, 1, 'Early May Bank Holiday']],
    last: [
      [4, 1, 'Spring Bank Holiday'],
      [7, 1, 'Summer Bank Holiday']
    ],
    rules: []
  },
  fr: {
    label: 'France',
    fixed: [
      [0, 1, "Jour de l'an"],
      [4, 1, 'Fête du Travail'],
      [4, 8, 'Victoire 1945'],
      [6, 14, 'Fête nationale'],
      [7, 15, 'Assomption'],
      [10, 1, 'Toussaint'],
      [10, 11, 'Armistice'],
      [11, 25, 'Noël']
    ],
    easter: [
      [1, 'Lundi de Pâques'],
      [39, 'Ascension'],
      [50, 'Pentecôte']
    ],
    nth: [],
    last: [],
    rules: []
  },
  es: {
    label: 'España',
    fixed: [
      [0, 1, 'Año Nuevo'],
      [0, 6, 'Epifanía del Señor'],
      [4, 1, 'Día del Trabajador'],
      [7, 15, 'Asunción de la Virgen'],
      [9, 12, 'Fiesta Nacional de España'],
      [10, 1, 'Todos los Santos'],
      [11, 6, 'Día de la Constitución'],
      [11, 8, 'Inmaculada Concepción'],
      [11, 25, 'Natividad del Señor']
    ],
    easter: [
      [-2, 'Viernes Santo'],
      [1, 'Lunes de Pascua']
    ],
    nth: [],
    last: [],
    rules: []
  },
  it: {
    label: 'Italia',
    fixed: [
      [0, 1, 'Capodanno'],
      [0, 6, 'Epifania'],
      [3, 25, 'Liberazione'],
      [4, 1, 'Festa del Lavoro'],
      [5, 2, 'Festa della Repubblica'],
      [7, 15, 'Ferragosto'],
      [10, 1, 'Ognissanti'],
      [11, 8, 'Immacolata Concezione'],
      [11, 25, 'Natale'],
      [11, 26, 'Santo Stefano']
    ],
    easter: [
      [0, 'Pasqua'],
      [1, 'Lunedì dell\u2019Angelo']
    ],
    nth: [],
    last: [],
    rules: []
  },
  nl: {
    label: 'Nederland',
    fixed: [
      [0, 1, 'Nieuwjaarsdag'],
      [3, 27, 'Koningsdag'],
      [4, 5, 'Bevrijdingsdag'],
      [11, 25, 'Eerste kerstdag'],
      [11, 26, 'Tweede kerstdag']
    ],
    easter: [
      [-2, 'Goede Vrijdag'],
      [1, 'Tweede paasdag'],
      [39, 'Hemelvaartsdag'],
      [50, 'Tweede pinksterdag']
    ],
    nth: [],
    last: [],
    rules: []
  },
  pl: {
    label: 'Polska',
    fixed: [
      [0, 1, 'Nowy Rok'],
      [0, 6, 'Święto Trzech Króli'],
      [4, 1, 'Święto Pracy'],
      [4, 3, 'Święto Konstytucji'],
      [7, 15, 'Wniebowzięcie NMP'],
      [10, 1, 'Wszystkich Świętych'],
      [10, 11, 'Narodowe Święto Niepodległości'],
      [11, 25, 'Boże Narodzenie'],
      [11, 26, 'Drugi dzień Bożego Narodzenia']
    ],
    easter: [
      [0, 'Wielkanoc'],
      [1, 'Poniedziałek Wielkanocny'],
      [60, 'Boże Ciało']
    ],
    nth: [],
    last: [],
    rules: []
  },
  se: {
    label: 'Sverige',
    fixed: [
      [0, 1, 'Nyårsdagen'],
      [0, 6, 'Trettondedag jul'],
      [4, 1, 'Första maj'],
      [5, 6, 'Sveriges nationaldag'],
      [11, 25, 'Juldagen'],
      [11, 26, 'Annandag jul']
    ],
    easter: [
      [-2, 'Långfredagen'],
      [0, 'Påskdagen'],
      [1, 'Annandag påsk'],
      [39, 'Kristi himmelsfärd'],
      [49, 'Pingstdagen']
    ],
    nth: [],
    last: [],
    rules: [
      (year) => {
        const d = new Date(year, 5, 20)
        const shift = (5 - d.getDay() + 7) % 7
        return { date: addDays(d, shift), name: 'Midsommarafton' }
      }
    ]
  },
  jp: {
    label: '日本',
    fixed: [
      [0, 1, '元日'],
      [1, 11, '建国記念の日'],
      [1, 23, '天皇誕生日'],
      [3, 29, '昭和の日'],
      [4, 3, '憲法記念日'],
      [4, 4, 'みどりの日'],
      [4, 5, 'こどもの日'],
      [7, 11, '山の日'],
      [10, 3, '文化の日'],
      [10, 23, '勤労感謝の日']
    ],
    easter: [],
    nth: [
      [0, 2, 1, '成人の日'],
      [6, 3, 1, '海の日'],
      [8, 3, 1, '敬老の日'],
      [9, 2, 1, 'スポーツの日']
    ],
    last: [],
    rules: [
      (year) => {
        const d = Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4))
        return { date: new Date(year, 2, d), name: '春分の日' }
      },
      (year) => {
        const d = Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4))
        return { date: new Date(year, 8, d), name: '秋分の日' }
      }
    ]
  }
}

/** All supported countries with display labels (for settings UI). */
export const HOLIDAY_COUNTRIES: Array<{ code: HolidayCountry; label: string }> = (
  Object.keys(COUNTRIES) as HolidayCountry[]
).map((code) => ({ code, label: COUNTRIES[code].label }))

function nthWeekday(year: number, month0: number, nth: number, weekday: number): Date {
  const first = new Date(year, month0, 1)
  const shift = (weekday - first.getDay() + 7) % 7
  return addDays(first, shift + (nth - 1) * 7)
}

function lastWeekday(year: number, month0: number, weekday: number): Date {
  const last = new Date(year, month0 + 1, 0)
  const shift = (last.getDay() - weekday + 7) % 7
  return addDays(last, -shift)
}

/** National public holidays for a country in a given year. */
export function holidaysForYear(year: number, country: HolidayCountry = 'de'): Holiday[] {
  const spec = COUNTRIES[country] ?? EMPTY
  const easter = easterSunday(year)
  const out: Holiday[] = [
    ...spec.fixed.map(([m, d, name]) => ({ date: new Date(year, m, d), name })),
    ...spec.easter.map(([offset, name]) => ({ date: addDays(easter, offset), name })),
    ...spec.nth.map(([m, n, wd, name]) => ({ date: nthWeekday(year, m, n, wd), name })),
    ...spec.last.map(([m, wd, name]) => ({ date: lastWeekday(year, m, wd), name }))
  ]
  for (const rule of spec.rules) {
    const h = rule(year)
    if (h && h.date.getFullYear() === year) out.push(h)
  }
  return out
}

/** Map of yyyy-MM-dd → holiday name for a year span. */
export function holidaysBetween(from: Date, to: Date, country: HolidayCountry = 'de'): Map<string, string> {
  const map = new Map<string, string>()
  for (let y = from.getFullYear(); y <= to.getFullYear(); y++) {
    for (const h of holidaysForYear(y, country)) {
      const key = `${h.date.getFullYear()}-${String(h.date.getMonth() + 1).padStart(2, '0')}-${String(h.date.getDate()).padStart(2, '0')}`
      map.set(key, h.name)
    }
  }
  return map
}
