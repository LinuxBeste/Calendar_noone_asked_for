import { useMemo, useState, useEffect, useRef } from 'react'
import { format, isSameDay, isToday, differenceInCalendarDays, startOfDay, endOfDay, addDays } from 'date-fns'
import { useCalendar, useAuth } from '../store'
import { rangeStart, rangeEnd, toISO, iterateDays, isoWeekNumber } from '../utils/date'
import { holidaysBetween } from '../utils/holidays'
import { attachPointerDrag } from '../lib/pointer-drag'
import { isTouchDevice } from '../lib/platform'
import type { Event, EventOccurrence } from '@shared/types'
import EventDialog from '../components/EventDialog'
import ContextMenu from '../components/ContextMenu'
import ConfirmDialog from '../components/ConfirmDialog'
import EventQuickView from '../components/EventQuickView'
import { decorateEvent } from '../lib/plugins'
import { useSwipeSlide } from '../lib/use-swipe-slide'
import { toast } from '../toasts'

interface WeekViewProps {
  date: Date
  days: number
}

interface Positioned {
  event: Event
  occ: EventOccurrence
  fromPrev: boolean
  toNext: boolean
  startMin: number
  endMin: number
  col: number
  cols: number
}

const BASE_PX_PER_MIN = 0.5
const MIN_ZOOM = 0.2
const MAX_ZOOM = 2

