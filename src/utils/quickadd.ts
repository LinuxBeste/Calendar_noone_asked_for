const WEEKDAYS: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sun: 0,
  mon: 1,
  tue: 2,
  tues: 2,
  wed: 3,
  thu: 4,
  thur: 4,
  fri: 5,
  sat: 6
}

export interface QuickAddResult {
  title: string
  allDay: boolean
  startsAt?: string
  endsAt?: string
  startDate?: string
  endDate?: string
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00.000`
}

function nextWeekday(day: number, from: Date, skipToday: boolean): Date {
  const d = new Date(from)
  d.setHours(0, 0, 0, 0)
  const current = d.getDay()
  if (skipToday && current === day) d.setDate(d.getDate() + 7)
  else {
    let diff = (day - current + 7) % 7
    if (!skipToday && diff === 0) diff = 0
    else if (diff === 0) diff = 7
    d.setDate(d.getDate() + diff)
  }
  return d
}

function parseDateLiteral(text: string): { date: Date; consumed: string } | null {
  const m = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/)
  if (m) {
    const now = new Date()
    const year = m[3] ? Number(m[3].length === 2 ? '20' + m[3] : m[3]) : now.getFullYear()
    const d = new Date(year, Number(m[1]) - 1, Number(m[2]))
    if (!Number.isNaN(d.getTime())) return { date: d, consumed: m[0] }
  }
  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
    if (!Number.isNaN(d.getTime())) return { date: d, consumed: iso[0] }
  }
  const eur = text.match(/\b(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?\b/)
  if (eur) {
    const now = new Date()
    const year = eur[3] ? Number(eur[3].length === 2 ? '20' + eur[3] : eur[3]) : now.getFullYear()
    const d = new Date(year, Number(eur[2]) - 1, Number(eur[1]))
    if (!Number.isNaN(d.getTime())) return { date: d, consumed: eur[0] }
  }
  return null
}

/**
 * Parses natural-language quick-add input, e.g.
 * "Lunch with team tomorrow at 12:30 for 1h", "Gym next monday 7pm",
 * "All day off 25.12.", "Standup on 12/25 at 9am".
 */
/** Resolves just the date part of a phrase ("friday", "12/25", "tomorrow", "2026-08-01", "25.12."). */
export function resolveDate(input: string, now: Date): Date | null {
  let text = input.trim().toLowerCase()
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  if (/\bday after tomorrow\b/.test(text)) {
    d.setDate(d.getDate() + 2)
    return d
  }
  if (/\b(tomorrow|day after)\b/.test(text)) {
    d.setDate(d.getDate() + 1)
    return d
  }
  if (/\btoday\b/.test(text)) return d
  const wd = text.match(/\b(?:next|this)?\s*(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|fri|sat)\b/)
  if (wd) {
    const day = WEEKDAYS[wd[1]!.toLowerCase()]!
    return nextWeekday(day, now, text.includes('next') && now.getDay() === day)
  }
  const lit = parseDateLiteral(text)
  if (lit) return lit.date
  return null
}

export function parseQuickAdd(input: string, now: Date, defaultDurationMinutes: number): QuickAddResult | null {
  let text = input.trim()
  if (!text) return null

  const isAllDay = /\b(?:all[- ]?day|fullday|day off|off)\b/i.test(text)

  let date: Date | null = null

  const relative = text.match(/\b(day after tomorrow|day after|tomorrow|today)\b/i)
  if (relative) {
    const d = new Date(now)
    d.setHours(0, 0, 0, 0)
    const word = relative[0].toLowerCase()
    if (word === 'tomorrow' || word === 'day after') d.setDate(d.getDate() + 1)
    if (word === 'day after tomorrow') d.setDate(d.getDate() + 2)
    date = d
    text = text.replace(relative[0], '').replace(/\s+/g, ' ').trim()
  }

  const weekdayMatch = text.match(/\b(?:next|this)\s+(?:on\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|fri|sat)\b/i)
  const plainWeekday = text.match(/\b(?:on\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|fri|sat)\b/i)
  if (!date && weekdayMatch) {
    const day = WEEKDAYS[weekdayMatch[1]!.toLowerCase()]!
    const skip = weekdayMatch[0].toLowerCase().startsWith('next')
    date = nextWeekday(day, now, skip)
    text = text.replace(weekdayMatch[0], '').replace(/\s+/g, ' ').trim()
  } else if (!date && plainWeekday) {
    const day = WEEKDAYS[plainWeekday[1]!.toLowerCase()]!
    const today = now.getDay()
    if (day === today) {
      date = new Date(now)
      date.setHours(0, 0, 0, 0)
    } else {
      date = nextWeekday(day, now, false)
    }
    text = text.replace(plainWeekday[0], '').replace(/\s+/g, ' ').trim()
  }

  if (!date) {
    const lit = parseDateLiteral(text)
    if (lit) {
      date = lit.date
      text = text.replace(lit.consumed, '').replace(/\s+/g, ' ').trim()
    }
  }

  const dateTarget = date ?? (() => {
    const d = new Date(now)
    d.setHours(0, 0, 0, 0)
    return d
  })()

  let time: { h: number; m: number } | null = null
  const ampm = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i)
  const military = text.match(/\b(\d{1,2}):(\d{2})\b/)
  if (ampm) {
    let h = Number(ampm[1]) % 12
    if (ampm[3]?.toLowerCase() === 'pm') h += 12
    time = { h, m: Number(ampm[2] ?? 0) }
    text = text.replace(ampm[0], '').replace(/\s+/g, ' ').trim()
  } else if (military) {
    const h = Number(military[1])
    const m = Number(military[2])
    if (h <= 23 && m <= 59) {
      time = { h, m }
      text = text.replace(military[0], '').replace(/\s+/g, ' ').trim()
    }
  }

  let durationMinutes = defaultDurationMinutes
  const dur = text.match(/\b(?:for\s+)?(\d+)\s*(?:hours?|hrs?|h)\b/i)
  const durMin = text.match(/\b(?:for\s+)?(\d+)\s*(?:minutes?|mins?|min)\b/i)
  const durCombined = text.match(/\b(?:for\s+)?(\d+)h\s*(\d+)m\b/i)
  if (durCombined) {
    durationMinutes = Number(durCombined[1]) * 60 + Number(durCombined[2])
    text = text.replace(durCombined[0], '').replace(/\s+/g, ' ').trim()
  } else if (dur) {
    durationMinutes = Number(dur[1]) * 60
    text = text.replace(dur[0], '').replace(/\s+/g, ' ').trim()
  } else if (durMin) {
    durationMinutes = Number(durMin[1])
    text = text.replace(durMin[0], '').replace(/\s+/g, ' ').trim()
  }

  text = text.replace(/\b(?:at|on|for|next|this)\b/gi, '').replace(/\s+/g, ' ').trim()
  const title = text.replace(/\b(?:all[- ]?day|fullday|day off|off)\b/gi, '').replace(/\s+/g, ' ').trim()
  if (!title) return null

  if (!time || isAllDay) {
    return {
      title,
      allDay: true,
      startDate: `${dateTarget.getFullYear()}-${pad(dateTarget.getMonth() + 1)}-${pad(dateTarget.getDate())}`,
      endDate: `${dateTarget.getFullYear()}-${pad(dateTarget.getMonth() + 1)}-${pad(dateTarget.getDate())}`
    }
  }

  const start = new Date(dateTarget)
  start.setHours(time.h, time.m, 0, 0)
  const end = new Date(start.getTime() + durationMinutes * 60000)
  return {
    title,
    allDay: false,
    startsAt: isoLocal(start),
    endsAt: isoLocal(end)
  }
}
