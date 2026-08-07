import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { useCalendar } from '../store'
import { EventDialog } from './EventDialog'
import type { Event } from '@shared/types'

interface Slot {
  start: Date
  end: Date
}

function findFreeSlots(events: Event[], from: Date, to: Date, durationMinutes: number, windowStart: number, windowEnd: number, ignoreFree: boolean): Slot[] {
  const blocked: { start: number; end: number }[] = []
  for (const ev of events) {
    if (ignoreFree && ev.busy === false) continue
    const s = ev.allDay ? new Date((ev.startDate ?? '') + 'T00:00:00') : new Date(ev.startsAt ?? '')
    let e = ev.allDay ? new Date((ev.endDate ?? ev.startDate ?? '') + 'T00:00:00').getTime() + 86400000 : new Date(ev.endsAt ?? '').getTime()
    if (Number.isNaN(s.getTime()) || Number.isNaN(e)) continue
    blocked.push({ start: s.getTime(), end: e })
  }
  const slots: Slot[] = []
  const cur = new Date(from)
  cur.setHours(0, 0, 0, 0)
  const last = new Date(to)
  last.setHours(0, 0, 0, 0)
  while (cur <= last) {
    const dayStart = new Date(cur)
    dayStart.setHours(windowStart, 0, 0, 0)
    const dayEnd = new Date(cur)
    dayEnd.setHours(windowEnd, 0, 0, 0)
    for (let t = dayStart.getTime(); t + durationMinutes * 60000 <= dayEnd.getTime(); t += 15 * 60000) {
      const s = t
      const e = t + durationMinutes * 60000
      const clash = blocked.some((b) => b.start < e && b.end > s)
      if (!clash) slots.push({ start: new Date(s), end: new Date(e) })
    }
    cur.setDate(cur.getDate() + 1)
  }
  return slots
}

export default function FindFreeTimeDialog({ onClose }: { onClose: () => void }): React.JSX.Element {
  const { events, settings } = useCalendar()
  const [from, setFrom] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [days, setDays] = useState(7)
  const [duration, setDuration] = useState(settings.defaultEventDuration ?? 30)
  const [windowStart, setWindowStart] = useState(settings.workingHoursStart)
  const [windowEnd, setWindowEnd] = useState(settings.workingHoursEnd)
  const [ignoreFree, setIgnoreFree] = useState(false)
  const [editing, setEditing] = useState<Date | null>(null)

  const slots = useMemo(() => {
    const fromDate = new Date(from + 'T00:00:00')
    const toDate = new Date(fromDate)
    toDate.setDate(toDate.getDate() + days - 1)
    return findFreeSlots(events.map((o) => o.event), fromDate, toDate, duration, windowStart, windowEnd, ignoreFree)
  }, [events, from, days, duration, windowStart, windowEnd, ignoreFree])

  const slice = settings.timeFormat === '12h'
    ? { hour: 'numeric', minute: '2-digit', hour12: true } as const
    : { hour: '2-digit', minute: '2-digit', hour12: false } as const
  const fmt = (d: Date): string => d.toLocaleTimeString([], slice)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const selectCls =
    'px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500'
  const labelCls = 'text-xs text-gray-500 dark:text-gray-400 mb-1 block'

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[80vh]">
        <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-base font-medium text-gray-900 dark:text-gray-100">Find free time</h2>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400" aria-label="Close">
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor"><path d="M19 6.4 17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12z" /></svg>
          </button>
        </div>
        <div className="px-5 py-3 grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="col-span-2">
            <label className={labelCls}>From</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={selectCls + ' w-full'} />
          </div>
          <div>
            <label className={labelCls}>Days</label>
            <select value={days} onChange={(e) => setDays(Number(e.target.value))} className={selectCls + ' w-full'}>
              {[1, 3, 7, 14, 30].map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Duration</label>
            <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className={selectCls + ' w-full'}>
              {[15, 30, 45, 60, 90, 120, 180].map((d) => (
                <option key={d} value={d}>{d} min</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Window</label>
            <select value={`${windowStart}-${windowEnd}`} onChange={(e) => {
              const [s, en] = e.target.value.split('-').map(Number)
              setWindowStart(s!)
              setWindowEnd(en!)
            }} className={selectCls + ' w-full'}>
              {[[0, 24], [8, 18], [9, 17], [9, 21], [6, 20]].map(([s, e]) => (
                <option key={`${s}-${e}`} value={`${s}-${e}`}>{s}:00 – {e}:00</option>
              ))}
            </select>
          </div>
          <div className="col-span-2 sm:col-span-5 flex items-center gap-2 pt-1">
            <input id="ignore-free" type="checkbox" checked={ignoreFree} onChange={(e) => setIgnoreFree(e.target.checked)} className="accent-blue-600" />
            <label htmlFor="ignore-free" className="text-xs text-gray-600 dark:text-gray-300">Ignore events marked as free</label>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-3 border-t border-gray-200 dark:border-gray-700">
          {slots.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">No free slots found — try a longer range or shorter duration</p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
              {slots.slice(0, 40).map((slot) => (
                <li key={slot.start.getTime()}>
                  <button
                    onClick={() => setEditing(slot.start)}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-left"
                  >
                    <span>
                      {format(slot.start, 'EEE, MMM d')} · {fmt(slot.start)} – {fmt(slot.end)}
                    </span>
                    <span className="text-xs text-blue-600 dark:text-blue-400">Add event +</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {editing && (
        <EventDialog
          defaultStart={editing.toISOString()}
          defaultDuration={duration}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