export default function WeekView({ date, days }: WeekViewProps): React.JSX.Element {
  const { events, calendars, refreshEvents, settings, visibleCalendars } = useCalendar()
  const { token } = useAuth()
  const [zoom, setZoom] = useState(settings.defaultZoomPct / 100)
  const zoomRef = useRef(settings.defaultZoomPct / 100)
  const [dialog, setDialog] = useState<{ event?: Event; date?: Date; occurrence?: string; defaultStart?: string; defaultDuration?: number } | null>(null)
  const [dragCreate, setDragCreate] = useState<{ key: string; startMins: number; curMins: number } | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; event: Event; occurrence: string } | null>(null)
  const [gridMenu, setGridMenu] = useState<{ x: number; y: number; date: Date; defaultStart?: string } | null>(null)
  const [confirming, setConfirming] = useState<{ event: Event; occurrence: string; occurrenceOnly: boolean } | null>(null)
  const [hover, setHover] = useState<{ occ: EventOccurrence; x: number; y: number; canEdit: boolean } | null>(null)
  const [preview, setPreview] = useState<{ occ: EventOccurrence; x: number; y: number; canEdit: boolean } | null>(null)
  const [now, setNow] = useState(new Date())
  const scrollRef = useRef<HTMLDivElement>(null)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [ghost, setGhost] = useState<{ id: string; title: string; x: number; y: number } | null>(null)
  const dragSessions = useRef(new Map<string, ReturnType<typeof attachPointerDrag>>())
  const suppressClickRef = useRef(false)
  /** Pending resize ends (event id → end), committed once on pointer release. */
  const pendingResizeEnds = useRef(new Map<string, Date>())

  const consumeClick = (): boolean => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return true
    }
    return false
  }

  const pxPerMin = BASE_PX_PER_MIN * zoom

  const setZoomClamped = (next: number): void => {
    const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next))
    zoomRef.current = z
    setZoom(z)
  }

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const fit = el.clientHeight / (1440 * BASE_PX_PER_MIN)
    if (settings.fitDayToScreen && fit < zoomRef.current) setZoomClamped(fit)
    if (settings.scrollToWorkingHours) el.scrollTop = settings.workingHoursStart * 60 * BASE_PX_PER_MIN * zoomRef.current - 32
  }, [settings.workingHoursStart, settings.fitDayToScreen, settings.scrollToWorkingHours])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onWheel = (e: WheelEvent): void => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      const p0 = BASE_PX_PER_MIN * zoomRef.current
      const rect = el.getBoundingClientRect()
      const minutes = (e.clientY - rect.top + el.scrollTop) / p0
      const factor = Math.exp(-e.deltaY * 0.0015)
      const z1 = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoomRef.current * factor))
      zoomRef.current = z1
      setZoom(z1)
      const p1 = BASE_PX_PER_MIN * z1
      el.scrollTop = minutes * p1 - (e.clientY - rect.top)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (!window.matchMedia('(pointer: coarse)').matches) return
    const pointers = new Map<number, { x: number; y: number }>()
    let pinchStart = 0
    let pinchZoomStart = 1
    const dist = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y)
    const clearAll = (): void => {
      pointers.clear()
      pinchStart = 0
    }
    const onDown = (e: PointerEvent): void => {
      if (e.pointerType !== 'touch') return
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pointers.size > 2) {
        const recent = [...pointers.entries()].slice(-2)
        pointers.clear()
        for (const [id, p] of recent) pointers.set(id, p)
      }
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }]
        pinchStart = dist(a, b)
        pinchZoomStart = zoomRef.current
      }
    }
    const onMove = (e: PointerEvent): void => {
      if (e.pointerType !== 'touch' || !pointers.has(e.pointerId)) return
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pointers.size !== 2 || pinchStart === 0) return
      const [a, b] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }]
      const d = dist(a, b)
      if (d < 20) return
      const z1 = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, pinchZoomStart * (d / pinchStart)))
      if (z1 === zoomRef.current) return
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const my = (a.y + b.y) / 2
      const minutes = (my - rect.top + el.scrollTop) / (BASE_PX_PER_MIN * pinchZoomStart)
      zoomRef.current = z1
      setZoom(z1)
      el.scrollTop = minutes * (BASE_PX_PER_MIN * z1) - (my - rect.top)
    }
    const onUp = (e: PointerEvent): void => {
      if (e.pointerType !== 'touch') return
      pointers.delete(e.pointerId)
      pinchStart = 0
    }
    // Window-level cleanup so a swallowed pointerup/cancel (e.g. system gesture)
    // can never leave a stale pointer that would block future scrolling.
    const onWindowEnd = (e: PointerEvent): void => {
      if (e.pointerType === 'touch') clearAll()
    }
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onWindowEnd, true)
    window.addEventListener('pointercancel', onWindowEnd, true)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onWindowEnd, true)
      window.removeEventListener('pointercancel', onWindowEnd, true)
      clearAll()
    }
  }, [])

  const { slideRef, slideStyle } = useSwipeSlide(suppressClickRef)

  const zoomBy = (factor: number): void => {
    const el = scrollRef.current
    if (!el) return
    const minutes = (el.scrollTop + el.clientHeight / 2) / (BASE_PX_PER_MIN * zoom)
    const z1 = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * factor))
    setZoomClamped(z1)
    el.scrollTop = minutes * (BASE_PX_PER_MIN * z1) - el.clientHeight / 2
  }

  const zoomFit = (): void => {
    const el = scrollRef.current
    if (!el) return
    setZoomClamped(el.clientHeight / (1440 * BASE_PX_PER_MIN))
    el.scrollTop = 0
  }

  const from = useMemo(() => rangeStart(days === 7 ? 'week' : 'day', date, settings.firstDayOfWeek), [date, days, settings.firstDayOfWeek])
  const to = useMemo(() => rangeEnd(days === 7 ? 'week' : 'day', date, settings.firstDayOfWeek), [date, days, settings.firstDayOfWeek])

  useEffect(() => {
    void refreshEvents(toISO(from), toISO(to))
  }, [from, to, refreshEvents, token])

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
  }, [])

  const snap = settings.snapInterval
  const gutterWidth = settings.timeGutterWidth === 'narrow' ? 'w-8' : settings.timeGutterWidth === 'wide' ? 'w-16' : 'w-12'
  const dayColumns = useMemo(() => {
    const cols = [...iterateDays(from, to)]
    return settings.hideWeekends && days === 7 ? cols.filter((d) => d.getDay() !== 0 && d.getDay() !== 6) : cols
  }, [from, to, settings.hideWeekends, days])
  const colMin = `min(${settings.dayColumnMinWidth}px, ${100 / Math.max(dayColumns.length, 1)}%)`

  const holidays = useMemo(() => (settings.showHolidays ? holidaysBetween(from, to, settings.holidaysCountry) : new Map<string, string>()), [from, to, settings.showHolidays, settings.holidaysCountry])

  const { byDay, allDayEvents } = useMemo(() => {
    const byDay = new Map<string, { occ: EventOccurrence; fromPrev: boolean; toNext: boolean }[]>()
    const allDay: EventOccurrence[] = []
    const push = (key: string, item: { occ: EventOccurrence; fromPrev: boolean; toNext: boolean }): void => {
      byDay.set(key, [...(byDay.get(key) ?? []), item])
    }
    for (const occ of events) {
      if (visibleCalendars[occ.event.calendarId] === false) continue
      if (occ.allDay) {
        // Only truly all-day events belong in the top row. Multi-day *timed*
        // events render as clamped grid segments with ‹ › continuation
        // markers below — putting them here too made them appear twice.
        allDay.push(occ)
        continue
      }
      const s = new Date(occ.start)
      const e = new Date(occ.end)
      const dayCount = differenceInCalendarDays(e, s)
      if (dayCount <= 0) {
        push(format(s, 'yyyy-MM-dd'), { occ, fromPrev: false, toNext: false })
        continue
      }
      const base = startOfDay(s)
      for (let i = 0; i <= dayCount; i++) {
        const day = addDays(base, i)
        const start = i === 0 ? s : day
        const end = i === dayCount ? e : endOfDay(day)
        if (new Date(end).getTime() <= new Date(start).getTime()) continue
        const clamped: EventOccurrence = {
          ...occ,
          start: start.toISOString(),
          end: end.toISOString()
        }
        push(format(day, 'yyyy-MM-dd'), { occ: clamped, fromPrev: i > 0, toNext: i < dayCount })
      }
    }
    return { byDay, allDayEvents: allDay }
  }, [events, visibleCalendars])

  const calendarById = useMemo(() => new Map(calendars.map((c) => [c.id, c])), [calendars])

  const positioned = useMemo(() => {
    const result = new Map<string, Positioned[]>()
    for (const [dayKey, evs] of byDay) {
      const timed = evs
        .filter((o) => o.occ.start && o.occ.end)
        .map((item) => ({
          item,
          start: new Date(item.occ.start).getTime(),
          end: new Date(item.occ.end).getTime()
        }))
        .sort((a, b) => a.start - b.start || a.end - b.end)
      const active: { entry: Positioned; end: number }[] = []
      const positioned: Positioned[] = []
      for (const { item, start, end } of timed) {
        for (let i = active.length - 1; i >= 0; i--) {
          const a = active[i]
          if (a && a.end <= start) active.splice(i, 1)
        }
        const taken = new Set(active.map((a) => a.entry.col))
        let col = 0
        while (taken.has(col)) col += 1
        const groupSize = active.length + 1
        for (const a of active) a.entry.cols = Math.max(a.entry.cols, groupSize)
        const entry: Positioned = {
          event: item.occ.event,
          occ: item.occ,
          fromPrev: item.fromPrev,
          toNext: item.toNext,
          startMin: new Date(item.occ.start).getHours() * 60 + new Date(item.occ.start).getMinutes(),
          endMin: new Date(item.occ.end).getHours() * 60 + new Date(item.occ.end).getMinutes(),
          col,
          cols: Math.max(groupSize, col + 1)
        }
        positioned.push(entry)
        active.push({ entry, end })
      }
      result.set(dayKey, positioned.sort((a, b) => a.startMin - b.startMin || a.col - b.col))
    }
    return result
  }, [byDay])

  const nowLine = now.getHours() * 60 + now.getMinutes()

  const showHover = (el: HTMLElement, occ: EventOccurrence): void => {
    if (!settings.showHoverPreview) return
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

  const openPreview = (el: HTMLElement, occ: EventOccurrence): void => {
    const rect = el.getBoundingClientRect()
    const panelW = 288
    const panelH = 240
    const x = Math.min(rect.left, window.innerWidth - panelW - 8)
    const y = rect.bottom + 8 + panelH > window.innerHeight ? Math.max(8, rect.top - panelH - 8) : rect.bottom + 8
    setHover(null)
    setPreview({
      occ,
      x,
      y,
      canEdit: calendars.find((c) => c.id === occ.event.calendarId)?.role === 'owner' || calendars.find((c) => c.id === occ.event.calendarId)?.role === 'editor'
    })
  }

  const requestDelete = (event: Event, occurrence: string, occurrenceOnly: boolean): void => {
    setMenu(null)
    setHover(null)
    setPreview(null)
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
    void refreshEvents(toISO(from), toISO(to))
  }

  const moveEvent = async (event: Event, newStart: Date): Promise<void> => {
    if (!token) return
    try {
      const occ = events.find((o) => o.event.id === event.id)
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
      toast('Event moved — Ctrl+Z to undo', 'info')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Move failed', 'error')
    }
  }

  const resizeEvent = async (event: Event, newEnd: Date): Promise<void> => {
    if (!token) return
    try {
      const occ = events.find((o) => o.event.id === event.id)
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
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Resize failed', 'error')
    }
  }

  const editableFor = (ev: Event): boolean => {
    const role = calendars.find((c) => c.id === ev.calendarId)?.role
    return role === 'owner' || role === 'editor'
  }

  const resizeAllDayEvent = (ev: Event, newEnd: Date, sourceDay: string): void => {
    if (!token) return
    const newEndKey = format(newEnd, 'yyyy-MM-dd')
    const occ = events.find((o) => o.event.id === ev.id)
    const push = useCalendar.getState().pushHistory
    const finish = (): void => {
      void refreshEvents(toISO(from), toISO(to))
    }
    const fail = (err: unknown): void => toast(err instanceof Error ? err.message : 'Resize failed', 'error')
    if (ev.rrule) {
      void window.calendarApi.events
        .updateOccurrence(token, ev.id, sourceDay, { startDate: format(new Date(occ?.start ?? ev.startsAt ?? sourceDay + 'T00:00:00'), 'yyyy-MM-dd'), endDate: newEndKey, allDay: true })
        .then(() => {
          push({ op: 'occurrence', eventId: ev.id, occurrence: sourceDay, before: { endDate: occ?.end.slice(0, 10) }, after: { endDate: newEndKey, allDay: true } })
          finish()
        })
        .catch(fail)
    } else {
      void window.calendarApi.events
        .update(token, ev.id, { endDate: newEndKey })
        .then(() => {
          push({ op: 'update', eventId: ev.id, before: { endDate: occ?.end.slice(0, 10) }, after: { endDate: newEndKey } })
          finish()
        })
        .catch(fail)
    }
  }

  const applyAllDayMove = (ev: Event, occ: EventOccurrence, day: Date): void => {
    const dayKey = format(day, 'yyyy-MM-dd')
    const push = useCalendar.getState().pushHistory
    const finish = (): void => {
      void refreshEvents(toISO(from), toISO(to))
    }
    const fail = (err: unknown): void => toast(err instanceof Error ? err.message : 'Move failed', 'error')
    if (ev.rrule) {
      const sourceDay = format(new Date(occ.start), 'yyyy-MM-dd')
      void window.calendarApi.events
        .updateOccurrence(token!, ev.id, sourceDay, { startDate: dayKey, endDate: dayKey, allDay: true })
        .then(() => {
          push({ op: 'occurrence', eventId: ev.id, occurrence: sourceDay, before: { allDay: false, startsAt: occ.start, endsAt: occ.end }, after: { allDay: true, startDate: dayKey, endDate: dayKey } })
          finish()
        })
        .catch(fail)
    } else {
      const dur = new Date(occ.end).getTime() - new Date(occ.start).getTime()
      void window.calendarApi.events
        .update(token!, ev.id, {
          startDate: dayKey,
          endDate: dur > 86400000 ? format(new Date(new Date(dayKey + 'T00:00:00').getTime() + dur), 'yyyy-MM-dd') : dayKey
        })
        .then(() => {
          push({ op: 'update', eventId: ev.id, before: { startsAt: occ.start, endsAt: occ.end }, after: { startDate: dayKey, endDate: dayKey, allDay: true } })
          finish()
        })
        .catch(fail)
    }
  }

  const applyTimedMove = (ev: Event, occ: EventOccurrence, start: Date): void => {
    const dur = new Date(occ.end).getTime() - new Date(occ.start).getTime()
    const end = new Date(start.getTime() + dur)
    const finish = (): void => {
      void refreshEvents(toISO(from), toISO(to))
    }
    const fail = (err: unknown): void => toast(err instanceof Error ? err.message : 'Move failed', 'error')
    if (ev.rrule) {
      const sourceDay = format(new Date(occ.start), 'yyyy-MM-dd')
      void window.calendarApi.events
        .updateOccurrence(token!, ev.id, sourceDay, { startsAt: start.toISOString(), endsAt: end.toISOString() })
        .then(() => {
          useCalendar.getState().pushHistory({ op: 'occurrence', eventId: ev.id, occurrence: sourceDay, before: { startsAt: occ.start, endsAt: occ.end }, after: { startsAt: start.toISOString(), endsAt: end.toISOString() } })
          finish()
        })
        .catch(fail)
    } else {
      void moveEvent(ev, start)
    }
  }

  const handleDrop = (day: Date, clientY: number | undefined, raw: string): void => {
    if (!raw || !token) return
    const { id, allDay } = JSON.parse(raw) as { id: string; allDay?: boolean }
    const occ = events.find((x) => x.event.id === id)
    if (!occ) return
    const ev = occ.event
    if (allDay) {
      applyAllDayMove(ev, occ, day)
      return
    }
    if (clientY === undefined) return
    // The day header cells carry data-daycol too and come first in the DOM, so
    // querySelector would return the header (wrong rect). Use the last match.
    const cols = document.querySelectorAll(`[data-daycol="${format(day, 'yyyy-MM-dd')}"]`)
    const dayEl = cols[cols.length - 1] as HTMLElement | undefined
    if (!dayEl) return
    const rect = dayEl.getBoundingClientRect()
    const mins = Math.max(0, Math.min(1439, Math.round(((clientY - rect.top) / pxPerMin) / snap) * snap))
    const start = new Date(day)
    start.setHours(Math.floor(mins / 60), mins % 60, 0, 0)
    applyTimedMove(ev, occ, start)
  }

  const startChipDrag = (e: React.PointerEvent, ev: Event, occ: EventOccurrence, allDayDrop: boolean): void => {
    if (e.pointerType !== 'touch') return
    if (!token) return
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
        const col = el?.closest('[data-daycol]') as HTMLElement | null
        if (!col || !col.dataset.daycol) return
        const day = parseDayKey(col.dataset.daycol)
        if (!day) return
        if (allDayDrop) applyAllDayMove(ev, occ, day)
        else {
          const rect = col.getBoundingClientRect()
          const mins = Math.max(0, Math.min(1439, Math.round(((y - rect.top) / pxPerMin) / snap) * snap))
          const start = new Date(day)
          start.setHours(Math.floor(mins / 60), mins % 60, 0, 0)
          applyTimedMove(ev, occ, start)
        }
      },
      onCancel() {
        setGhost(null)
      }
    })
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">
      <div className="flex-1 flex flex-col min-h-0 overflow-x-auto" ref={slideRef} style={slideStyle}>
      {settings.showDayHeaders && (
      <div className="flex shrink-0 border-b border-gray-200 dark:border-gray-700">
        <div className={`${gutterWidth} shrink-0`} />
        <div className="flex-1 grid" style={{ gridTemplateColumns: `repeat(${dayColumns.length}, minmax(${colMin}, 1fr))` }}>
          {dayColumns.map((d, i) => {
            const key = format(d, 'yyyy-MM-dd')
            const weekend = d.getDay() === 0 || d.getDay() === 6
            const holiday = holidays.get(key)
            return (
              <div
                key={i}
                data-daycol={key}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  handleDrop(d, e.clientY, e.dataTransfer.getData('application/x-cal-event'))
                }}
                className={`border-l border-gray-200 dark:border-gray-700 py-1 text-center ${(settings.weekendShading && weekend) || (settings.holidayShading && holiday) ? 'bg-gray-50 dark:bg-gray-800/60' : ''}`}
              >
                <div className={`text-sm ${isToday(d) ? 'text-accent font-medium' : 'text-gray-500 dark:text-gray-400'}`}>
                  {format(d, 'EEE')}
                  {settings.showWeekNumbers && days === 7 && (
                    <span className="ml-1 text-[9px] text-gray-400 dark:text-gray-500">W{isoWeekNumber(d)}</span>
                  )}
                </div>
                <div
                  className={`mx-auto h-7 w-7 flex items-center justify-center rounded-full text-sm ${
                    isToday(d) ? 'bg-accent text-white font-medium' : 'text-gray-700 dark:text-gray-200'
                  }`}
                >
                  {d.getDate()}
                </div>
                {holiday && <div className="text-[9px] leading-tight text-red-500 dark:text-red-400 truncate px-0.5" title={holiday}>{holiday}</div>}
                {settings.showAllDayRow && (
                <div className="mt-0.5 space-y-0.5">
                  {allDayEvents
                    .filter((occ) => occDaySpan(occ, d))
                    .map((occ) => {
                      const ev = occ.event
                      const cal = calendarById.get(ev.calendarId)
                      const color = ev.color ?? cal?.color ?? '#1a73e8'
                      const deco = decorateEvent(ev)
                      const continues = new Date(occ.end) > new Date(d.getTime() + 86400000 - 1)
                      const barAlpha = Math.round((settings.eventOpacity / 100) * 34).toString(16).padStart(2, '0')
                      const editable = editableFor(ev)
                      return (
                        <button
                          key={ev.id + d.toISOString()}
                          onClick={(e) => {
                            if (consumeClick()) return
                            openPreview(e.currentTarget as HTMLElement, occ)
                          }}
                          onContextMenu={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            setPreview(null)
                            setMenu({ x: e.clientX, y: e.clientY, event: ev, occurrence: format(new Date(occ.start), 'yyyy-MM-dd') })
                          }}
                          onPointerDown={(e) => startChipDrag(e, ev, occ, true)}
                          draggable={!isTouchDevice() && editable && settings.dragAndDropEnabled}
                          onDragStart={(e) => {
                            e.dataTransfer.setData('application/x-cal-event', JSON.stringify({ id: ev.id, allDay: true }))
                            e.dataTransfer.effectAllowed = 'move'
                          }}
                          style={{ backgroundColor: color + barAlpha, color, touchAction: editable && settings.dragAndDropEnabled ? 'none' : 'auto', boxShadow: deco.tint ? `inset 3px 0 0 ${deco.tint}` : undefined }}
                          className={`relative w-full text-left text-[11px] px-1 py-0.5 truncate rounded hover:shadow ${continues ? '' : 'rounded-r-full'}`}
                          title={settings.showEventTooltips ? ev.title : undefined}
                        >
                          {deco.icon ? deco.icon + ' ' : ''}{ev.title}
                          {editable && settings.resizeEnabled && (
                            <span
                              className="absolute bottom-0 left-2 right-2 h-2 cursor-ns-resize bg-black/15 hover:bg-black/30 rounded-b"
                              onPointerDown={(e) => {
                                e.stopPropagation()
                                e.preventDefault()
                                const chipEl = (e.currentTarget as HTMLElement).closest('button')
                                if (!chipEl) return
                                const startY = e.clientY
                                const day = new Date(d)
                                const occStart = new Date(occ.start)
                                const sourceDay = format(occStart, 'yyyy-MM-dd')
                                // Track the pending end locally and commit exactly once on
                                // release — committing per pointer move floods the API.
                                const session = attachPointerDrag(e.currentTarget as HTMLElement, e.pointerId, e.pointerType, e.clientX, e.clientY, {
                                  onClaim() {
                                    suppressClickRef.current = true
                                  },
                                  onMove(_x, y) {
                                    const dy = y - startY
                                    const deltaDays = Math.round(dy / 28)
                                    const end = new Date(new Date(occStart.getTime() + 86400000 - 1))
                                    end.setHours(23, 59, 59, 999)
                                    const newEnd = new Date(end)
                                    newEnd.setDate(end.getDate() + deltaDays)
                                    if (newEnd <= occStart) return
                                    pendingResizeEnds.current.set(ev.id, newEnd)
                                  },
                                  onEnd() {
                                    dragSessions.current.delete('resize-all-' + ev.id)
                                    const end = pendingResizeEnds.current.get(ev.id)
                                    if (end) {
                                      pendingResizeEnds.current.delete(ev.id)
                                      void resizeAllDayEvent(ev, end, sourceDay)
                                    }
                                  },
                                  onCancel() {
                                    dragSessions.current.delete('resize-all-' + ev.id)
                                    pendingResizeEnds.current.delete(ev.id)
                                  }
                                })
                                dragSessions.current.set('resize-all-' + ev.id, session)
                              }}
                            />
                          )}
                        </button>
                      )
                    })}
                </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
      )}

      <div className="flex-1 flex overflow-y-auto relative" ref={scrollRef} style={{ touchAction: 'pan-y' }}>
        <div className={`${gutterWidth} shrink-0 relative`}>
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="absolute right-2 -translate-y-1/2 text-[10px] text-gray-400" style={{ top: h * 60 * pxPerMin }}>
              {format(new Date(2000, 0, 1, h), settings.timeFormat === '12h' ? 'h a' : 'HH:mm')}
            </div>
          ))}
        </div>

        <div className="flex-1 relative" style={{ display: 'grid', gridTemplateColumns: `repeat(${dayColumns.length}, minmax(${colMin}, 1fr))` }}>
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className={`absolute left-0 right-0 border-t border-gray-200 dark:border-gray-700 ${settings.hourLineStyle === 'dashed' ? 'border-dashed' : ''}`} style={{ top: h * 60 * pxPerMin }} />
          ))}
          {settings.showQuarterLines &&
          Array.from({ length: 24 }, (_, h) => (
            <div key={h + 'q'} className="absolute left-0 right-0 border-t border-dashed border-gray-100 dark:border-gray-800" style={{ top: h * 60 * pxPerMin + pxPerMin * 30 }} />
          ))}

          <div
            className="absolute left-0 right-0 pointer-events-none bg-gray-400/[0.06] dark:bg-black/30"
            style={{ top: 0, height: settings.workingHoursStart * 60 * pxPerMin }}
          />
          <div
            className="absolute left-0 right-0 pointer-events-none bg-gray-400/[0.06] dark:bg-black/30"
            style={{ top: settings.workingHoursEnd * 60 * pxPerMin, bottom: 0 }}
          />

          {dayColumns.map((d, i) => {
            const key = format(d, 'yyyy-MM-dd')
            const weekend = d.getDay() === 0 || d.getDay() === 6
            const holiday = holidays.get(key)
            return (
              <div
                key={i}
                className={`relative border-l border-gray-200 dark:border-gray-700 cursor-pointer ${(settings.weekendShading && weekend) || (settings.holidayShading && holiday) ? 'bg-gray-100/50 dark:bg-gray-900/40' : ''}`}
                onClick={(e) => {
                  if (consumeClick()) return
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                  const mins = Math.max(0, Math.min(1439, Math.round(((e.clientY - rect.top) / pxPerMin) / snap) * snap))
                  const start = new Date(d)
                  start.setHours(Math.floor(mins / 60), mins % 60, 0, 0)
                  setDialog({ date: start, defaultStart: start.toISOString() })
                }}
                onContextMenu={(e) => {
                  e.preventDefault()
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                  const mins = Math.max(0, Math.min(1439, Math.round(((e.clientY - rect.top) / pxPerMin) / snap) * snap))
                  const start = new Date(d)
                  start.setHours(Math.floor(mins / 60), mins % 60, 0, 0)
                  setMenu(null)
                  setGridMenu({ x: e.clientX, y: e.clientY, date: start, defaultStart: start.toISOString() })
                }}
                onDragOver={(e) => e.preventDefault()}
                onPointerDown={(e) => {
                  if (e.pointerType === 'mouse' && e.button !== 0) return
                  const t = e.target as HTMLElement
                  if (t.closest('[draggable]') || t.closest('.rounded-md')) return
                  const col = e.currentTarget as HTMLElement
                  const rect = col.getBoundingClientRect()
                  const raw = (e.clientY - rect.top) / pxPerMin
                  const startMins = settings.newEventsUseSnap ? Math.round(raw / snap) * snap : Math.round(raw)
                  if (!settings.dragAndDropEnabled) return
                  if (e.pointerType !== 'touch') e.preventDefault()
                  const session = attachPointerDrag(col, e.pointerId, e.pointerType, e.clientX, e.clientY, {
                    onClaim() {
                      suppressClickRef.current = true
                      setDragCreate({ key, startMins, curMins: startMins })
                    },
                    onMove(_x, y) {
                      const r = col.getBoundingClientRect()
                      setDragCreate((s) => (s ? { ...s, curMins: Math.max(0, Math.min(1440, Math.round((y - r.top) / pxPerMin))) } : s))
                    },
                    onEnd(_x, y) {
                      dragSessions.current.delete(key)
                      setDragCreate(null)
                      const r = col.getBoundingClientRect()
                      const endMins = Math.max(0, Math.min(1440, Math.round((y - r.top) / pxPerMin)))
                      const dur = Math.round(Math.abs(endMins - startMins) / snap) * snap
                      if (dur < snap) return
                      const start = new Date(d)
                      start.setHours(Math.floor(Math.min(startMins, endMins) / 60), Math.min(startMins, endMins) % 60, 0, 0)
                      setDialog({ defaultStart: start.toISOString(), defaultDuration: dur })
                    },
                    onCancel() {
                      dragSessions.current.delete(key)
                      setDragCreate(null)
                    }
                  })
                  dragSessions.current.set(key, session)
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  handleDrop(d, e.clientY, e.dataTransfer.getData('application/x-cal-event'))
                }}
                data-daycol={key}
              >
                {dragCreate && dragCreate.key === key && (
                  <div
                    className="absolute left-1 right-1 z-10 pointer-events-none rounded-md border-2 border-dashed border-accent bg-accent/15"
                    style={{
                      top: Math.min(dragCreate.startMins, dragCreate.curMins) * pxPerMin + 1,
                      height: Math.max(Math.abs(dragCreate.curMins - dragCreate.startMins) * pxPerMin - 2, 14)
                    }}
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
                {positioned.get(key)?.map((p) => {
                  const cal = calendarById.get(p.event.calendarId)
                  const color = p.event.color ?? cal?.color ?? '#1a73e8'
                  const editable = editableFor(p.event)
                  const free = p.event.busy === false
                  const deco = decorateEvent(p.event)
                  const alphaHex = Math.round((settings.eventOpacity / 100) * 230).toString(16).padStart(2, '0')
                  const freeAlphaHex = Math.round((settings.eventOpacity / 100) * 140).toString(16).padStart(2, '0')
                  return (
                    <div
                      key={p.event.id}
                      onClick={(e) => {
                        if (consumeClick()) return
                        e.stopPropagation()
                        openPreview(e.currentTarget, p.occ)
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setHover(null)
                        setMenu({ x: e.clientX, y: e.clientY, event: p.event, occurrence: key })
                      }}
                      onMouseEnter={(e) => showHover(e.currentTarget, p.occ)}
                      onMouseLeave={hideHoverSoon}
                      onPointerDown={(e) => startChipDrag(e, p.event, p.occ, false)}
                      draggable={!isTouchDevice() && editable && settings.dragAndDropEnabled}
                      onDragStart={(e) => {
                        e.dataTransfer.setData('application/x-cal-event', JSON.stringify({ id: p.event.id, allDay: false }))
                        e.dataTransfer.effectAllowed = 'move'
                      }}
                      onDragEnd={() => void refreshEvents(toISO(from), toISO(to))}
                      className="absolute rounded-md overflow-hidden text-[11px] cursor-pointer hover:shadow-md transition-shadow group"
                      style={{
                        top: p.startMin * pxPerMin + 2,
                        height: Math.max((p.endMin - p.startMin) * pxPerMin - 3, 18),
                        left: `calc(${(p.col / p.cols) * 100}% + 2px)`,
                        width: `calc(${100 / p.cols}% - 4px)`,
                        backgroundColor: free ? color + freeAlphaHex : color + alphaHex,
                        color: '#fff',
                        borderStyle: free ? 'dashed' : undefined,
                        borderWidth: free ? 1 : undefined,
                        borderColor: 'rgba(255,255,255,0.6)',
                        touchAction: editable && settings.dragAndDropEnabled ? 'none' : 'auto',
                        boxShadow: deco.tint && p.event.busy !== false ? `inset 4px 0 0 ${deco.tint}` : free ? `inset 0 0 0 1px ${color}` : undefined,
                        zIndex: 10
                      }}
                      title={settings.showEventTooltips ? `${p.event.title}\n${format(new Date(p.event.startsAt!), 'HH:mm')} – ${format(new Date(p.event.endsAt!), 'HH:mm')}${p.event.location ? '\n' + p.event.location : ''}${p.event.description ? '\n' + p.event.description : ''}` : undefined}
                    >
                      <div className="px-1.5 py-0.5 truncate font-medium pointer-events-none flex items-center gap-0.5">
                        {p.fromPrev && <span className="shrink-0">‹</span>}
                        <span className="flex-1 truncate">{(deco.icon ?? p.event.icon ?? '') ? (deco.icon ?? p.event.icon ?? '') + ' ' : ''}{p.event.title}</span>
                        {p.toNext && <span className="shrink-0">›</span>}
                      </div>
                      <div className="px-1.5 truncate opacity-90 pointer-events-none">
                        {format(new Date(p.event.startsAt!), 'HH:mm')}
                        {settings.showEndTimesInWeek ? ` – ${format(new Date(p.event.endsAt!), 'HH:mm')}` : ''}
                      </div>
                      {editable && settings.resizeEnabled && (p.endMin - p.startMin) * pxPerMin > 28 && (
                        <div
                          className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize opacity-100 sm:opacity-0 sm:group-hover:opacity-100 bg-black/20"
                          onPointerDown={(e) => {
                            e.stopPropagation()
                            e.preventDefault()
                            const colEl = e.currentTarget.closest('[data-daycol]') as HTMLElement | null
                            if (!colEl) return
                            const startY = e.clientY
                            const origEnd = new Date(p.event.endsAt!).getTime()
                            // Track the pending end locally and commit exactly once on
                            // release — committing per pointer move floods the API.
                            const session = attachPointerDrag(e.currentTarget as HTMLElement, e.pointerId, e.pointerType, e.clientX, e.clientY, {
                              onClaim() {
                                suppressClickRef.current = true
                              },
                              onMove(_x, y) {
                                const dy = y - startY
                                const newEnd = new Date(origEnd + (dy / pxPerMin) * 60000)
                                newEnd.setMinutes(Math.round(newEnd.getMinutes() / settings.snapInterval) * settings.snapInterval)
                                if (newEnd <= new Date(p.event.startsAt!)) return
                                pendingResizeEnds.current.set(p.event.id, newEnd)
                              },
                              onEnd() {
                                dragSessions.current.delete('resize-' + p.event.id)
                                const end = pendingResizeEnds.current.get(p.event.id)
                                if (end) {
                                  pendingResizeEnds.current.delete(p.event.id)
                                  void resizeEvent(p.event, end)
                                }
                              },
                              onCancel() {
                                dragSessions.current.delete('resize-' + p.event.id)
                                pendingResizeEnds.current.delete(p.event.id)
                              }
                            })
                            dragSessions.current.set('resize-' + p.event.id, session)
                          }}
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}

          {settings.showNowLine && dayColumns.some((d) => isSameDay(d, now)) && (
            <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top: nowLine * pxPerMin }}>
              <div className="h-0.5 bg-red-500 relative">
                <span className="absolute -left-1 -top-[3px] h-2 w-2 rounded-full bg-red-500" />
              </div>
            </div>
          )}
        </div>
      </div>
      </div>

      <div className="absolute bottom-24 sm:bottom-3 right-3 z-30 flex items-center gap-0.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white/95 dark:bg-gray-800/95 shadow-md px-1 py-0.5 select-none">
        <button
          onClick={() => zoomBy(0.8)}
          title="Zoom out (Ctrl+wheel)"
          className="h-6 w-6 flex items-center justify-center rounded text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm leading-none"
        >
          −
        </button>
        <span className="w-11 text-center text-[11px] tabular-nums text-gray-500 dark:text-gray-400">{Math.round(zoom * 100)}%</span>
        <button
          onClick={() => zoomBy(1.25)}
          title="Zoom in (Ctrl+wheel)"
          className="h-6 w-6 flex items-center justify-center rounded text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm leading-none"
        >
          +
        </button>
        <button
          onClick={zoomFit}
          title="Fit to screen"
          className="h-6 w-6 flex items-center justify-center rounded text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 3H5a2 2 0 0 0-2 2v3" />
            <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
            <path d="M3 16v3a2 2 0 0 0 2 2h3" />
            <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
          </svg>
        </button>
      </div>

      {dialog && <EventDialog event={dialog.event} defaultDate={dialog.date} defaultStart={dialog.defaultStart} defaultDuration={dialog.defaultDuration} occurrence={dialog.occurrence} onClose={() => setDialog(null)} />}
      {gridMenu && (
        <ContextMenu
          x={gridMenu.x}
          y={gridMenu.y}
          onClose={() => setGridMenu(null)}
          items={[{ label: 'New event', onClick: () => setDialog({ date: gridMenu.date, defaultStart: gridMenu.defaultStart }) }]}
        />
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
      {preview && (
        <>
          <div className="fixed inset-0 z-[54]" onClick={() => setPreview(null)} />
          <EventQuickView
            x={preview.x}
            y={preview.y}
            occurrence={preview.occ}
            calendar={calendarById.get(preview.occ.event.calendarId)}
            timeFormat={settings.timeFormat}
            canEdit={preview.canEdit}
            onEdit={() => {
              const occ = preview.occ
              setPreview(null)
              setDialog({ event: occ.event, occurrence: format(new Date(occ.start), 'yyyy-MM-dd') })
            }}
            onDelete={() => requestDelete(preview.occ.event, format(new Date(preview.occ.start), 'yyyy-MM-dd'), !!preview.occ.event.rrule)}
            onDuplicate={() => {
              const ev = preview.occ.event
              setPreview(null)
              void useCalendar.getState().duplicateEvent(ev, preview.occ)
            }}
            onClose={() => setPreview(null)}
          />
        </>
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
    </div>
  )
}

function occDaySpan(occ: EventOccurrence, day: Date): boolean {
  const dayKey = format(day, 'yyyy-MM-dd')
  const start = format(new Date(occ.start), 'yyyy-MM-dd')
  return start <= dayKey && format(new Date(occ.end), 'yyyy-MM-dd') >= dayKey
}

function parseDayKey(key: string | undefined): Date | null {
  if (!key) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}
