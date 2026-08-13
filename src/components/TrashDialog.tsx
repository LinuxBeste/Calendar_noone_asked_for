import { useEffect, useState } from 'react'
import { useCalendar } from '../store'
import ConfirmDialog from './ConfirmDialog'
import type { Event } from '@shared/types'

export default function TrashDialog({ onClose }: { onClose: () => void }): React.JSX.Element {
  const { trash, refreshTrash, restoreTrashed, purgeTrashed, calendars } = useCalendar()
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    void refreshTrash()
  }, [refreshTrash])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        if (confirmId) setConfirmId(null)
        else onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [confirmId, onClose])

  const colorOf = (ev: Event): string => ev.color ?? calendars.find((c) => c.id === ev.calendarId)?.color ?? '#1a73e8'

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="animate-dialog-in bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[94dvh] sm:max-h-[80vh]">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-base font-medium text-gray-900 dark:text-gray-100">Trash</h2>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400" aria-label="Close">
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor"><path d="M19 6.4 17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12z" /></svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-2">
          {trash.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-10">Trash is empty</p>
          )}
          {trash.map((ev) => (
            <div key={ev.id} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: colorOf(ev) }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900 dark:text-gray-100 truncate">{ev.title}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {ev.allDay
                    ? (ev.startDate ?? '')
                    : `${ev.startsAt?.slice(11, 16) ?? ''} · ${ev.startDate ?? ev.startsAt?.slice(0, 10) ?? ''}`}
                  {ev.deletedAt ? ` · deleted ${ev.deletedAt.slice(0, 10)}` : ''}
                </p>
              </div>
              <button
                onClick={() => void restoreTrashed(ev.id)}
                disabled={busyId === ev.id}
                className="px-3 py-1 text-xs rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white shrink-0"
              >
                Restore
              </button>
              <button
                onClick={() => setConfirmId(ev.id)}
                className="px-3 py-1 text-xs rounded-lg border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 shrink-0"
              >
                Delete forever
              </button>
            </div>
          ))}
        </div>
      </div>
      {confirmId && (
        <ConfirmDialog
          title="Delete forever?"
          message="This event will be permanently removed and can no longer be restored."
          danger
          confirmLabel="Delete forever"
          onConfirm={async () => {
            setBusyId(confirmId)
            try {
              await purgeTrashed(confirmId)
            } finally {
              setBusyId(null)
              setConfirmId(null)
            }
          }}
          onClose={() => setConfirmId(null)}
        />
      )}
    </div>
  )
}
