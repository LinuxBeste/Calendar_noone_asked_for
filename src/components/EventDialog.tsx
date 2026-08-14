import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { useAuth, useCalendar } from '../store'
import { toast, toastError } from '../toasts'
import { formatInTz } from '../utils/date'
import { formatFieldErrors, toErrorMessage } from '../utils/errors'
import { saveTemplate } from '../utils/templates'
import type { Event, EventDetail, EventInput } from '@shared/types'
import ConfirmDialog from './ConfirmDialog'

interface EventDialogProps {
  event?: Event
  defaultDate?: Date
  /** ISO timestamp to prefill start time (used by quick actions) */
  defaultStart?: string
  /** Duration in minutes for defaultStart (defaults to the user setting) */
  defaultDuration?: number
  /** Prefill values from an event template */
  template?: EventInput
  /** Occurrence date (yyyy-MM-dd) when editing a single occurrence of a series */
  occurrence?: string
  onClose: () => void
}

export { EventDialog }

const COLORS = ['#1a73e8', '#d93025', '#f4511e', '#fbbc04', '#188038', '#9334e6', '#a142f4', '#00acc1', '#e8710a']

export default function EventDialog({ event, defaultDate, defaultStart, defaultDuration, template, occurrence, onClose }: EventDialogProps): React.JSX.Element {
  const { token } = useAuth()
  const { calendars, settings, refreshEvents, refreshCalendars } = useCalendar()
  const [detail, setDetail] = useState<EventDetail | null>(null)
  const [title, setTitle] = useState(event?.title ?? template?.title ?? '')
  const [calendarId, setCalendarId] = useState(event?.calendarId ?? template?.calendarId ?? settings.defaultCalendarId)
  const [allDay, setAllDay] = useState(event?.allDay ?? template?.allDay ?? settings.defaultAllDay)
  const [startDate, setStartDate] = useState(() => {
    if (event?.startDate) return event.startDate
    if (defaultStart) return format(new Date(defaultStart), 'yyyy-MM-dd')
    const base = template?.allDay ? template.startDate : undefined
    return format(base ? new Date(base + 'T00:00:00') : defaultDate ?? new Date(), 'yyyy-MM-dd')
  })
  const [startTime, setStartTime] = useState(() => {
    if (event?.startsAt) return format(new Date(event.startsAt), 'HH:mm')
    if (defaultStart) return format(new Date(defaultStart), 'HH:mm')
    if (template?.startsAt) return format(new Date(template.startsAt), 'HH:mm')
    return '09:00'
  })
  const [endDate, setEndDate] = useState(() => {
    if (event?.endDate) return event.endDate
    if (event?.startDate) return event.startDate
    if (defaultStart) return format(new Date(defaultStart), 'yyyy-MM-dd')
    const base = template?.allDay ? template.endDate ?? template.startDate : undefined
    return format(base ? new Date(base + 'T00:00:00') : defaultDate ?? new Date(), 'yyyy-MM-dd')
  })
  const [endTime, setEndTime] = useState(() => {
    if (event?.endsAt) return format(new Date(event.endsAt), 'HH:mm')
    if (defaultStart) {
      const d = new Date(defaultStart)
      const dur = defaultDuration ?? settings.defaultEventDuration
      return format(new Date(d.getTime() + dur * 60000), 'HH:mm')
    }
    if (template?.startsAt && template.endsAt) {
      return format(new Date(template.endsAt), 'HH:mm')
    }
    if (template?.startsAt) {
      return format(new Date(new Date(template.startsAt).getTime() + (defaultDuration ?? settings.defaultEventDuration) * 60000), 'HH:mm')
    }
    const dur = settings.defaultEventDuration
    const d = new Date()
    d.setHours(9, 0, 0, 0)
    d.setMinutes(9 * 60 + dur)
    return format(d, 'HH:mm')
  })
  const [description, setDescription] = useState(event?.description ?? template?.description ?? '')
  const [location, setLocation] = useState(event?.location ?? template?.location ?? '')
  const [color, setColor] = useState(event?.color ?? template?.color ?? settings.defaultColor)
  const [busy, setBusy] = useState(event?.busy ?? template?.busy ?? settings.defaultBusy !== 'free')
  const [repeat, setRepeat] = useState<'none' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'>(() => {
    const freq = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].find((f) => event?.rrule?.includes(`FREQ=${f}`))
    return freq ? (freq as 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY') : 'none'
  })
  const [repeatInterval, setRepeatInterval] = useState(() => {
    const m = event?.rrule?.match(/INTERVAL=(\d+)/)
    return m ? Number(m[1]) : 1
  })
  const [repeatUntil, setRepeatUntil] = useState(() => {
    const m = event?.rrule?.match(/UNTIL=(\d{8})/)
    if (!m) return ''
    const s = m[1]!
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
  })
  const [editMode, setEditMode] = useState<'all' | 'this' | 'following'>('all')
  const [reminder, setReminder] = useState(() => settings.defaultReminderMinutes ?? 0)
  const [existingReminderId, setExistingReminderId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const baseDur = event?.startsAt && event?.endsAt
    ? new Date(event.endsAt).getTime() - new Date(event.startsAt).getTime()
    : settings.defaultEventDuration * 60000

  const isSeriesEdit = !!event?.rrule && !!occurrence

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  /** If the end time still equals start + duration, move it along with the new start. */
  const shiftEndIfUntouched = (newStart: Date): void => {
    if (allDay) return
    const oldStart = new Date(`${startDate}T${startTime}`)
    const oldEnd = new Date(`${endDate}T${endTime}`)
    if (oldEnd.getTime() - oldStart.getTime() !== baseDur) return
    const end = new Date(newStart.getTime() + baseDur)
    setEndDate(format(end, 'yyyy-MM-dd'))
    setEndTime(format(end, 'HH:mm'))
  }

  useEffect(() => {
    if (!event || !token) return
    void (async () => {
      const d = (await window.calendarApi.events.get(token, event.id)) as EventDetail
      setDetail(d)
      if (d.title) setTitle(d.title)
      if (d.calendarId) setCalendarId(d.calendarId)
      if (d.allDay) setAllDay(d.allDay)
      if (d.startDate) setStartDate(d.startDate)
      if (d.endDate) setEndDate(d.endDate)
      if (d.startsAt) setStartTime(format(new Date(d.startsAt), 'HH:mm'))
      if (d.endsAt) setEndTime(format(new Date(d.endsAt), 'HH:mm'))
      if (d.description !== undefined) setDescription(d.description ?? '')
      if (d.location !== undefined) setLocation(d.location ?? '')
      if (d.color !== undefined) setColor(d.color ?? '')
      if (d.busy !== undefined) setBusy(d.busy)
      if (d.icon !== undefined) setIcon(d.icon ?? '')
      if (d.reminders && d.reminders.length > 0) {
        setReminder(d.reminders[0]!.minutes)
        setExistingReminderId(d.reminders[0]!.id)
      }
    })()
  }, [event, token])

  useEffect(() => {
    if (!calendarId && calendars.length > 0) setCalendarId(calendars[0]!.id)
  }, [calendars, calendarId])

  const editable = calendars.find((c) => c.id === calendarId)?.role !== 'viewer'

  const overlaps = useMemo(() => {
    const all = useCalendar.getState().events
    if (allDay) return []
    const start = new Date(`${startDate}T${startTime}`).getTime()
    const end = new Date(`${endDate}T${endTime}`).getTime()
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return []
    return all
      .filter((o) => o.event.id !== event?.id && o.event.busy !== false && !o.allDay)
      .map((o) => ({
        title: o.event.title,
        start: new Date(o.start).getTime(),
        end: new Date(o.end).getTime()
      }))
      .filter((o) => o.start < end && o.end > start)
      .slice(0, 3)
  }, [allDay, startDate, startTime, endDate, endTime, event?.id])

  const [icon, setIcon] = useState(event?.icon ?? template?.icon ?? '')
  const EMOJI_PICKS = ['🏠', '💼', '🏋️', '🍽️', '🎉', '✈️', '🩺', '📚', '💻', '🎓', '🛒', '🧘']

  const buildRrule = (): string | undefined => {
    if (repeat === 'none') return undefined
    const parts = [`FREQ=${repeat}`]
    if (repeatInterval > 1) parts.push(`INTERVAL=${repeatInterval}`)
    if (repeatUntil) {
      const d = new Date(repeatUntil + 'T00:00:00')
      parts.push(`UNTIL=${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}T235959Z`)
    }
    return 'RRULE:' + parts.join(';')
  }

  const buildInput = (): EventInput => {
    if (allDay) {
      return {
        calendarId,
        title,
        description,
        location,
        allDay: true,
        startDate,
        endDate,
        color: color || undefined,
        busy,
        rrule: buildRrule()
      }
    }
    return {
      calendarId,
      title,
      description,
      location,
      allDay: false,
      startsAt: new Date(`${startDate}T${startTime}`).toISOString(),
      endsAt: new Date(`${endDate}T${endTime}`).toISOString(),
      color: color || undefined,
      busy,
      rrule: buildRrule(),
      icon: icon || undefined
    }
  }

  const save = async (): Promise<void> => {
    if (!token) return
    if (!title.trim()) {
      setError('Title is required')
      return
    }
    if (!calendarId) {
      setError('Create a calendar first (sidebar → + New)')
      return
    }
    setSaving(true)
    setError(null)
    const push = useCalendar.getState().pushHistory
    const priorInput = detail ? {
      calendarId: detail.calendarId,
      title: detail.title,
      description: detail.description,
      location: detail.location,
      allDay: detail.allDay,
      startsAt: detail.startsAt,
      endsAt: detail.endsAt,
      startDate: detail.startDate,
      endDate: detail.endDate,
      color: detail.color,
      busy: detail.busy,
      rrule: detail.rrule
    } : undefined
    try {
      if (event && isSeriesEdit) {
        const input = buildInput()
        if (editMode === 'this') {
          await window.calendarApi.events.updateOccurrence(token, event.id, occurrence!, input)
          push({ op: 'occurrence', eventId: event.id, occurrence, before: priorInput, after: input })
        } else if (editMode === 'following') {
          const result = (await window.calendarApi.events.splitSeries(token, event.id, occurrence!, input)) as { id: string }
          push({ op: 'split', eventId: event.id, createdId: result.id, occurrence, before: { rrule: detail?.rrule }, after: input })
        } else {
          await window.calendarApi.events.update(token, event.id, input)
          push({ op: 'update', eventId: event.id, before: priorInput, after: input })
        }
      } else if (event) {
        await window.calendarApi.events.update(token, event.id, buildInput())
        push({ op: 'update', eventId: event.id, before: priorInput, after: buildInput() })
        if (reminder > 0) {
          if (existingReminderId) await window.calendarApi.reminders.delete(token, existingReminderId)
          await window.calendarApi.reminders.create(token, event.id, reminder)
        } else if (existingReminderId) {
          await window.calendarApi.reminders.delete(token, existingReminderId)
        }
      } else {
        const created = (await window.calendarApi.events.create(token, buildInput())) as { id: string }
        push({ op: 'create', eventId: created.id, after: buildInput() })
        if (reminder > 0) {
          await window.calendarApi.reminders.create(token, created.id, reminder)
        }
      }
      onClose()
      toast(event ? 'Event updated' : 'Event created')
      const s = useCalendar.getState()
      await s.refreshCalendars()
      await s.refreshEvents('0000-01-01T00:00:00.000Z', '9999-12-31T23:59:59.999Z').catch(() => undefined)
    } catch (err) {
      const fieldLines = formatFieldErrors(err)
      setError(toErrorMessage(err) + (fieldLines.length > 0 ? ` — ${fieldLines.join(', ')}` : ''))
      toastError(err)
    } finally {
      setSaving(false)
    }
  }

  const remove = async (): Promise<void> => {
    if (!token || !event) return
    const push = useCalendar.getState().pushHistory
    try {
      if (isSeriesEdit && editMode === 'this') {
        await window.calendarApi.events.deleteOccurrence(token, event.id, occurrence!)
        push({ op: 'occurrence', eventId: event.id, occurrence, deletedOccurrence: true, before: detail ? { title: detail.title, startsAt: detail.startsAt, endsAt: detail.endsAt, startDate: detail.startDate, endDate: detail.endDate, allDay: detail.allDay } : undefined })
      } else {
        await window.calendarApi.events.delete(token, event.id)
        push({ op: 'delete', eventId: event.id, deletedEvent: (detail ?? event) as never })
      }
      onClose()
      toast(isSeriesEdit && editMode === 'this' ? 'Event occurrence deleted' : 'Event deleted')
      await useCalendar.getState().refreshEvents('0000-01-01T00:00:00.000Z', '9999-12-31T23:59:59.999Z').catch(() => undefined)
    } catch (err) {
      toastError(err)
    }
  }

  const inputCls =
    'w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-accent text-sm disabled:opacity-50'

  return (
    <div className="fixed inset-0 z-50 bg-black/30 animate-fade-in flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="animate-dialog-in bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:w-[560px] sm:max-w-[92vw] max-h-[94dvh] sm:max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Add title"
            disabled={!editable}
            autoFocus
            className="w-full text-xl font-medium border-0 focus:outline-none placeholder:text-gray-400 bg-transparent text-gray-900 dark:text-gray-100"
          />

          {error && <p className="text-sm text-red-600 dark:text-red-400 mt-2">{error}</p>}

          {overlaps.length > 0 && (
            <p className="mt-2 text-xs rounded-lg bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 px-3 py-2">
              ⚠ Overlaps: {overlaps.map((o) => `${o.title} (${format(new Date(o.start), 'HH:mm')}–${format(new Date(o.end), 'HH:mm')})`).join(', ')}
            </p>
          )}

          <div className="mt-4 flex items-start gap-3">
            <svg viewBox="0 0 24 24" className="w-4 h-4 mt-1 text-gray-400 shrink-0" fill="currentColor">
              <path d="M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 16H5V10h14v10z" />
            </svg>
            <div className="flex-1 space-y-2">
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} disabled={!editable} className="accent-accent" />
                All day
              </label>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value)
                    shiftEndIfUntouched(new Date(`${e.target.value}T${startTime}`))
                  }}
                  disabled={!editable || (allDay && !isSeriesEdit)}
                  className={inputCls}
                />
                {!allDay && (
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => {
                      setStartTime(e.target.value)
                      shiftEndIfUntouched(new Date(`${startDate}T${e.target.value}`))
                    }}
                    disabled={!editable}
                    className={inputCls}
                  />
                )}
              </div>
              <div className="flex gap-2">
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} disabled={!editable || (allDay && !isSeriesEdit)} className={inputCls} />
                {!allDay && <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} disabled={!editable} className={inputCls} />}
              </div>
            </div>
          </div>

          {!allDay && settings.secondaryTimezone && (
            <p className="mt-1 pl-7 text-xs text-gray-400 dark:text-gray-500">
              Also at{' '}
              {formatInTz(new Date(`${startDate}T${startTime}`), settings.secondaryTimezone, 'full')}{' '}
              in {settings.secondaryTimezone}
            </p>
          )}

          <div className="mt-4 flex items-center gap-3">
            <svg viewBox="0 0 24 24" className="w-4 h-4 text-gray-400 shrink-0" fill="currentColor">
              <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zm6.93 6h-2.95a15.65 15.65 0 0 0-1.38-3.56A8.03 8.03 0 0 1 18.92 8zM12 4.04c.83 1.2 1.48 2.53 1.91 3.96h-3.82c.43-1.43 1.08-2.76 1.91-3.96zM4.26 14C4.1 13.36 4 12.69 4 12s.1-1.36.26-2h3.38c-.08.66-.14 1.32-.14 2s.06 1.34.14 2H4.26zm.82 2h2.95c.32 1.25.78 2.45 1.38 3.56A7.987 7.987 0 0 1 5.08 16zm2.95-8H5.08a7.987 7.987 0 0 1 4.33-3.56A15.65 15.65 0 0 0 8.03 8zM12 19.96c-.83-1.2-1.48-2.53-1.91-3.96h3.82c-.43 1.43-1.08 2.76-1.91 3.96zM14.34 14H9.66c-.09-.66-.16-1.32-.16-2s.07-1.35.16-2h4.68c.09.65.16 1.32.16 2s-.07 1.34-.16 2zm.25 5.56c.6-1.11 1.06-2.31 1.38-3.56h2.95a8.03 8.03 0 0 1-4.33 3.56zM16.36 14c.08-.66.14-1.32.14-2s-.06-1.34-.14-2h3.38c.16.64.26 1.31.26 2s-.1 1.36-.26 2h-3.38z" />
            </svg>
            <select value={calendarId} onChange={(e) => setCalendarId(e.target.value)} disabled={!editable || calendars.length === 0} className={inputCls}>
              {calendars.length === 0 && <option value="">No calendar — create one first</option>}
              {calendars.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <svg viewBox="0 0 24 24" className="w-4 h-4 text-gray-400 shrink-0" fill="currentColor">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 1 0 5z" />
            </svg>
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Add location" disabled={!editable} className={inputCls} />
          </div>

          <div className="mt-4 flex items-center gap-3">
            <svg viewBox="0 0 24 24" className="w-4 h-4 text-gray-400 shrink-0" fill="currentColor">
              <path d="M12 22a2.98 2.98 0 0 0 2.818-2h-5.636A2.98 2.98 0 0 0 12 22zm7-7.586V11a7 7 0 0 0-5.5-6.84V3.5a1.5 1.5 0 0 0-3 0V4.16A7 7 0 0 0 5 11v3.414l-1.293 1.293A1 1 0 0 0 4.414 17h15.172a1 1 0 0 0 .707-1.707L19 14.414zM12 6a5 5 0 0 1 5 5v4H7v-4a5 5 0 0 1 5-5z" />
            </svg>
            <div className="flex-1 flex gap-2 items-center">
              <select
                value={reminder}
                onChange={(e) => setReminder(Number(e.target.value))}
                disabled={!editable || allDay}
                className={inputCls + ' w-40'}
              >
                <option value={0}>No reminder</option>
                <option value={5}>5 minutes before</option>
                <option value={10}>10 minutes before</option>
                <option value={30}>30 minutes before</option>
                <option value={60}>1 hour before</option>
                <option value={1440}>1 day before</option>
              </select>
              {event?.allDay && <span className="text-xs text-gray-400">Reminders not supported for all-day events</span>}
            </div>
          </div>

          <div className="mt-4 flex items-start gap-3">
            <svg viewBox="0 0 24 24" className="w-4 h-4 mt-2 text-gray-400 shrink-0" fill="currentColor">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11z" />
            </svg>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Add description" disabled={!editable} rows={3} className={inputCls} />
          </div>

          <div className="mt-4 flex items-center gap-3">
            <svg viewBox="0 0 24 24" className="w-4 h-4 text-gray-400 shrink-0" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" />
            </svg>
            <input
              value={icon}
              onChange={(e) => setIcon(e.target.value.slice(0, 4))}
              placeholder="Emoji / icon (optional)"
              disabled={!editable}
              className={inputCls + ' w-40 text-center text-lg'}
            />
            <div className="flex gap-1 flex-wrap">
              {EMOJI_PICKS.map((em) => (
                <button
                  key={em}
                  onClick={() => setIcon(em === icon ? '' : em)}
                  disabled={!editable}
                  className={`text-lg leading-none w-7 h-7 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 ${icon === em ? 'bg-gray-100 dark:bg-gray-700 ring-1 ring-accent' : ''}`}
                  title={em}
                  aria-label={`Use ${em} as event icon`}
                >
                  {em}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <svg viewBox="0 0 24 24" className="w-4 h-4 text-gray-400 shrink-0" fill="currentColor">
              <path d="M22 3H2v18h20V3zm-2 16H4V5h16v14zM8 12h2v3H8zm4-3h2v6h-2zm4 5h2v-4h-2z" />
            </svg>
            <span className="text-sm text-gray-600 dark:text-gray-300">Color</span>
            <div className="flex gap-1.5 flex-wrap">
              <button
                onClick={() => setColor('')}
                disabled={!editable}
                className="w-5 h-5 rounded-full border border-gray-300 dark:border-gray-500"
                style={{ background: 'transparent' }}
                title="Calendar color"
                aria-label="Use calendar default color"
              />
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  disabled={!editable}
                  className={`w-5 h-5 rounded-full ${color === c ? 'ring-2 ring-offset-1 ring-gray-500' : ''}`}
                  style={{ backgroundColor: c }}
                  title={c}
                  aria-label={`Use color ${c}`}
                />
              ))}
            </div>
            <label className="ml-2 flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
              <input type="checkbox" checked={busy} onChange={(e) => setBusy(e.target.checked)} disabled={!editable} className="accent-accent" />
              Busy
            </label>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <svg viewBox="0 0 24 24" className="w-4 h-4 text-gray-400 shrink-0" fill="currentColor">
              <path d="M17.65 6.35A7.95 7.95 0 0 0 12 4a8 8 0 0 0-7.07 4.03L2 5v7h7l-2.94-2.94A5.98 5.98 0 0 1 12 6c1.62 0 3.1.62 4.24 1.76L17.65 6.35zM22 18v-7h-7l2.94 2.94A5.98 5.98 0 0 1 12 18c-1.62 0-3.1-.62-4.24-1.76L6.35 17.65A7.95 7.95 0 0 0 12 20a8 8 0 0 0 7.07-4.03L22 18z" />
            </svg>
            <div className="flex-1 flex gap-2 items-center">
              <select
                value={repeat}
                onChange={(e) => setRepeat(e.target.value as typeof repeat)}
                disabled={!editable}
                className={inputCls + ' w-36'}
              >
                <option value="none">Does not repeat</option>
                <option value="DAILY">Daily</option>
                <option value="WEEKLY">Weekly</option>
                <option value="MONTHLY">Monthly</option>
                <option value="YEARLY">Yearly</option>
              </select>
              {repeat !== 'none' && (
                <>
                  <input
                    type="number"
                    min={1}
                    value={repeatInterval}
                    onChange={(e) => setRepeatInterval(Number(e.target.value) || 1)}
                    disabled={!editable}
                    className={inputCls + ' w-16'}
                  />
                  <input
                    type="date"
                    value={repeatUntil}
                    onChange={(e) => setRepeatUntil(e.target.value)}
                    disabled={!editable}
                    className={inputCls + ' w-36'}
                    title="Repeat until (optional)"
                  />
                </>
              )}
            </div>
          </div>

          {isSeriesEdit && (
            <div className="mt-3 flex items-center gap-2 text-sm">
              <span className="text-gray-500 dark:text-gray-400 text-xs">Edit applies to:</span>
              <div className="flex gap-1">
                {(
                  [
                    ['this', 'This event'],
                    ['following', 'This and following'],
                    ['all', 'All events']
                  ] as const
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    onClick={() => setEditMode(mode)}
                    disabled={!editable}
                    className={`px-2 py-1 text-xs rounded-full border ${
                      editMode === mode
                        ? 'bg-accent text-white border-accent'
                        : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6 flex items-center gap-2">
            {editable && !event && (
              <button
                onClick={() => {
                  if (!title.trim()) {
                    setError('Give the event a title first')
                    return
                  }
                  const tpl = saveTemplate(buildInput())
                  toast(`Template “${tpl.name}” saved`)
                }}
                className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                title="Save these values as a reusable template"
              >
                Save as template
              </button>
            )}
            {event && editable && (
              <button onClick={() => setConfirming(true)} className="px-4 py-2 text-sm rounded-lg border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30">
                Delete
              </button>
            )}
            <div className="flex-1" />
            <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200">
              Cancel
            </button>
            {editable && (
              <button onClick={() => void save()} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-accent hover:bg-accent-hover text-white disabled:opacity-50">
                {saving ? 'Saving…' : 'Save'}
              </button>
            )}
          </div>
        </div>
      </div>
      {confirming && event && (
        <ConfirmDialog
          title={isSeriesEdit && editMode === 'this' ? 'Delete this occurrence?' : 'Delete event?'}
          message={`“${event.title}”${isSeriesEdit && editMode === 'this' ? ' will be removed from the series.' : ' will be permanently deleted.'}`}
          confirmLabel="Delete"
          onConfirm={remove}
          onClose={() => setConfirming(false)}
        />
      )}
    </div>
  )
}
