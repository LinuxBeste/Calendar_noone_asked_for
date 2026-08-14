import { useMemo, useEffect, useState } from 'react'
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  subMonths,
  format,
  isSameDay,
  isToday
} from 'date-fns'
import { useCalendar } from '../store'
import type { EventOccurrence } from '@shared/types'

interface MiniCalendarProps {
  weekStartsOn: 0 | 1
}

export default function MiniCalendar({ weekStartsOn }: MiniCalendarProps): React.JSX.Element {
  const { date, setDate, events } = useCalendar()
  const [cursor, setCursor] = useState(date)

  useEffect(() => {
    setCursor(date)
  }, [date.getFullYear(), date.getMonth()])

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn })
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn })
    const out: Date[] = []
    let d = start
    while (d <= end) {
      out.push(d)
      d = addDays(d, 1)
    }
    return out
  }, [cursor, weekStartsOn])

  const eventDays = useMemo(() => {
    const set = new Set<string>()
    for (const occ of events) {
      // All-day occurrences carry UTC midnights (date-based); timed ones are
      // UTC instants and must be converted to the user's local date.
      const dayKey = occ.allDay ? occ.start.slice(0, 10) : format(new Date(occ.start), 'yyyy-MM-dd')
      const endKey = occ.allDay ? occ.end.slice(0, 10) : format(new Date(occ.end), 'yyyy-MM-dd')
      let d = new Date(dayKey + 'T00:00:00')
      const end = new Date(endKey + 'T00:00:00')
      while (d <= end) {
        set.add(format(d, 'yyyy-MM-dd'))
        d = addDays(d, 1)
      }
    }
    return set
  }, [events])

  return (
    <div className="p-2 select-none">
      <div className="flex items-center justify-between px-1 mb-1">
        <button
          onClick={() => setCursor(subMonths(cursor, 1))}
          className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500"
          aria-label="Previous month"
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor"><path d="M15.4 7.4 14 6l-6 6 6 6 1.4-1.4L10.8 12z" /></svg>
        </button>
        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
          {format(cursor, 'MMMM yyyy')}
        </span>
        <button
          onClick={() => setCursor(addMonths(cursor, 1))}
          className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500"
          aria-label="Next month"
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor"><path d="M8.6 16.6 10 18l6-6-6-6-1.4 1.4 4.6 4.6z" /></svg>
        </button>
      </div>
      <div className="grid grid-cols-7 text-center text-[10px] text-gray-400 mb-1">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].slice(weekStartsOn).concat(['S', 'M', 'T', 'W', 'T', 'F', 'S'].slice(0, weekStartsOn)).map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {days.map((d, i) => {
          const selected = isSameDay(d, date)
          const today = isToday(d)
          const hasEvents = eventDays.has(format(d, 'yyyy-MM-dd'))
          const inMonth = d.getMonth() === cursor.getMonth()
          return (
            <button
              key={i}
              onClick={() => setDate(d)}
              className={`relative h-7 w-7 mx-auto rounded-full text-xs flex items-center justify-center transition-colors
                ${selected ? 'bg-accent text-white' : today ? 'bg-accent/15 text-accent dark:bg-accent/25 dark:text-accent' : inMonth ? 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700' : 'text-gray-400 dark:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
            >
              {d.getDate()}
              {hasEvents && !selected && (
                <span className={`absolute bottom-0.5 h-1 w-1 rounded-full ${today ? 'bg-accent' : 'bg-gray-400 dark:bg-gray-500'}`} />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
