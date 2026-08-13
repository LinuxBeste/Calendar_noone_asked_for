import { useEffect } from 'react'
import { format } from 'date-fns'
import { formatInTz } from '../utils/date'
import type { Calendar, Event, EventOccurrence } from '@shared/types'

interface EventQuickViewProps {
  x: number
  y: number
  occurrence: EventOccurrence
  calendar?: Calendar
  timeFormat: '24h' | '12h'
  secondaryTimezone?: string
  canEdit: boolean
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => void
  onClose: () => void
  onMouseEnter?: () => void
  onMouseLeave?: () => void
}

export default function EventQuickView({ x, y, occurrence, calendar, timeFormat, secondaryTimezone, canEdit, onEdit, onDuplicate, onDelete, onClose, onMouseEnter, onMouseLeave }: EventQuickViewProps): React.JSX.Element {
  const ev: Event = occurrence.event
  const color = ev.color ?? calendar?.color ?? '#1a73e8'
  const tf = timeFormat === '12h' ? 'h:mm a' : 'HH:mm'
  const time = occurrence.allDay
    ? occurrence.start.slice(0, 10) === occurrence.end.slice(0, 10)
      ? 'All day'
      : `${format(new Date(occurrence.start), 'MMM d')} – ${format(new Date(occurrence.end), 'MMM d')}`
    : `${format(new Date(occurrence.start), `${tf} · MMM d`)} – ${format(new Date(occurrence.end), tf)}`

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="animate-pop-in fixed z-[55] w-72 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl overflow-hidden"
      style={{ left: x, top: y }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="h-1.5" style={{ backgroundColor: color }} />
      <div className="p-4">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1 truncate">{ev.icon ? ev.icon + ' ' : ''}{ev.title}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">{time}</p>
        {ev.location && (
          <p className="mt-1.5 text-xs text-gray-600 dark:text-gray-300 flex items-center gap-1 truncate">
            <svg viewBox="0 0 24 24" className="w-3 h-3 shrink-0" fill="currentColor">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 1 0 5z" />
            </svg>
            {ev.location}
          </p>
        )}
        {ev.description && <p className="mt-1.5 text-xs text-gray-600 dark:text-gray-300 line-clamp-2">{ev.description}</p>}
        {calendar && (
          <p className="mt-2 text-xs text-gray-400 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: color }} />
            {calendar.name}
          </p>
        )}
        <div className="mt-3 flex justify-end gap-2">
          {canEdit && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onEdit()
                }}
                className="px-3 py-1 text-xs rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Edit
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onDuplicate()
                }}
                className="px-3 py-1 text-xs rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Duplicate
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete()
                }}
                className="px-3 py-1 text-xs rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
              >
                Delete
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
