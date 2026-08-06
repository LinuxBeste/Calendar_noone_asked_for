import { useMemo, useState, useEffect } from 'react'
import { format, isSameDay, isToday, addDays, parseISO } from 'date-fns'
import { useCalendar, useAuth } from '../store'
import { rangeStart, rangeEnd, toISO, iterateDays } from '../utils/date'
import type { Event } from '@shared/types'
import EventDialog from '../components/EventDialog'

interface WeekViewProps {
  date: Date
  days: number
}

interface Positioned {
  event: Event
  startMin: number
  endMin: number
  col: number
  cols: number
}

interface TimeSlot {
  start: string
  end: string
}

const DAY_START = 0
const DAY_END = 1440
const PX_PER_MIN = 0.5

export default function WeekView({ date, days }: WeekViewProps): React.JSX.Element {
  const { events, calendars, refreshEvents, settings } = useCalendar()
  const { token } = useAuth()
  const [dialog, setDialog] = useState<{ event?: Event; date?: Date } | null>(null)
  const [now, setNow] = useState(new Date())

  const from = useMemo(() => rangeStart(days === 7 ? 'week' : 'day', date, settings.firstDayOfWeek), [date, days, settings.firstDayOfWeek])
  const to = useMemo(() => {
    const e = rangeEnd(days === 7 ? 'week' : 'day', date, settings.firstDayOfWeek)
    if (days > 1) return e
    return e
  }, [date, days, settings.firstDayOfWeek])

  useEffect(() => {
    void refreshEvents(toISO(from), toISO(to))
  }, [from, to, refreshEvents, token])

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(t)
  }, [])

  const dayColumns = useMemo(() => [...iterateDays(from, to)], [from, to])

  const { byDay, allDayEvents } = useMemo(() => {
    const byDay = new Map<string, Event[]>()
    const allDay: Event[] = []
    for (const ev of Object.values(events).flat()) {
      if (ev.allDay) {
        allDay.push(ev)
        continue
      }
      const dayKey = ev.startsAt ? format(new Date(ev.startsAt), 'yyyy-MM-dd') : null
      if (dayKey && byDay.has(dayKey)) byDay.get(dayKey)!.push(ev)
    }
    return { byDay, allDayEvents: allDay }
  }, [events])

  const calendarById = useMemo(() => new Map(calendars.map((c) => [c.id, c])), [calendars])
  const slots: TimeSlot[] = useMemo(() => {
    const out: TimeSlot[] = []
    for (let m = DAY_START; m < DAY_END; m += 60) {
      out.push({ start: `${String(Math.floor(m / 60)).padStart(2, '0')}:00`, end: '60m' })
    }
    return out
  }, [])

  const positioned = useMemo(() => {
    const result = new Map<string, Positioned[]>()
    for (const [dayKey, evs] of byDay) {
      const timed = evs.filter((e) => e.startsAt && e.endsAt)
      const clusters: Event[][] = []
      for (const ev of timed) {
        const s = new Date(ev.startsAt!).getTime()
        const e = new Date(ev.endsAt!).getTime()
        let placed = false
        for (const cluster of clusters) {
          const overlaps = cluster.some((other) => {
            const os = new Date(other.startsAt!).getTime()
            const oe = new Date(other.endsAt!).getTime()
            return s < oe && e > os
          })
          if (!overlaps) {
            cluster.push(ev)
            placed = true
            break
          }
        }
        if (!placed) clusters.push([ev])
      }
      const positioned: Positioned[] = []
      for (const cluster of clusters) {
        const n = cluster.length
        cluster.forEach((ev, i) => {
          positioned.push({
            event: ev,
            startMin: new Date(ev.startsAt!).getHours() * 60 + new Date(ev.startsAt!).getMinutes(),
            endMin: new Date(ev.endsAt!).getHours() * 60 + new Date(ev.endsAt!).getMinutes(),
            col: i,
            cols: n
          })
        })
      }
      result.set(dayKey, positioned.sort((a, b) => a.startMin - b.startMin))
    }
    return result
  }, [byDay])

  const nowLine = now.getHours() * 60 + now.getMinutes()
  const todayKey = format(now, 'yyyy-MM-dd')

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex shrink-0 border-b border-gray-200 dark:border-gray-700">
        <div className="w-12 shrink-0" />
        <div className="flex-1 grid" style={{ gridTemplateColumns: `repeat(${dayColumns.length}, 1fr)` }}>
          {dayColumns.map((d, i) => {
            const key = format(d, 'yyyy-MM-dd')
            const weekend = d.getDay() === 0 || d.getDay() === 6
            return (
              <div
                key={i}
                className={`border-l border-gray-200 dark:border-gray-700 py-1 text-center ${weekend ? 'bg-gray-50 dark:bg-gray-800/60' : ''}`}
              >
                <div className={`text-sm ${isToday(d) ? 'text-blue-600 font-medium' : 'text-gray-500 dark:text-gray-400'}`}>
                  {format(d, 'EEE')}
                </div>
                <div
                  className={`mx-auto h-7 w-7 flex items-center justify-center rounded-full text-sm ${
                    isToday(d) ? 'bg-blue-600 text-white font-medium' : 'text-gray-700 dark:text-gray-200'
                  }`}
                >
                  {d.getDate()}
                </div>
                <div className="mt-0.5 space-y-0.5">
                  {allDayEvents
                    .filter((ev) => daySpan(ev, d))
                    .map((ev) => {
                      const cal = calendarById.get(ev.calendarId)
                      const color = ev.color ?? cal?.color ?? '#1a73e8'
                      const continues = ev.endDate ? new Date(ev.endDate + 'T00:00:00') > d : false
                      return (
                        <button
                          key={ev.id}
                          onClick={() => setDialog({ event: ev })}
                          className={`w-full text-left text-[11px] px-1 py-0.5 truncate rounded hover:shadow ${continues ? '' : 'rounded-r-full'}`}
                          style={{ backgroundColor: color + '22', color }}
                          title={ev.title}
                        >
                          {ev.title}
                        </button>
                      )
                    })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex-1 flex overflow-y-auto relative">
        <div className="w-12 shrink-0 relative">
          {slots.map((s) => (
            <div key={s.start} className="absolute right-2 -translate-y-1/2 text-[10px] text-gray-400" style={{ top: hourToPx(s.start) }}>
              {s.start}
            </div>
          ))}
        </div>

        <div className="flex-1 grid relative" style={{ gridTemplateColumns: `repeat(${dayColumns.length}, 1fr)` }}>
          {slots.map((s) => (
            <div key={s.start} className="col-span-full border-t border-gray-200 dark:border-gray-700" style={{ position: 'absolute', top: hourToPx(s.start), left: 0, right: 0 }} />
          ))}
          {slots.slice(0, -1).map((s) => (
            <div key={s.start + 'q'} className="col-span-full border-t border-dashed border-gray-100 dark:border-gray-800" style={{ position: 'absolute', top: hourToPx(s.start) + PX_PER_MIN * 30, left: 0, right: 0 }} />
          ))}

          {dayColumns.map((d, i) => {
            const key = format(d, 'yyyy-MM-dd')
            const weekend = d.getDay() === 0 || d.getDay() === 6
            return (
              <div
                key={i}
                onClick={(e) => {
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                  const y = e.clientY - rect.top
                  const mins = Math.round((y / PX_PER_MIN) / 15) * 15
                  const hh = Math.floor(mins / 60)
                  const mm = mins % 60
                  const start = new Date(d)
                  start.setHours(hh, mm, 0, 0)
                  setDialog({ date: start })
                }}
                className={`relative border-l border-gray-200 dark:border-gray-700 ${weekend ? 'bg-gray-50 dark:bg-gray-800/60' : ''} cursor-pointer`}
              >
                {positioned.get(key)?.map((p) => {
                  const cal = calendarById.get(p.event.calendarId)
                  const color = p.event.color ?? cal?.color ?? '#1a73e8'
                  return (
                    <div
                      key={p.event.id}
                      onClick={(e) => {
                        e.stopPropagation()
                        setDialog({ event: p.event })
                      }}
                      className="absolute rounded-md overflow-hidden text-[11px] cursor-pointer hover:shadow-md transition-shadow"
                      style={{
                        top: p.startMin * PX_PER_MIN + 2,
                        height: Math.max((p.endMin - p.startMin) * PX_PER_MIN - 3, 16),
                        left: `calc(${(p.col / p.cols) * 100}% + 2px)`,
                        width: `calc(${100 / p.cols}% - 4px)`,
                        backgroundColor: color + 'e6',
                        color: '#fff',
                        zIndex: 10
                      }}
                      title={`${format(new Date(p.event.startsAt!), 'H:mm')} – ${format(new Date(p.event.endsAt!), 'H:mm')} ${p.event.title}`}
                    >
                      <div className="px-1.5 py-0.5 truncate font-medium">{p.event.title}</div>
                      <div className="px-1.5 truncate opacity-90">
                        {format(new Date(p.event.startsAt!), 'H:mm')} – {format(new Date(p.event.endsAt!), 'H:mm')}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}

          {dayColumns.some((d) => isSameDay(d, now)) && (
            <div
              className="absolute left-0 right-0 z-20 pointer-events-none"
              style={{ top: nowLine * PX_PER_MIN }}
            >
              <div className="h-0.5 bg-red-500 relative">
                <span className="absolute -left-1 -top-[3px] h-2 w-2 rounded-full bg-red-500" />
              </div>
            </div>
          )}
        </div>
      </div>

      {dialog && <EventDialog event={dialog.event} defaultDate={dialog.date} onClose={() => setDialog(null)} />}
    </div>
  )
}

function hourToPx(hour: string): number {
  const [h] = hour.split(':').map(Number)
  return (h ?? 0) * 60 * PX_PER_MIN
}

function daySpan(ev: Event, day: Date): boolean {
  const dayKey = format(day, 'yyyy-MM-dd')
  const start = ev.startDate ?? (ev.startsAt ? format(new Date(ev.startsAt), 'yyyy-MM-dd') : null)
  if (!start) return false
  return start <= dayKey && (ev.endDate ?? start) >= dayKey
}
