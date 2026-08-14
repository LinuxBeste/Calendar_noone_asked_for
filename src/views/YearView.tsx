import { useMemo, useState, useEffect } from 'react'
import { format, isSameDay, isToday, addMonths } from 'date-fns'
import { useCalendar, useAuth } from '../store'
import { startOfYear, endOfYear, toISO, iterateDays } from '../utils/date'
import type { Event, EventOccurrence } from '@shared/types'

interface YearViewProps {
  date: Date
}

export default function YearView({ date }: YearViewProps): React.JSX.Element {
  const { events, calendars, refreshEvents, settings, setDate, setView, visibleCalendars } = useCalendar()
  const { token } = useAuth()
  const [selected, setSelected] = useState(date)

  useEffect(() => {
    void refreshEvents(toISO(startOfYear(date)), toISO(endOfYear(date)))
  }, [date, refreshEvents, token])

  const months = useMemo(() => {
    const out: { name: string; days: Date[]; events: EventOccurrence[] }[] = []
    for (let m = 0; m < 12; m++) {
      const first = new Date(date.getFullYear(), m, 1)
      const days = [...iterateDays(new Date(date.getFullYear(), m, 1), new Date(date.getFullYear(), m + 1, 0))]
      const evs = events.filter((e) => visibleCalendars[e.event.calendarId] !== false && e.start.startsWith(`${date.getFullYear()}-${String(m + 1).padStart(2, '0')}`))
      out.push({ name: format(first, 'MMMM'), days, events: evs })
    }
    return out
  }, [events, date, visibleCalendars])

  const calendarById = useMemo(() => new Map(calendars.map((c) => [c.id, c])), [calendars])

  const jump = (d: Date): void => {
    setSelected(d)
    setDate(d)
    setView('month')
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {months.map((month, m) => (
          <div key={month.name} className="text-sm">
            <h3 className="font-medium text-gray-800 dark:text-gray-100 mb-2">
              <button onClick={() => jump(new Date(date.getFullYear(), m, 1))} className="hover:text-accent">
                {month.name}
              </button>
            </h3>
            <div className="grid grid-cols-7 gap-y-0.5 text-center text-[10px] text-gray-400 mb-1">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].slice(settings.firstDayOfWeek).concat(['S', 'M', 'T', 'W', 'T', 'F', 'S'].slice(0, settings.firstDayOfWeek)).map((d, i) => (
                <span key={i}>{d}</span>
              ))}            </div>
            <div className="grid grid-cols-7 gap-y-0.5">
              {month.days.map((d, i) => {
                const ev = month.events.find((e) => e.start.slice(0, 10) === format(d, 'yyyy-MM-dd'))
                const cal = ev ? calendarById.get(ev.event.calendarId) : undefined
                return (
                  <button
                    key={i}
                    onClick={() => jump(d)}
                    className={`h-6 w-6 mx-auto flex items-center justify-center rounded-full text-xs ${
                      isToday(d) ? 'bg-accent text-white font-medium' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    {d.getDate()}
                    {ev && <span className="absolute translate-y-2.5 h-1 w-1 rounded-full" style={{ backgroundColor: ev.event.color ?? cal?.color }} />}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
