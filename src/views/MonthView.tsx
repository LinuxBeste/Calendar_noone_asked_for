import { useMemo, useState, useEffect } from 'react'
import { format, isSameDay, isToday, isSameMonth } from 'date-fns'
import { useCalendar, useAuth } from '../store'
import { rangeStart, rangeEnd, toISO, iterateDays } from '../utils/date'
import type { Event, EventOccurrence } from '@shared/types'
import EventDialog from '../components/EventDialog'
import ContextMenu from '../components/ContextMenu'
import { toast } from '../toasts'

interface MonthViewProps {
  date: Date
}

interface MoreMenu {
  x: number
  y: number
  dayKey: string
  date: Date
}

export default function MonthView({ date }: MonthViewProps): React.JSX.Element {
  const { events, calendars, refreshEvents, settings } = useCalendar()
  const { token } = useAuth()
  const [dialog, setDialog] = useState<{ event?: Event; date?: Date; occurrence?: string } | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; event: Event; occurrence: string } | null>(null)
  const [moreMenu, setMoreMenu] = useState<MoreMenu | null>(null)

  useEffect(() => {
    const from = rangeStart('month', date, settings.firstDayOfWeek)
    const to = rangeEnd('month', date, settings.firstDayOfWeek)
    void refreshEvents(toISO(from), toISO(to))
  }, [date, settings.firstDayOfWeek, refreshEvents, token])

  const { days, byDay } = useMemo(() => {
    const from = rangeStart('month', date, settings.firstDayOfWeek)
    const to = rangeEnd('month', date, settings.firstDayOfWeek)
    const days = [...iterateDays(from, to)]
    const byDay = new Map<string, EventOccurrence[]>()
    for (const occ of Object.values(events).flat()) {
      const first = occ.allDay ? occ.start.slice(0, 10) : format(new Date(occ.start), 'yyyy-MM-dd')
      const last = occ.allDay ? occ.end.slice(0, 10) : first
      if (!first) continue
      let d = new Date(first + 'T00:00:00')
      const end = new Date(last + 'T00:00:00')
      while (d <= end) {
        const key = format(d, 'yyyy-MM-dd')
        byDay.set(key, [...(byDay.get(key) ?? []), occ])
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
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                e.stopPropagation()
                const raw = e.dataTransfer.getData('application/x-cal-event')
                if (!raw || !token) return
                const { id, allDay } = JSON.parse(raw) as { id: string; allDay?: boolean }
                const occ = Object.values(events).flat().find((x) => x.event.id === id)
                if (!occ) return
                const ev = occ.event
                const dayKey = format(d, 'yyyy-MM-dd')
                if (allDay || ev.allDay) {
                  const dur = occ.end && occ.start
                    ? new Date(occ.end).getTime() - new Date(occ.start).getTime()
                    : 0
                  const after = { startDate: dayKey, endDate: dur > 0 ? format(new Date(new Date(dayKey + 'T00:00:00').getTime() + dur), 'yyyy-MM-dd') : dayKey }
                  const sourceDay = format(new Date(occ.start), 'yyyy-MM-dd')
                  const finish = (): void => {
                    useCalendar.getState().pushHistory({ op: 'update', eventId: id, before: { startDate: occ.event.startDate, endDate: occ.event.endDate }, after })
                    void refreshEvents(toISO(rangeStart('month', date, settings.firstDayOfWeek)), toISO(rangeEnd('month', date, settings.firstDayOfWeek)))
                  }
                  if (ev.rrule) {
                    void window.calendarApi.events.updateOccurrence(token, id, sourceDay, after).then(finish)
                  } else {
                    void window.calendarApi.events.update(token, id, after).then(finish)
                  }
                } else {
                  const dur = new Date(occ.end).getTime() - new Date(occ.start).getTime()
                  const start = new Date(dayKey + 'T' + format(new Date(occ.start), 'HH:mm:ss'))
                  const after = { startsAt: start.toISOString(), endsAt: new Date(start.getTime() + dur).toISOString() }
                  const finish = (): void => {
                    useCalendar.getState().pushHistory({ op: 'update', eventId: id, before: { startsAt: occ.start, endsAt: occ.end }, after })
                    void refreshEvents(toISO(rangeStart('month', date, settings.firstDayOfWeek)), toISO(rangeEnd('month', date, settings.firstDayOfWeek)))
                  }
                  if (ev.rrule) {
                    const sourceDay = format(new Date(occ.start), 'yyyy-MM-dd')
                    void window.calendarApi.events.updateOccurrence(token, id, sourceDay, after).then(finish)
                  } else {
                    void window.calendarApi.events.update(token, id, after).then(finish)
                  }
                }
              }}
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
                {visible.map((occ) => {
                  const ev = occ.event
                  const cal = calendarById.get(ev.calendarId)
                  const color = ev.color ?? cal?.color ?? '#1a73e8'
                  const continues = new Date(occ.end) > new Date(d.getTime() + 86400000 - 1)
                  return (
                    <button
                      key={ev.id + key}
                      onClick={(e) => {
                        e.stopPropagation()
                        setDialog({ event: ev, occurrence: format(new Date(occ.start), 'yyyy-MM-dd') })
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setMenu({ x: e.clientX, y: e.clientY, event: ev, occurrence: format(new Date(occ.start), 'yyyy-MM-dd') })
                      }}
                      draggable={calendars.find((c) => c.id === ev.calendarId)?.role !== 'viewer'}
                      onDragStart={(e) => {
                        e.dataTransfer.setData('application/x-cal-event', JSON.stringify({ id: ev.id, allDay: occ.allDay }))
                        e.dataTransfer.effectAllowed = 'move'
                      }}
                      className={`w-full text-left text-[11px] px-1 py-0.5 rounded truncate hover:shadow ${continues ? '' : 'rounded-r-full'}`}
                      style={{ backgroundColor: color + '22', color }}
                      title={`${ev.title}${ev.location ? '\n' + ev.location : ''}`}
                    >
                      {occ.allDay ? '' : format(new Date(occ.start), 'H:mm') + ' '}
                      {ev.title}
                    </button>
                  )
                })}
                {extra > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                      const w = 240
                      setMoreMenu({
                        x: Math.min(rect.left, window.innerWidth - w - 8),
                        y: rect.bottom + 4,
                        dayKey: key,
                        date: d
                      })
                    }}
                    className="text-[11px] text-gray-500 dark:text-gray-400 pl-1 hover:text-blue-600"
                  >
                    +{extra} more
                  </button>
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
          occurrence={dialog.occurrence}
          onClose={() => setDialog(null)}
        />
      )}
      {moreMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMoreMenu(null)} />
          <div
            className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl p-1.5 max-h-72 overflow-y-auto"
            style={{ left: moreMenu.x, top: moreMenu.y, width: 240 }}
          >
            <p className="px-2 py-1 text-xs font-medium text-gray-500 dark:text-gray-400">{format(moreMenu.date, 'EEEE, MMMM d')}</p>
            {(byDay.get(moreMenu.dayKey) ?? []).map((occ) => {
              const ev = occ.event
              const cal = calendarById.get(ev.calendarId)
              const color = ev.color ?? cal?.color ?? '#1a73e8'
              return (
                <button
                  key={ev.id + moreMenu.dayKey}
                  onClick={() => {
                    setMoreMenu(null)
                    setDialog({ event: ev, occurrence: format(new Date(occ.start), 'yyyy-MM-dd') })
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
                >
                  <span className="w-1.5 h-6 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">
                    {occ.allDay ? 'All day' : format(new Date(occ.start), settings.timeFormat === '12h' ? 'h:mm a' : 'HH:mm')}
                  </span>
                  <span className="flex-1 text-sm text-gray-800 dark:text-gray-100 truncate">{ev.title}</span>
                </button>
              )
            })}
            <button
              onClick={() => {
                setMoreMenu(null)
                setDialog({ date: moreMenu.date })
              }}
              className="w-full mt-1 px-2 py-1.5 rounded-lg text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 text-left"
            >
              + Add event
            </button>
          </div>
        </>
      )}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            { label: 'Edit', onClick: () => setDialog({ event: menu.event, occurrence: menu.occurrence }) },
            {
              label: 'Delete',
              danger: true,
              onClick: () => {
                if (menu.event.rrule) {
                  void window.calendarApi.events.deleteOccurrence(token!, menu.event.id, menu.occurrence)
                } else {
                  void window.calendarApi.events.delete(token!, menu.event.id)
                }
                toast('Event deleted')
                void useCalendar.getState().refreshEvents('0000-01-01T00:00:00.000Z', '9999-12-31T23:59:59.999Z').catch(() => undefined)
              }
            }
          ]}
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
