import { useMemo, useState, useEffect } from 'react'
import { format, isSameDay, isToday, isSameMonth } from 'date-fns'
import { useCalendar, useAuth } from '../store'
import { rangeStart, rangeEnd, toISO, iterateDays } from '../utils/date'
import type { Event } from '@shared/types'
import EventDialog from './EventDialog'

interface MonthViewProps {
  date: Date
}

export default function MonthView({ date }: MonthViewProps): React.JSX.Element {
  const { events, calendars, refreshEvents, settings } = useCalendar()
  const { token } = useAuth()
  const [dialog, setDialog] = useState<{ event?: Event; date?: Date } | null>(null)

  useEffect(() => {
    const from = rangeStart('month', date, settings.firstDayOfWeek)
    const to = rangeEnd('month', date, settings.firstDayOfWeek)
    void refreshEvents(toISO(from), toISO(to))
  }, [date, settings.firstDayOfWeek, refreshEvents, token])

  const { days, byDay } = useMemo(() => {
    const from = rangeStart('month', date, settings.firstDayOfWeek)
    const to = rangeEnd('month', date, settings.firstDayOfWeek)
    const days = [...iterateDays(from, to)]
    const byDay = new Map<string, Event[]>()
    for (const ev of Object.values(events).flat()) {
      const first = ev.startDate ?? (ev.startsAt ? format(new Date(ev.startsAt), 'yyyy-MM-dd') : null)
      if (!first) continue
      const last = ev.endDate ?? first
      let d = new Date(first + 'T00:00:00')
      const end = new Date(last + 'T00:00:00')
      while (d <= end) {
        const key = format(d, 'yyyy-MM-dd')
        byDay.set(key, [...(byDay.get(key) ?? []), ev])
        d = new Date(d.getTime() + 86400000)
      }
    }
    for (const list of byDay.values()) list.sort((a, b) => (a.allDay ? -1 : 1))
    return { days, byDay }
  }, [events, date, settings.firstDayOfWeek])

  const calendarById = useMemo(() => new Map(calendars.map((c) => [c.id, c])), [calendars])

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="grid grid-cols-7 text-center text-sm text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700 py-1 shrink-0">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
          .slice(settings.firstDayOfWeek)
          .concat(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].slice(0, settings.firstDayOfWeek))
          .map((d, i) => (
            <span key={i}>{d}</span>
          ))}
      </div>
      <div className="flex-1 grid grid-cols-7 grid-rows-5 overflow-hidden">
        {days.map((d, i) => {
          const key = format(d, 'yyyy-MM-dd')
          const dayEvents = byDay.get(key) ?? []
          const visible = dayEvents.slice(0, 3)
          const extra = dayEvents.length - visible.length
          const weekend = d.getDay() === 0 || d.getDay() === 6
          const selected = isSameDay(d, date)
          return (
            <div
              key={i}
              onClick={() => setDialog({ date: d })}
              className={`border-b border-r border-gray-200 dark:border-gray-700 p-1 overflow-hidden cursor-pointer
                ${weekend ? 'bg-gray-50 dark:bg-gray-800/60' : ''} ${selected ? 'ring-1 ring-inset ring-blue-500' : ''}`}
            >
              <div className="flex items-center justify-between px-0.5 mb-0.5">
                <span
                  className={`text-xs h-6 w-6 flex items-center justify-center rounded-full ${
                    isToday(d)
                      ? 'bg-blue-600 text-white font-medium'
                      : isSameMonth(d, date)
                        ? 'text-gray-700 dark:text-gray-200'
                        : 'text-gray-400 dark:text-gray-600'
                  }`}
                >
                  {d.getDate()}
                </span>
                {settings.showWeekNumbers && i % 7 === 0 && (
                  <span className="text-[10px] text-gray-400">{weekNumber(d)}</span>
                )}
              </div>
              <div className="space-y-0.5">
                {visible.map((ev) => {
                  const cal = calendarById.get(ev.calendarId)
                  const color = ev.color ?? cal?.color ?? '#1a73e8'
                  const continues = ev.endDate ? new Date(ev.endDate + 'T00:00:00') > d : false
                  return (
                    <button
                      key={ev.id}
                      onClick={(e) => {
                        e.stopPropagation()
                        setDialog({ event: ev })
                      }}
                      className={`w-full text-left text-[11px] px-1 py-0.5 rounded truncate hover:shadow ${continues ? '' : 'rounded-r-full'}`}
                      style={{ backgroundColor: color + '22', color }}
                      title={ev.title}
                    >
                      {ev.allDay ? '' : format(new Date(ev.startsAt!), 'H:mm') + ' '}
                      {ev.title}
                    </button>
                  )
                })}
                {extra > 0 && (
                  <span className="text-[11px] text-gray-500 dark:text-gray-400 pl-1">+{extra} more</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
      {dialog && (
        <EventDialog
          event={dialog.event}
          defaultDate={dialog.date}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  )
}

function weekNumber(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 1)
  const diff = (d.getTime() - start.getTime() + ((start.getTimezoneOffset() - d.getTimezoneOffset()) * 60000)) / 86400000
  return Math.ceil((diff + ((start.getDay() + 1) % 7)) / 7)
}
