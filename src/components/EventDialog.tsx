import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { useAuth, useCalendar } from '../store'
import type { Event, EventDetail, EventInput } from '@shared/types'

interface EventDialogProps {
  event?: Event
  defaultDate?: Date
  onClose: () => void
}

const COLORS = ['#1a73e8', '#d93025', '#f4511e', '#fbbc04', '#188038', '#9334e6', '#a142f4', '#00acc1', '#e8710a']

export default function EventDialog({ event, defaultDate, onClose }: EventDialogProps): React.JSX.Element {
  const { token } = useAuth()
  const { calendars, refreshEvents, refreshCalendars } = useCalendar()
  const [detail, setDetail] = useState<EventDetail | null>(null)
  const [title, setTitle] = useState(event?.title ?? '')
  const [calendarId, setCalendarId] = useState(event?.calendarId ?? '')
  const [allDay, setAllDay] = useState(event?.allDay ?? false)
  const [startDate, setStartDate] = useState(format(event?.startDate ? new Date(event.startDate + 'T00:00:00') : defaultDate ?? new Date(), 'yyyy-MM-dd'))
  const [startTime, setStartTime] = useState(event?.startsAt ? format(new Date(event.startsAt), 'HH:mm') : '09:00')
  const [endDate, setEndDate] = useState(format(event?.endDate ? new Date(event.endDate + 'T00:00:00') : event?.startDate ? new Date(event.startDate + 'T00:00:00') : defaultDate ?? new Date(), 'yyyy-MM-dd'))
  const [endTime, setEndTime] = useState(event?.endsAt ? format(new Date(event.endsAt), 'HH:mm') : '09:30')
  const [description, setDescription] = useState(event?.description ?? '')
  const [location, setLocation] = useState(event?.location ?? '')
  const [color, setColor] = useState(event?.color ?? '')
  const [busy, setBusy] = useState(event?.busy ?? true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

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
    })()
  }, [event, token])

  useEffect(() => {
    if (!calendarId && calendars.length > 0) setCalendarId(calendars[0]!.id)
  }, [calendars, calendarId])

  const editable = calendars.find((c) => c.id === calendarId)?.role !== 'viewer'

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
        busy
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
      busy
    }
  }

  const save = async (): Promise<void> => {
    if (!token) return
    if (!title.trim()) {
      setError('Title is required')
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (event) await window.calendarApi.events.update(token, event.id, buildInput())
      else await window.calendarApi.events.create(token, buildInput())
      onClose()
      const s = useCalendar.getState()
      await s.refreshCalendars()
      await s.refreshEvents('0000-01-01T00:00:00.000Z', '9999-12-31T23:59:59.999Z').catch(() => undefined)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (): Promise<void> => {
    if (!token || !event) return
    if (!window.confirm(`Delete "${event.title}"?`)) return
    await window.calendarApi.events.delete(token, event.id)
    onClose()
  }

  const inputCls =
    'w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm disabled:opacity-50'

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-[560px] max-w-[92vw] max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
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

          <div className="mt-4 flex items-start gap-3">
            <svg viewBox="0 0 24 24" className="w-4 h-4 mt-1 text-gray-400 shrink-0" fill="currentColor">
              <path d="M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 16H5V10h14v10z" />
            </svg>
            <div className="flex-1 space-y-2">
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} disabled={!editable} className="accent-blue-600" />
                All day
              </label>
              <div className="flex gap-2">
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={!editable || allDay} className={inputCls} />
                {!allDay && <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} disabled={!editable} className={inputCls} />}
              </div>
              <div className="flex gap-2">
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} disabled={!editable || allDay} className={inputCls} />
                {!allDay && <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} disabled={!editable} className={inputCls} />}
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <svg viewBox="0 0 24 24" className="w-4 h-4 text-gray-400 shrink-0" fill="currentColor">
              <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zm6.93 6h-2.95a15.65 15.65 0 0 0-1.38-3.56A8.03 8.03 0 0 1 18.92 8zM12 4.04c.83 1.2 1.48 2.53 1.91 3.96h-3.82c.43-1.43 1.08-2.76 1.91-3.96zM4.26 14C4.1 13.36 4 12.69 4 12s.1-1.36.26-2h3.38c-.08.66-.14 1.32-.14 2s.06 1.34.14 2H4.26zm.82 2h2.95c.32 1.25.78 2.45 1.38 3.56A7.987 7.987 0 0 1 5.08 16zm2.95-8H5.08a7.987 7.987 0 0 1 4.33-3.56A15.65 15.65 0 0 0 8.03 8zM12 19.96c-.83-1.2-1.48-2.53-1.91-3.96h3.82c-.43 1.43-1.08 2.76-1.91 3.96zM14.34 14H9.66c-.09-.66-.16-1.32-.16-2s.07-1.35.16-2h4.68c.09.65.16 1.32.16 2s-.07 1.34-.16 2zm.25 5.56c.6-1.11 1.06-2.31 1.38-3.56h2.95a8.03 8.03 0 0 1-4.33 3.56zM16.36 14c.08-.66.14-1.32.14-2s-.06-1.34-.14-2h3.38c.16.64.26 1.31.26 2s-.1 1.36-.26 2h-3.38z" />
            </svg>
            <select value={calendarId} onChange={(e) => setCalendarId(e.target.value)} disabled={!editable} className={inputCls}>
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

          <div className="mt-4 flex items-start gap-3">
            <svg viewBox="0 0 24 24" className="w-4 h-4 mt-2 text-gray-400 shrink-0" fill="currentColor">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11z" />
            </svg>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Add description" disabled={!editable} rows={3} className={inputCls} />
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
              />
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  disabled={!editable}
                  className={`w-5 h-5 rounded-full ${color === c ? 'ring-2 ring-offset-1 ring-gray-500' : ''}`}
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
            </div>
            <label className="ml-2 flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
              <input type="checkbox" checked={busy} onChange={(e) => setBusy(e.target.checked)} disabled={!editable} className="accent-blue-600" />
              Busy
            </label>
          </div>

          {detail && detail.rrule && (
            <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">Recurring event (↻ {detail.rrule}) — recurrence editing coming soon</p>
          )}

          <div className="mt-6 flex items-center gap-2">
            {event && editable && (
              <button onClick={() => void remove()} className="px-4 py-2 text-sm rounded-lg border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30">
                Delete
              </button>
            )}
            <div className="flex-1" />
            <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200">
              Cancel
            </button>
            {editable && (
              <button onClick={() => void save()} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50">
                {saving ? 'Saving…' : 'Save'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
