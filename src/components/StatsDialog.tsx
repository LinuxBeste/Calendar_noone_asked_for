import { useEffect, useMemo, useState } from 'react'
import { format, startOfDay } from 'date-fns'
import { useCalendar } from '../store'
import type { EventOccurrence } from '@shared/types'

export default function StatsDialog({ onClose }: { onClose: () => void }): React.JSX.Element {
  const { events, calendars, settings } = useCalendar()
  const [range, setRange] = useState<'week' | 'month' | 'all'>('month')

  const stats = useMemo(() => {
    const now = new Date()
    const rangeStart = range === 'week' ? startOfDay(now) : new Date(now.getFullYear(), now.getMonth(), 1)
    const inRange = range === 'all' ? events : events.filter((o) => new Date(o.end) >= rangeStart && new Date(o.start) <= now)
    const upcoming = events.filter((o) => new Date(o.start) >= now).sort((a, b) => a.start.localeCompare(b.start)).slice(0, 3)

    let timedMinutes = 0
    let timedCount = 0
    let allDayCount = 0
    const perCalendar = new Map<string, number>()
    const perDay = new Map<string, number>()
    for (const o of inRange) {
      perCalendar.set(o.event.calendarId, (perCalendar.get(o.event.calendarId) ?? 0) + 1)
      const dayKey = o.start.slice(0, 10)
      perDay.set(dayKey, (perDay.get(dayKey) ?? 0) + 1)
      if (o.allDay) allDayCount++
      else {
        timedCount++
        timedMinutes += Math.max(0, new Date(o.end).getTime() - new Date(o.start).getTime()) / 60000
      }
    }
    const busiestDay = [...perDay.entries()].sort((a, b) => b[1] - a[1])[0]
    const calendarRows = [...perCalendar.entries()]
      .map(([id, count]) => ({ cal: calendars.find((c) => c.id === id), count }))
      .sort((a, b) => b.count - a.count)
    const avgMin = timedCount > 0 ? Math.round(timedMinutes / timedCount) : 0
    return {
      count: inRange.length,
      timedMinutes: Math.round(timedMinutes),
      timedCount,
      allDayCount,
      avgMin,
      busiestDay,
      calendarRows,
      upcoming,
      rangeLabel: range === 'week' ? 'This week' : range === 'month' ? 'This month' : 'All loaded events'
    }
  }, [events, calendars, range])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const maxCount = Math.max(1, ...stats.calendarRows.map((r) => r.count))
  const maxDay = stats.busiestDay ? Math.max(1, stats.busiestDay[1]) : 1
  const hours = `${Math.floor(stats.timedMinutes / 60)}h ${String(stats.timedMinutes % 60).padStart(2, '0')}m`

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-base font-medium text-gray-900 dark:text-gray-100">Calendar stats</h2>
          <div className="flex items-center gap-2">
            <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
              {(['week', 'month', 'all'] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={`px-2 py-0.5 text-xs rounded-md ${range === r ? 'bg-white dark:bg-gray-800 shadow text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'}`}
                >
                  {r === 'week' ? 'Week' : r === 'month' ? 'Month' : 'All'}
                </button>
              ))}
            </div>
            <button onClick={onClose} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400" aria-label="Close">
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor"><path d="M19 6.4 17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12z" /></svg>
            </button>
          </div>
        </div>
        <div className="overflow-y-auto px-5 py-4 space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              ['Events', String(stats.count)],
              ['Time booked', stats.timedCount ? hours : '—'],
              ['Avg duration', stats.timedCount ? `${stats.avgMin} min` : '—'],
              ['All-day', String(stats.allDayCount)]
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-gray-200 dark:border-gray-700 p-3">
                <p className="text-[11px] text-gray-500 dark:text-gray-400">{label}</p>
                <p className="text-lg font-medium text-gray-900 dark:text-gray-100 mt-0.5">{value}</p>
              </div>
            ))}
          </div>

          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{stats.rangeLabel} — by calendar</p>
            {stats.calendarRows.length === 0 && <p className="text-sm text-gray-400">No events yet</p>}
            <div className="space-y-1.5">
              {stats.calendarRows.map(({ cal, count }) => (
                <div key={cal?.id ?? '?'} className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: cal?.color ?? '#1a73e8' }} />
                  <span className="text-xs text-gray-700 dark:text-gray-200 w-32 truncate">{cal?.name ?? 'Unknown'}</span>
                  <div className="flex-1 h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div className="h-full bg-accent rounded-full" style={{ width: `${(count / maxCount) * 100}%` }} />
                  </div>
                  <span className="text-xs text-gray-500 w-8 text-right">{count}</span>
                </div>
              ))}
            </div>
          </div>

          {stats.busiestDay && (
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Busiest day</p>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-800 dark:text-gray-100 w-32">{format(new Date(stats.busiestDay[0]), 'EEEE, MMM d')}</span>
                <div className="flex-1 h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div className="h-full bg-red-400 rounded-full" style={{ width: `${(stats.busiestDay[1] / maxDay) * 100}%` }} />
                </div>
                <span className="text-xs text-gray-500 w-8 text-right">{stats.busiestDay[1]}</span>
              </div>
            </div>
          )}

          {stats.upcoming.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Next up</p>
              <div className="space-y-1">
                {stats.upcoming.map((o: EventOccurrence) => (
                  <div key={o.event.id + o.start} className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-100">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">{format(new Date(o.start), 'EEE d, HH:mm')}</span>
                    <span className="truncate">{o.event.icon ? `${o.event.icon} ` : ''}{o.event.title}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
