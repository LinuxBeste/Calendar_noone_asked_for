import { useMemo, useState, useEffect } from 'react'
import { format, isToday, addDays, isSameDay } from 'date-fns'
import { useCalendar, useAuth } from '../store'
import { rangeStart, rangeEnd, toISO, iterateDays, isoWeekNumber } from '../utils/date'
import { holidaysBetween } from '../utils/holidays'
import type { Event, EventOccurrence } from '@shared/types'
import EventDialog from '../components/EventDialog'

interface AgendaViewProps {
  date: Date
  days: number
}

export default function AgendaView({ date, days }: AgendaViewProps): React.JSX.Element {
  const { events, calendars, refreshEvents, settings, visibleCalendars } = useCalendar()
  const { token } = useAuth()
  const [dialog, setDialog] = useState<{ event?: Event; occurrence?: string } | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const from = useMemo(() => rangeStart('day', date, settings.firstDayOfWeek), [date, settings.firstDayOfWeek])
  const to = useMemo(() => new Date(from.getTime() + days * 86400000), [from, days])

  useEffect(() => {
    void refreshEvents(toISO(from), toISO(to))
  }, [from, to, refreshEvents, token])

  const holidays = useMemo(
    () => (settings.agendaShowHolidays && settings.showHolidays ? holidaysBetween(from, to, settings.holidaysCountry) : new Map<string, string>()),
    [from, to, settings.agendaShowHolidays, settings.showHolidays, settings.holidaysCountry]
  )

  const byDay = useMemo(() => {
    const map = new Map<string, EventOccurrence[]>()
    for (const occ of events) {
      if (visibleCalendars[occ.event.calendarId] === false) continue
      const first = format(new Date(occ.start), 'yyyy-MM-dd')
      const last = format(new Date(occ.end), 'yyyy-MM-dd')
      let d = new Date(first + 'T00:00:00')
      const end = new Date(last + 'T00:00:00')
      while (d <= end) {
        const key = format(d, 'yyyy-MM-dd')
        map.set(key, [...(map.get(key) ?? []), occ])
        d = addDays(d, 1)
      }
    }
    const reversed = settings.agendaSortOrder === 'reversed'
    for (const list of map.values()) {
      list.sort((a, b) => {
        if (a.allDay && !b.allDay) return reversed ? 1 : -1
        if (!a.allDay && b.allDay) return reversed ? -1 : 1
        const cmp = a.start.localeCompare(b.start)
        return reversed ? -cmp : cmp
      })
    }
    return map
  }, [events, settings.agendaSortOrder, visibleCalendars])

  const calendarById = useMemo(() => new Map(calendars.map((c) => [c.id, c])), [calendars])

  const items = useMemo(() => {
    const today = format(new Date(), 'yyyy-MM-dd')
    const dayList = [...iterateDays(from, new Date(to.getTime() - 1))]
      .filter((d) => !settings.agendaCollapsePast || format(d, 'yyyy-MM-dd') >= today)
    const result: { type: 'week' | 'day'; date: Date; events?: EventOccurrence[] }[] = []
    let lastWeek = ''
    for (const d of dayList) {
      const key = format(d, 'yyyy-MM-dd')
      const dayEvents = byDay.get(key) ?? []
      if (settings.agendaGroupBy === 'week') {
        const weekKey = isoWeekNumber(d) + '-' + d.getFullYear()
        if (weekKey !== lastWeek) {
          lastWeek = weekKey
          result.push({ type: 'week', date: d })
        }
      }
      if (dayEvents.length > 0) result.push({ type: 'day', date: d, events: dayEvents })
    }
    if (settings.agendaSortOrder === 'reversed') result.reverse()
    return result
  }, [byDay, from, to, settings.agendaCollapsePast, settings.agendaGroupBy, settings.agendaSortOrder])

  const anyEvents = items.some((i) => i.type === 'day')

  return (
    <div className="flex-1 overflow-y-auto">
      {items.map((item, idx) => {
        if (item.type === 'week') {
          const weekStart = item.date
          const weekEnd = new Date(weekStart.getTime() + 6 * 86400000)
          return (
            <div key={`w-${idx}-${weekStart.toISOString()}`} className="px-6 pt-4 pb-1 text-xs uppercase tracking-wider text-gray-400 dark:text-gray-500">
              Week {isoWeekNumber(weekStart)} · {format(weekStart, 'MMM d')} – {format(weekEnd, 'MMM d')}
            </div>
          )
        }
        const key = format(item.date, 'yyyy-MM-dd')
        const dayEvents = item.events ?? []
        const max = Math.max(1, settings.agendaMaxItemsPerDay)
        const limited = dayEvents.length > max && !expanded.has(key)
        const shown = limited ? dayEvents.slice(0, max) : dayEvents
        const holiday = holidays.get(key)
        return (
          <div key={key} className="px-6 py-3">
            {settings.agendaShowWeekdayHeader && (
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-sm font-medium ${isToday(item.date) ? 'text-accent' : 'text-gray-800 dark:text-gray-100'}`}>
                  {format(item.date, 'EEEE, MMMM d')}
                </span>
                {isToday(item.date) && <span className="text-xs text-accent bg-accent/15 dark:bg-accent/25 px-2 py-0.5 rounded-full">Today</span>}
                {holiday && <span className="text-xs text-red-500 dark:text-red-400">{holiday}</span>}
              </div>
            )}
            <div className="space-y-1">
              {shown.map((occ) => {
                const ev = occ.event
                const cal = calendarById.get(ev.calendarId)
                const color = ev.color ?? cal?.color ?? '#1a73e8'
                const isPast = new Date(occ.end).getTime() < Date.now()
                const timeText = occ.allDay
                  ? 'All day'
                  : settings.agendaShowEndTime
                    ? `${format(new Date(occ.start), settings.timeFormat === '12h' ? 'h:mm a' : 'HH:mm')} – ${format(new Date(occ.end), settings.timeFormat === '12h' ? 'h:mm a' : 'HH:mm')}`
                    : format(new Date(occ.start), settings.timeFormat === '12h' ? 'h:mm a' : 'HH:mm')
                return (
                  <button
                    key={ev.id + key}
                    onClick={() => setDialog({ event: ev, occurrence: format(new Date(occ.start), 'yyyy-MM-dd') })}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-left ${isPast ? 'opacity-45' : ''}`}
                  >
                    <span className="w-1 self-stretch rounded-full shrink-0" style={{ backgroundColor: color }} />
                    {settings.agendaShowTime && (
                      <span className="text-xs text-gray-500 dark:text-gray-400 w-28 shrink-0">{timeText}</span>
                    )}
                    <span className="flex-1 text-sm text-gray-800 dark:text-gray-100 truncate">
                      {settings.agendaShowIcons && ev.icon ? ev.icon + ' ' : ''}{ev.title}
                      {settings.agendaShowLocation && ev.location && <span className="text-gray-400"> · {ev.location}</span>}
                    </span>
                    <span className="text-xs text-gray-400 shrink-0">{cal?.name}</span>
                  </button>
                )
              })}
              {limited && (
                <button
                  onClick={() => setExpanded((s) => new Set(s).add(key))}
                  className="w-full text-left px-3 py-1 text-xs text-accent hover:underline"
                >
                  +{dayEvents.length - max} more
                </button>
              )}
            </div>
          </div>
        )
      })}
      {!anyEvents && (
        <div className="h-full flex flex-col items-center justify-center text-gray-400">
          <p className="text-lg">No events in this range</p>
          <p className="text-sm">Create an event to see it here.</p>
        </div>
      )}
      {dialog && <EventDialog event={dialog.event} occurrence={dialog.occurrence} onClose={() => setDialog(null)} />}
    </div>
  )
}
