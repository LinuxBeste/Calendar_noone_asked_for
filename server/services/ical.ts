import type { Event, EventInput, Reminder } from '@shared/types'

export interface ICalEvent {
  uid: string
  title: string
  description?: string
  location?: string
  allDay: boolean
  startDate?: string
  endDate?: string
  startsAt?: string
  endsAt?: string
  rrule?: string
  reminderMinutes?: number
  color?: string
}

const ESCAPE = (s: string): string => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
const UNESCAPE = (s: string): string => s.replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\')

function fold(line: string): string[] {
  const out: string[] = []
  let cur = ''
  for (let i = 0; i < line.length; i++) {
    cur += line[i]
    if (cur.length >= 74) {
      out.push(cur)
      cur = ' '
    }
  }
  if (cur.trim().length > 0) out.push(cur)
  return out
}

function dateToICal(d: Date, allDay: boolean): string {
  if (allDay) {
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  }
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`
}

function localYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function localIso(d: Date): string {
  return `${localYmd(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:00.000`
}

function toDate(ical: string): Date {
  const m = ical.match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?/)
  if (!m) throw new Error('Invalid date: ' + ical)
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), m[4] ? Number(m[4]) : 0, m[5] ? Number(m[5]) : 0, m[6] ? Number(m[6]) : 0)
}

export function parseRruleToFreq(rrule: string): 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY' | null {
  const m = rrule.match(/FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)/)
  return m ? (m[1] as 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY') : null
}

/** Serializes events (incl. exceptions as separate VELEMENTS) into an .ics string. */
export function serializeICal(events: Array<{ ev: Event; reminders: Reminder[] }>): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Calendar//EN',
    'CALSCALE:GREGORIAN'
  ]
  for (const { ev, reminders } of events) {
    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${ev.id}@calendar`)
    lines.push('DTSTAMP:19700101T000000Z')
    lines.push(`SUMMARY:${ESCAPE(ev.title)}`)
    if (ev.description) lines.push(`DESCRIPTION:${ESCAPE(ev.description)}`)
    if (ev.location) lines.push(`LOCATION:${ESCAPE(ev.location)}`)
    if (ev.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${dateToICal(new Date(ev.startDate! + 'T00:00:00'), true)}`)
      lines.push(`DTEND;VALUE=DATE:${dateToICal(new Date(ev.endDate! + 'T00:00:00'), true)}`)
    } else if (ev.startsAt) {
      lines.push(`DTSTART:${dateToICal(new Date(ev.startsAt), false)}`)
      lines.push(`DTEND:${dateToICal(new Date(ev.endsAt!), false)}`)
    }
    if (ev.rrule) {
      const parts = ev.rrule.startsWith('DTSTART') ? ev.rrule.split('\n') : [`DTSTART:${dateToICal(new Date(ev.allDay ? ev.startDate! + 'T00:00:00' : ev.startsAt!), ev.allDay)}`, ev.rrule]
      for (const l of parts) {
        const cleaned = l.startsWith('DTSTART:') || l.startsWith('RRULE:') ? l : 'RRULE:' + l
        for (const f of fold(cleaned)) lines.push(f)
      }
    }
    if (reminders.length > 0) {
      const minutes = reminders[0]!.minutes
      const trigger = `TRIGGER:-PT${minutes}M`
      lines.push('BEGIN:VALARM')
      lines.push('ACTION:DISPLAY')
      lines.push(trigger)
      lines.push('DESCRIPTION:Reminder')
      lines.push('END:VALARM')
    }
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n') + '\r\n'
}

/** Parses an .ics string into importable event inputs (exceptions become standalone events). */
export function parseICal(content: string): ICalEvent[] {
  const out: ICalEvent[] = []
  const lines: string[] = []
  for (const raw of content.split(/\r?\n/)) {
    if ((raw.startsWith(' ') || raw.startsWith('\t')) && lines.length > 0) {
      lines[lines.length - 1] += raw.slice(1)
    } else if (raw.trim().length > 0) {
      lines.push(raw)
    }
  }

  let inEvent = false
  let props = new Map<string, string>()
  const flush = (): void => {
    if (!inEvent) return
    const summary = props.get('SUMMARY')
    if (summary) {
      const dtstartRaw = props.get('DTSTART') ?? ''
      const dtendRaw = props.get('DTEND')
      const allDay = dtstartRaw.includes('VALUE=DATE') || /^\d{8}$/.test(dtstartRaw)
      const start = toDate(dtstartRaw.replace(/.*?:/, ''))
      const end = dtendRaw ? toDate(dtendRaw.replace(/.*?:/, '')) : undefined

      const rrule = props.get('RRULE')
      const alarmMin = (props.get('TRIGGER')?.match(/-?P?T?(\d+)M/) ?? [])[1]

      out.push({
        uid: props.get('UID') ?? crypto.randomUUID(),
        title: UNESCAPE(summary),
        description: props.get('DESCRIPTION') ? UNESCAPE(props.get('DESCRIPTION')!) : undefined,
        location: props.get('LOCATION') ? UNESCAPE(props.get('LOCATION')!) : undefined,
        allDay,
        startDate: allDay ? localYmd(start) : undefined,
        endDate: allDay ? localYmd(end ?? start) : undefined,
        startsAt: !allDay ? localIso(start) : undefined,
        endsAt: !allDay ? (end ? localIso(end) : undefined) : undefined,
        rrule: rrule ? 'RRULE:' + rrule : undefined,
        reminderMinutes: alarmMin ? Number(alarmMin) : undefined
      })
    }
    props = new Map()
  }

  for (const line of lines) {
    if (line.startsWith('BEGIN:VEVENT')) {
      flush()
      inEvent = true
      props = new Map()
      continue
    }
    if (line.startsWith('END:VEVENT')) {
      flush()
      inEvent = false
      continue
    }
    if (!inEvent) continue
    const colon = line.indexOf(':')
    if (colon < 0) continue
    const key = line.slice(0, colon).split(';')[0]!.toUpperCase()
    const value = line.slice(colon + 1)
    if (key === 'RRULE' || key === 'TRIGGER') {
      props.set(key, value)
    } else if (!props.has(key)) {
      props.set(key, value)
    }
  }
  flush()
  return out
}

/** Converts parsed iCal events into EventInput for a target calendar. */
export function toEventInputs(events: ICalEvent[], calendarId: string): EventInput[] {
  return events.map((e) => ({
    calendarId,
    title: e.title,
    description: e.description,
    location: e.location,
    allDay: e.allDay,
    startDate: e.startDate,
    endDate: e.endDate,
    startsAt: e.startsAt,
    endsAt: e.endsAt,
    rrule: e.rrule
  }))
}
