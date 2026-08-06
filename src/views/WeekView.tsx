import { useMemo, useState, useEffect } from 'react'
import { format, isSameDay, isToday } from 'date-fns'
import { useCalendar, useAuth } from '../store'
import { rangeStart, rangeEnd, toISO, iterateDays } from '../utils/date'
import type { Event, EventOccurrence } from '@shared/types'
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

const PX_PER_MIN = 0.5

export default function WeekView({ date, days }: WeekViewProps): React.JSX.Element {
  const { events, calendars, refreshEvents, settings } = useCalendar()
  const { token } = useAuth()
  const [dialog, setDialog] = useState<{ event?: Event; date?: Date; occurrence?: string } | null>(null)
  const [now, setNow] = useState(new Date())

  const from = useMemo(() => rangeStart(days === 7 ? 'week' : 'day', date, settings.firstDayOfWeek), [date, days, settings.firstDayOfWeek])
  const to = useMemo(() => rangeEnd(days === 7 ? 'week' : 'day', date, settings.firstDayOfWeek), [date, days, settings.firstDayOfWeek])

  useEffect(() => {
    void refreshEvents(toISO(from), toISO(to))
  }, [from, to, refreshEvents, token])

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(t)
  }, [])

  const dayColumns = useMemo(() => [...iterateDays(from, to)], [from, to])

  const { byDay, allDayEvents } = useMemo(() => {
    const byDay = new Map<string, EventOccurrence[]>()
    const allDay: EventOccurrence[] = []
    for (const occ of Object.values(events).flat()) {
      if (occ.allDay) {
        allDay.push(occ)
        continue
      }
      const dayKey = format(new Date(occ.start), 'yyyy-MM-dd')
      if (byDay.has(dayKey)) byDay.get(dayKey)!.push(occ)
    }
    return { byDay, allDayEvents: allDay }
  }, [events])

  const calendarById = useMemo(() => new Map(calendars.map((c) => [c.id, c])), [calendars])

  const positioned = useMemo(() => {
    const result = new Map<string, Positioned[]>()
    for (const [dayKey, evs] of byDay) {
      const timed = evs.filter((o) => o.start && o.end)
      const clusters: EventOccurrence[][] = []
      for (const occ of timed) {
        const s = new Date(occ.start).getTime()
        const e = new Date(occ.end).getTime()
        let placed = false
        for (const cluster of clusters) {
          const overlaps = cluster.some((other) => {
            const os = new Date(other.start).getTime()
            const oe = new Date(other.end).getTime()
            return s < oe && e > os
          })
          if (!overlaps) {
            cluster.push(occ)
            placed = true
            break
          }
        }
        if (!placed) clusters.push([occ])
      }
      const positioned: Positioned[] = []
      for (const cluster of clusters) {
        const n = cluster.length
        cluster.forEach((occ, i) => {
          positioned.push({
            event: occ.event,
            startMin: new Date(occ.start).getHours() * 60 + new Date(occ.start).getMinutes(),
            endMin: new Date(occ.end).getHours() * 60 + new Date(occ.end).getMinutes(),
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

  const moveEvent = async (event: Event, newStart: Date): Promise<void> => {
    if (!token) return
    const occ = Object.values(events).flat().find((o) => o.event.id === event.id)
    const dur = occ ? new Date(occ.end).getTime() - new Date(occ.start).getTime() : 3600000
    const newEnd = new Date(newStart.getTime() + dur)
    const push = useCalendar.getState().pushHistory
    if (event.rrule) {
      const dayKey = format(newStart, 'yyyy-MM-dd')
      await window.calendarApi.events.updateOccurrence(token, event.id, dayKey, {
        startsAt: newStart.toISOString(),
        endsAt: newEnd.toISOString()
      })
      push({ op: 'occurrence', eventId: event.id, occurrence: dayKey, before: { startsAt: occ?.start, endsAt: occ?.end }, after: { startsAt: newStart.toISOString(), endsAt: newEnd.toISOString() } })
    } else {
      await window.calendarApi.events.update(token, event.id, { startsAt: newStart.toISOString(), endsAt: newEnd.toISOString() })
      push({ op: 'update', eventId: event.id, before: { startsAt: occ?.start, endsAt: occ?.end }, after: { startsAt: newStart.toISOString(), endsAt: newEnd.toISOString() } })
    }
    void refreshEvents(toISO(from), toISO(to))
  }

  const resizeEvent = async (event: Event, newEnd: Date): Promise<void> => {
    if (!token) return
    const occ = Object.values(events).flat().find((o) => o.event.id === event.id)
    const push = useCalendar.getState().pushHistory
    if (event.rrule && occ) {
      const dayKey = format(new Date(occ.start), 'yyyy-MM-dd')
      await window.calendarApi.events.updateOccurrence(token, event.id, dayKey, { endsAt: newEnd.toISOString() })
      push({ op: 'occurrence', eventId: event.id, occurrence: dayKey, before: { endsAt: occ.end }, after: { endsAt: newEnd.toISOString() } })
    } else {
      await window.calendarApi.events.update(token, event.id, { endsAt: newEnd.toISOString() })
      push({ op: 'update', eventId: event.id, before: { endsAt: occ?.end }, after: { endsAt: newEnd.toISOString() } })
    }
    void refreshEvents(toISO(from), toISO(to))
  }

  const editableFor = (ev: Event): boolean => calendars.find((c) => c.id === ev.calendarId)?.role !== 'viewer'

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
                    .filter((occ) => occDaySpan(occ, d))
                    .map((occ) => {
                      const ev = occ.event
                      const cal = calendarById.get(ev.calendarId)
                      const color = ev.color ?? cal?.color ?? '#1a73e8'
                      const continues = new Date(occ.end) > new Date(d.getTime() + 86400000 - 1)
                      return (
                        <button
                          key={ev.id + d.toISOString()}
                          onClick={() => setDialog({ event: ev, occurrence: format(new Date(occ.start), 'yyyy-MM-dd') })}
                          draggable={editableFor(ev)}
                          onDragStart={(e) => {
                            e.dataTransfer.setData('application/x-cal-event', JSON.stringify({ id: ev.id, allDay: true }))
                            e.dataTransfer.effectAllowed = 'move'
                          }}
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
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="absolute right-2 -translate-y-1/2 text-[10px] text-gray-400" style={{ top: h * 60 * PX_PER_MIN }}>
              {String(h).padStart(2, '0')}:00
            </div>
          ))}
        </div>

        <div className="flex-1 relative" style={{ display: 'grid', gridTemplateColumns: `repeat(${dayColumns.length}, 1fr)` }}>
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="absolute left-0 right-0 border-t border-gray-200 dark:border-gray-700" style={{ top: h * 60 * PX_PER_MIN }} />
          ))}
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h + 'q'} className="absolute left-0 right-0 border-t border-dashed border-gray-100 dark:border-gray-800" style={{ top: h * 60 * PX_PER_MIN + PX_PER_MIN * 30 }} />
          ))}

          {dayColumns.map((d, i) => {
            const key = format(d, 'yyyy-MM-dd')
            const weekend = d.getDay() === 0 || d.getDay() === 6
            return (
              <div
                key={i}
                onClick={(e) => {
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                  const mins = Math.max(0, Math.min(1439, Math.round(((e.clientY - rect.top) / PX_PER_MIN) / 15) * 15))
                  const start = new Date(d)
                  start.setHours(Math.floor(mins / 60), mins % 60, 0, 0)
                  setDialog({ date: start })
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  const raw = e.dataTransfer.getData('application/x-cal-event')
                  if (!raw) return
                  const { id, allDay } = JSON.parse(raw) as { id: string; allDay?: boolean }
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                  const mins = Math.max(0, Math.min(1439, Math.round(((e.clientY - rect.top) / PX_PER_MIN) / 15) * 15))
                  const start = new Date(d)
                  start.setHours(Math.floor(mins / 60), mins % 60, 0, 0)
                  const occ = Object.values(events).flat().find((x) => x.event.id === id)
                  if (!occ) return
                  const ev = occ.event
                  const dayKey = format(d, 'yyyy-MM-dd')
                  if (allDay) {
                    void (async () => {
                      const push = useCalendar.getState().pushHistory
                      if (ev.rrule) {
                        const sourceDay = format(new Date(occ.start), 'yyyy-MM-dd')
                        await window.calendarApi.events.updateOccurrence(token!, id, sourceDay, { startDate: dayKey, endDate: dayKey, allDay: true })
                        push({ op: 'occurrence', eventId: id, occurrence: sourceDay, before: { allDay: false, startsAt: occ.start, endsAt: occ.end }, after: { allDay: true, startDate: dayKey, endDate: dayKey } })
                      } else {
                        const dur = new Date(occ.end).getTime() - new Date(occ.start).getTime()
                        await window.calendarApi.events.update(token!, id, {
                          startDate: dayKey,
                          endDate: dur > 86400000 ? format(new Date(new Date(dayKey + 'T00:00:00').getTime() + dur), 'yyyy-MM-dd') : dayKey
                        })
                        push({ op: 'update', eventId: id, before: { startsAt: occ.start, endsAt: occ.end }, after: { startDate: dayKey, endDate: dayKey, allDay: true } })
                      }
                      void refreshEvents(toISO(from), toISO(to))
                    })()
                  } else if (ev.rrule) {
                    const sourceDay = format(new Date(occ.start), 'yyyy-MM-dd')
                    const dur = new Date(occ.end).getTime() - new Date(occ.start).getTime()
                    void window.calendarApi.events.updateOccurrence(token!, id, sourceDay, {
                      startsAt: start.toISOString(),
                      endsAt: new Date(start.getTime() + dur).toISOString()
                    }).then(() => {
                      useCalendar.getState().pushHistory({ op: 'occurrence', eventId: id, occurrence: sourceDay, before: { startsAt: occ.start, endsAt: occ.end }, after: { startsAt: start.toISOString(), endsAt: new Date(start.getTime() + dur).toISOString() } })
                      void refreshEvents(toISO(from), toISO(to))
                    })
                  } else {
                    void moveEvent(ev, start)
                  }
                }}
                className={`relative border-l border-gray-200 dark:border-gray-700 ${weekend ? 'bg-gray-50 dark:bg-gray-800/60' : ''} cursor-pointer`}
                data-daycol={key}
              >
                {positioned.get(key)?.map((p) => {
                  const cal = calendarById.get(p.event.calendarId)
                  const color = p.event.color ?? cal?.color ?? '#1a73e8'
                  const editable = editableFor(p.event)
                  return (
                    <div
                      key={p.event.id}
                      onClick={(e) => {
                        e.stopPropagation()
                        const occDate = key
                        setDialog({ event: p.event, occurrence: occDate })
                      }}
                      draggable={editable}
                      onDragStart={(e) => {
                        e.dataTransfer.setData('application/x-cal-event', JSON.stringify({ id: p.event.id, allDay: false }))
                        e.dataTransfer.effectAllowed = 'move'
                      }}
                      onDragEnd={() => void refreshEvents(toISO(from), toISO(to))}
                      className="absolute rounded-md overflow-hidden text-[11px] cursor-pointer hover:shadow-md transition-shadow group"
                      style={{
                        top: p.startMin * PX_PER_MIN + 2,
                        height: Math.max((p.endMin - p.startMin) * PX_PER_MIN - 3, 18),
                        left: `calc(${(p.col / p.cols) * 100}% + 2px)`,
                        width: `calc(${100 / p.cols}% - 4px)`,
                        backgroundColor: color + 'e6',
                        color: '#fff',
                        zIndex: 10
                      }}
                      title={`${format(new Date(p.event.startsAt!), 'HH:mm')} – ${format(new Date(p.event.endsAt!), 'HH:mm')} ${p.event.title}`}
                    >
                      <div className="px-1.5 py-0.5 truncate font-medium pointer-events-none">{p.event.title}</div>
                      <div className="px-1.5 truncate opacity-90 pointer-events-none">
                        {format(new Date(p.event.startsAt!), 'HH:mm')} – {format(new Date(p.event.endsAt!), 'HH:mm')}
                      </div>
                      {editable && (p.endMin - p.startMin) * PX_PER_MIN > 28 && (
                        <div
                          className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize opacity-0 group-hover:opacity-100 bg-black/20"
                          onMouseDown={(e) => {
                            e.stopPropagation()
                            const colEl = e.currentTarget.closest('[data-daycol]') as HTMLElement
                            if (!colEl) return
                            const startY = e.clientY
                            const origEnd = new Date(p.event.endsAt!).getTime()
                            const onMove = (ev: MouseEvent): void => {
                              const dy = ev.clientY - startY
                              const newEnd = new Date(origEnd + dy / PX_PER_MIN * 60000)
                              newEnd.setMinutes(Math.round(newEnd.getMinutes() / 15) * 15)
                              if (newEnd <= new Date(p.event.startsAt!)) return
                              void resizeEvent(p.event, newEnd)
                            }
                            const onUp = (): void => {
                              window.removeEventListener('mousemove', onMove)
                              window.removeEventListener('mouseup', onUp)
                            }
                            window.addEventListener('mousemove', onMove)
                            window.addEventListener('mouseup', onUp)
                          }}
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}

          {dayColumns.some((d) => isSameDay(d, now)) && (
            <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top: nowLine * PX_PER_MIN }}>
              <div className="h-0.5 bg-red-500 relative">
                <span className="absolute -left-1 -top-[3px] h-2 w-2 rounded-full bg-red-500" />
              </div>
            </div>
          )}
        </div>
      </div>

      {dialog && <EventDialog event={dialog.event} defaultDate={dialog.date} occurrence={dialog.occurrence} onClose={() => setDialog(null)} />}
    </div>
  )
}

function occDaySpan(occ: EventOccurrence, day: Date): boolean {
  const dayKey = format(day, 'yyyy-MM-dd')
  const start = format(new Date(occ.start), 'yyyy-MM-dd')
  return start <= dayKey && format(new Date(occ.end), 'yyyy-MM-dd') >= dayKey
}
