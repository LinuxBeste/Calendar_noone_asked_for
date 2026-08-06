import { useMemo, useState, useEffect } from 'react'
import { format, isToday, addDays, isSameDay } from 'date-fns'
import { useCalendar, useAuth } from '../store'
import { rangeStart, rangeEnd, toISO, iterateDays } from '../utils/date'
import type { Event, EventOccurrence } from '@shared/types'
import EventDialog from '../components/EventDialog'

interface AgendaViewProps {
  date: Date
  days: number
}

export default function AgendaView({ date, days }: AgendaViewProps): React.JSX.Element {
  const { events, calendars, refreshEvents, settings } = useCalendar()
  const { token } = useAuth()
  const [dialog, setDialog] = useState<{ event?: Event; occurrence?: string } | null>(null)

  const from = rangeStart('day', date, settings.firstDayOfWeek)
  const to = new Date(from.getTime() + days * 86400000)

  useEffect(() => {
    void refreshEvents(toISO(from), toISO(to))
  }, [from, to, refreshEvents, token])

  const byDay = useMemo(() => {
    const map = new Map<string, EventOccurrence[]>()
    for (const occ of events) {
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
    for (const list of map.values()) {
      list.sort((a, b) => {
        if (a.allDay && !b.allDay) return -1
        if (!a.allDay && b.allDay) return 1
        return a.start.localeCompare(b.start)
      })
    }
    return map
  }, [events])

  const calendarById = useMemo(() => new Map(calendars.map((c) => [c.id, c])), [calendars])

  return (
    <div className="flex-1 overflow-y-auto">
      {[...iterateDays(from, new Date(to.getTime() - 1))].map((d) => {
        const key = format(d, 'yyyy-MM-dd')
        const dayEvents = byDay.get(key) ?? []
        if (dayEvents.length === 0) return null
        return (
          <div key={key} className="px-6 py-3">
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-sm font-medium ${isToday(d) ? 'text-blue-600' : 'text-gray-800 dark:text-gray-100'}`}>
                {format(d, 'EEEE, MMMM d')}
              </span>
              {isToday(d) && <span className="text-xs text-blue-600 bg-blue-100 dark:bg-blue-900/40 px-2 py-0.5 rounded-full">Today</span>}
            </div>
            <div className="space-y-1">
              {dayEvents.map((occ) => {
                const ev = occ.event
                const cal = calendarById.get(ev.calendarId)
                const color = ev.color ?? cal?.color ?? '#1a73e8'
                const isPast = new Date(occ.end).getTime() < Date.now()
                return (
                  <button
                    key={ev.id + key}
                    onClick={() => setDialog({ event: ev, occurrence: format(new Date(occ.start), 'yyyy-MM-dd') })}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-left ${isPast ? 'opacity-45' : ''}`}
                  >
                    <span className="w-1 self-stretch rounded-full" style={{ backgroundColor: color }} />
                    <span className="text-xs text-gray-500 dark:text-gray-400 w-28 shrink-0">
                      {occ.allDay ? 'All day' : `${format(new Date(occ.start), settings.timeFormat === '12h' ? 'h:mm a' : 'HH:mm')} – ${format(new Date(occ.end), settings.timeFormat === '12h' ? 'h:mm a' : 'HH:mm')}`}
                    </span>
                    <span className="flex-1 text-sm text-gray-800 dark:text-gray-100 truncate">
                      {ev.title}
                      {ev.location && <span className="text-gray-400"> · {ev.location}</span>}
                    </span>
                    <span className="text-xs text-gray-400">{cal?.name}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
      {[...iterateDays(from, new Date(to.getTime() - 1))].every((d) => (byDay.get(format(d, 'yyyy-MM-dd')) ?? []).length === 0) && (
        <div className="h-full flex flex-col items-center justify-center text-gray-400">
          <p className="text-lg">No events in this range</p>
          <p className="text-sm">Create an event to see it here.</p>
        </div>
      )}
      {dialog && <EventDialog event={dialog.event} occurrence={dialog.occurrence} onClose={() => setDialog(null)} />}
    </div>
  )
}
