import { useMemo, useState, useEffect, useRef } from 'react'
import { format, isSameDay, isToday, isSameMonth } from 'date-fns'
import { useCalendar, useAuth } from '../store'
import { rangeStart, rangeEnd, toISO, iterateDays } from '../utils/date'
import { holidaysBetween } from '../utils/holidays'
import { attachPointerDrag } from '../lib/pointer-drag'
import { isTouchDevice } from '../lib/platform'
import type { Event, EventOccurrence } from '@shared/types'
import EventDialog from '../components/EventDialog'
import ContextMenu from '../components/ContextMenu'
import ConfirmDialog from '../components/ConfirmDialog'
import EventQuickView from '../components/EventQuickView'
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
  const { events, calendars, refreshEvents, settings, visibleCalendars } = useCalendar()
  const { token } = useAuth()
  const [dialog, setDialog] = useState<{ event?: Event; date?: Date; occurrence?: string } | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; event: Event; occurrence: string } | null>(null)
  const [moreMenu, setMoreMenu] = useState<MoreMenu | null>(null)
  const [confirming, setConfirming] = useState<{ event: Event; occurrence: string; occurrenceOnly: boolean } | null>(null)
  const [hover, setHover] = useState<{ occ: EventOccurrence; x: number; y: number; canEdit: boolean } | null>(null)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [ghost, setGhost] = useState<{ id: string; title: string; x: number; y: number } | null>(null)
  const suppressClickRef = useRef(false)

  const consumeClick = (): boolean => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return true
    }
    return false
  }

  useEffect(() => () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
  }, [])

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
    for (const occ of events) {
      if (visibleCalendars[occ.event.calendarId] === false) continue
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
  }, [events, date, settings.firstDayOfWeek, visibleCalendars])

  const holidays = useMemo(() => {
    if (!settings.monthShowHolidays) return new Map<string, string>()
    const from = rangeStart('month', date, settings.firstDayOfWeek)
    const to = rangeEnd('month', date, settings.firstDayOfWeek)
    return holidaysBetween(from, to, settings.holidaysCountry)
  }, [date, settings.firstDayOfWeek, settings.monthShowHolidays, settings.holidaysCountry])

  const calendarById = useMemo(() => new Map(calendars.map((c) => [c.id, c])), [calendars])

  const showHover = (el: HTMLElement, occ: EventOccurrence): void => {
    if (!window.matchMedia('(hover: hover)').matches) return
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    const rect = el.getBoundingClientRect()
    const panelW = 288
    const panelH = 240
    const x = Math.min(rect.left, window.innerWidth - panelW - 8)
    const y = rect.bottom + 8 + panelH > window.innerHeight ? Math.max(8, rect.top - panelH - 8) : rect.bottom + 8
    setHover({
      occ,
      x,
      y,
      canEdit: calendars.find((c) => c.id === occ.event.calendarId)?.role === 'owner' || calendars.find((c) => c.id === occ.event.calendarId)?.role === 'editor'
    })
  }
  const hideHoverSoon = (): void => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    hoverTimer.current = setTimeout(() => setHover(null), 150)
  }

  const requestDelete = (event: Event, occurrence: string, occurrenceOnly: boolean): void => {
    setMenu(null)
    setMoreMenu(null)
    setHover(null)
    setConfirming({ event, occurrence, occurrenceOnly })
  }

  const confirmDelete = async (): Promise<void> => {
    if (!token || !confirming) return
    const push = useCalendar.getState().pushHistory
    if (confirming.occurrenceOnly) {
      await window.calendarApi.events.deleteOccurrence(token, confirming.event.id, confirming.occurrence)
      push({ op: 'occurrence', eventId: confirming.event.id, occurrence: confirming.occurrence, deletedOccurrence: true })
    } else {
      await window.calendarApi.events.delete(token, confirming.event.id)
      push({ op: 'delete', eventId: confirming.event.id, deletedEvent: confirming.event })
    }
    toast(confirming.occurrenceOnly ? 'Event occurrence deleted' : 'Event deleted')
    void refreshEvents('0000-01-01T00:00:00.000Z', '9999-12-31T23:59:59.999Z')
  }

  const applyMonthDrop = (d: Date, id: string, allDay: boolean | undefined): void => {
    if (!token) return
    const occ = events.find((x) => x.event.id === id)
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
      const fail = (err: unknown): void => toast(err instanceof Error ? err.message : 'Move failed', 'error')
      if (ev.rrule) {
        void window.calendarApi.events.updateOccurrence(token, id, sourceDay, after).then(finish).catch(fail)
      } else {
        void window.calendarApi.events.update(token, id, after).then(finish).catch(fail)
      }
    } else {
      const dur = new Date(occ.end).getTime() - new Date(occ.start).getTime()
      const start = new Date(dayKey + 'T' + format(new Date(occ.start), 'HH:mm:ss'))
      const after = { startsAt: start.toISOString(), endsAt: new Date(start.getTime() + dur).toISOString() }
      const finish = (): void => {
        useCalendar.getState().pushHistory({ op: 'update', eventId: id, before: { startsAt: occ.start, endsAt: occ.end }, after })
        void refreshEvents(toISO(rangeStart('month', date, settings.firstDayOfWeek)), toISO(rangeEnd('month', date, settings.firstDayOfWeek)))
      }
      const fail = (err: unknown): void => toast(err instanceof Error ? err.message : 'Move failed', 'error')
      if (ev.rrule) {
        const sourceDay = format(new Date(occ.start), 'yyyy-MM-dd')
        void window.calendarApi.events.updateOccurrence(token, id, sourceDay, after).then(finish).catch(fail)
      } else {
        void window.calendarApi.events.update(token, id, after).then(finish).catch(fail)
      }
    }
  }

  const startChipDrag = (e: React.PointerEvent, ev: Event, occ: EventOccurrence): void => {
    if (e.pointerType !== 'touch') return
    const chip = e.currentTarget as HTMLElement
    attachPointerDrag(chip, e.pointerId, e.pointerType, e.clientX, e.clientY, {
      onClaim() {
        suppressClickRef.current = true
      },
      onMove(x, y) {
        setGhost({ id: ev.id, title: ev.title, x, y })
      },
      onEnd(x, y) {
        setGhost(null)
        const el = document.elementFromPoint(x, y) as HTMLElement | null
        const cell = el?.closest('[data-daykey]') as HTMLElement | null
        if (!cell || !cell.dataset.daykey) return
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(cell.dataset.daykey)
        if (!m) return
        applyMonthDrop(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])), ev.id, occ.allDay)
      },
      onCancel() {
        setGhost(null)
      }
    })
  }

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
      <div
        className="flex-1 grid grid-cols-7 overflow-hidden"
        style={{ gridTemplateRows: `repeat(${Math.max(5, Math.ceil(days.length / 7))}, 1fr)` }}
      >
        {days.map((d, i) => {
          const key = format(d, 'yyyy-MM-dd')
          const dayEvents = byDay.get(key) ?? []
          const visible = dayEvents.slice(0, settings.monthMaxEvents)
          const extra = dayEvents.length - visible.length
          const weekend = d.getDay() === 0 || d.getDay() === 6
          const selected = isSameDay(d, date)
          const holiday = holidays.get(key)
          const trailing = !isSameMonth(d, date)
          if (!settings.monthTrailingDays && trailing) {
            return <div key={i} className={`border-b border-r border-gray-200 dark:border-gray-700 ${settings.monthWeekendShading && weekend ? 'bg-gray-50 dark:bg-gray-800/60' : ''}`} />
          }
          return (
            <div
              key={i}
              data-daykey={key}
              onClick={() => {
                if (consumeClick()) return
                setDialog({ date: d })
              }}
              onDragOver={(e) => {
                if (settings.monthDragDrop) e.preventDefault()
              }}
              onDrop={(e) => {
                if (!settings.monthDragDrop) return
                e.preventDefault()
                e.stopPropagation()
                const raw = e.dataTransfer.getData('application/x-cal-event')
                if (!raw) return
                const { id, allDay } = JSON.parse(raw) as { id: string; allDay?: boolean }
                applyMonthDrop(d, id, allDay)
              }}
              className={`border-b border-r border-gray-200 dark:border-gray-700 overflow-hidden cursor-pointer
                ${(settings.monthWeekendShading && weekend) || holiday ? 'bg-gray-50 dark:bg-gray-800/60' : ''} ${selected ? 'ring-1 ring-inset ring-accent' : ''} ${settings.monthCompactWeekends && weekend ? 'p-0.5' : 'p-1'}`}
            >
              <div className="flex items-start justify-between px-0.5 mb-0.5">
                <span
                  className={`text-xs h-6 w-6 flex items-center justify-center rounded-full ${
                    isToday(d)
                      ? settings.monthTodayRing
                        ? 'text-accent font-medium ring-1 ring-accent'
                        : 'text-accent font-medium'
                      : isSameMonth(d, date)
                        ? 'text-gray-700 dark:text-gray-200'
                        : 'text-gray-400 dark:text-gray-600'
                  }`}
                >
                  {d.getDate()}
                </span>
                <div className="flex flex-col items-end gap-0.5">
                  {dayEvents.length > 0 && (
                    <span className="text-[9px] leading-none px-1 py-0.5 rounded-full bg-accent/15 dark:bg-accent/25 text-accent dark:text-accent">
                      {dayEvents.length}
                    </span>
                  )}
                  {settings.monthShowWeekNumbers && i % 7 === 0 && (
                    <span className="text-[10px] text-gray-400">{weekNumber(d)}</span>
                  )}
                </div>
              </div>
              {holiday && (
                <div className="text-[9px] leading-tight text-red-500 dark:text-red-400 truncate px-0.5 mb-0.5" title={holiday}>
                  {holiday}
                </div>
              )}
              <div className="space-y-0.5">
                {visible.map((occ) => {
                  const ev = occ.event
                  const cal = calendarById.get(ev.calendarId)
                  const color = ev.color ?? cal?.color ?? '#1a73e8'
                  const continues = new Date(occ.end) > new Date(d.getTime() + 86400000 - 1)
                  if (settings.monthEventStyle === 'dot') {
                    return (
                      <button
                        key={ev.id + key}
                        onClick={(e) => {
                          if (consumeClick()) return
                          e.stopPropagation()
                          setDialog({ event: ev, occurrence: format(new Date(occ.start), 'yyyy-MM-dd') })
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          setHover(null)
                          setMenu({ x: e.clientX, y: e.clientY, event: ev, occurrence: format(new Date(occ.start), 'yyyy-MM-dd') })
                        }}
                        onMouseEnter={(e) => settings.monthHoverPreview && showHover(e.currentTarget, occ)}
                        onMouseLeave={hideHoverSoon}
                        onPointerDown={(e) => startChipDrag(e, ev, occ)}
                        draggable={!isTouchDevice() && settings.monthDragDrop && (calendars.find((c) => c.id === ev.calendarId)?.role === 'owner' || calendars.find((c) => c.id === ev.calendarId)?.role === 'editor')}
                        onDragStart={(e) => {
                          e.dataTransfer.setData('application/x-cal-event', JSON.stringify({ id: ev.id, allDay: occ.allDay }))
                          e.dataTransfer.effectAllowed = 'move'
                        }}
                        style={{ touchAction: settings.monthDragDrop && (calendars.find((c) => c.id === ev.calendarId)?.role === 'owner' || calendars.find((c) => c.id === ev.calendarId)?.role === 'editor') ? 'none' : 'auto' }}
                        className="w-full flex items-center gap-1 text-[10px] px-1 py-px truncate hover:bg-gray-100 dark:hover:bg-gray-700/50 rounded"
                        title={settings.showEventTooltips ? `${ev.title}${ev.location ? '\n' + ev.location : ''}` : undefined}
                      >
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                        <span className="truncate text-gray-700 dark:text-gray-200">{ev.title}</span>
                      </button>
                    )
                  }
                  return (
                    <button
                      key={ev.id + key}
                      onClick={(e) => {
                        if (consumeClick()) return
                        e.stopPropagation()
                        setDialog({ event: ev, occurrence: format(new Date(occ.start), 'yyyy-MM-dd') })
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setHover(null)
                        setMenu({ x: e.clientX, y: e.clientY, event: ev, occurrence: format(new Date(occ.start), 'yyyy-MM-dd') })
                      }}
                      onMouseEnter={(e) => settings.monthHoverPreview && showHover(e.currentTarget, occ)}
                      onMouseLeave={hideHoverSoon}
                      onPointerDown={(e) => startChipDrag(e, ev, occ)}
                      draggable={!isTouchDevice() && settings.monthDragDrop && (calendars.find((c) => c.id === ev.calendarId)?.role === 'owner' || calendars.find((c) => c.id === ev.calendarId)?.role === 'editor')}
                      onDragStart={(e) => {
                        e.dataTransfer.setData('application/x-cal-event', JSON.stringify({ id: ev.id, allDay: occ.allDay }))
                        e.dataTransfer.effectAllowed = 'move'
                      }}
                      className={`w-full text-left px-1 py-0.5 rounded truncate hover:shadow ${continues ? '' : 'rounded-r-full'} ${settings.monthEventStyle === 'compact' ? 'text-[10px]' : 'text-[11px]'}`}
                      style={{
                        backgroundColor: settings.monthEventStyle === 'compact' ? 'transparent' : color + Math.round((settings.eventOpacity / 100) * 34).toString(16).padStart(2, '0'),
                        color,
                        opacity: settings.monthEventStyle === 'compact' ? settings.eventOpacity / 100 : 1,
                        touchAction: settings.monthDragDrop && (calendars.find((c) => c.id === ev.calendarId)?.role === 'owner' || calendars.find((c) => c.id === ev.calendarId)?.role === 'editor') ? 'none' : 'auto'
                      }}
                      title={settings.showEventTooltips ? `${ev.title}${ev.location ? '\n' + ev.location : ''}` : undefined}
                    >
                      {settings.monthShowEventTime && !occ.allDay ? format(new Date(occ.start), 'H:mm') + ' ' : ''}
                      {ev.icon ? ev.icon + ' ' : ''}{ev.title}
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
                    className="text-[11px] text-gray-500 dark:text-gray-400 pl-1 hover:text-accent"
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
                  <span className="flex-1 text-sm text-gray-800 dark:text-gray-100 truncate">{ev.icon ? ev.icon + ' ' : ''}{ev.title}</span>
                </button>
              )
            })}
            <button
              onClick={() => {
                setMoreMenu(null)
                setDialog({ date: moreMenu.date })
              }}
              className="w-full mt-1 px-2 py-1.5 rounded-lg text-sm text-accent dark:text-accent hover:bg-accent/10 dark:hover:bg-accent/20 text-left"
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
              label: 'Duplicate',
              onClick: () => {
                const occ = events.find((o) => o.event.id === menu.event.id)
                void useCalendar.getState().duplicateEvent(menu.event, occ)
              }
            },
            {
              label: 'Delete',
              danger: true,
              onClick: () => requestDelete(menu.event, menu.occurrence, !!menu.event.rrule)
            }
          ]}
        />
      )}
      {hover && (
        <EventQuickView
          x={hover.x}
          y={hover.y}
          occurrence={hover.occ}
          calendar={calendarById.get(hover.occ.event.calendarId)}
          timeFormat={settings.timeFormat}
          canEdit={hover.canEdit}
          onEdit={() => {
            setHover(null)
            setDialog({ event: hover.occ.event, occurrence: format(new Date(hover.occ.start), 'yyyy-MM-dd') })
          }}
          onDelete={() => requestDelete(hover.occ.event, format(new Date(hover.occ.start), 'yyyy-MM-dd'), !!hover.occ.event.rrule)}
          onDuplicate={() => {
            const ev = hover.occ.event
            setHover(null)
            void useCalendar.getState().duplicateEvent(ev, hover.occ)
          }}
          onClose={hideHoverSoon}
          onMouseEnter={() => {
            if (hoverTimer.current) clearTimeout(hoverTimer.current)
          }}
          onMouseLeave={hideHoverSoon}
        />
      )}
      {confirming && (
        <ConfirmDialog
          title={confirming.occurrenceOnly ? 'Delete this occurrence?' : 'Delete event?'}
          message={`“${confirming.event.title}”${confirming.occurrenceOnly ? ' will be removed from the series.' : ' will be permanently deleted.'}`}
          confirmLabel="Delete"
          onConfirm={confirmDelete}
          onClose={() => setConfirming(null)}
        />
      )}
      {ghost && (
        <div
          className="pointer-events-none fixed z-[60] max-w-[60vw] truncate rounded-md border border-accent bg-white dark:bg-gray-800 px-2 py-1 text-xs text-gray-800 dark:text-gray-100 shadow-lg"
          style={{ left: ghost.x + 10, top: ghost.y - 24 }}
        >
          {ghost.title}
        </div>
      )}
    </div>
  )
}

function weekNumber(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 1)
  const diff = (d.getTime() - start.getTime() + ((start.getTimezoneOffset() - d.getTimezoneOffset()) * 60000)) / 86400000
  return Math.ceil((diff + ((start.getDay() + 1) % 7)) / 7)
}
