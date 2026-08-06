import { useAuth, useCalendar } from '../store'
import { headerTitle } from '../utils/date'
import type { ViewType } from '@shared/types'
import SearchBox from './SearchBox'
import SettingsDialog from './SettingsDialog'
import EventDialog from './EventDialog'
import { useEffect, useState } from 'react'

const VIEWS: { id: ViewType; label: string; key: string }[] = [
  { id: 'day', label: 'Day', key: 'd' },
  { id: 'week', label: 'Week', key: 'w' },
  { id: 'month', label: 'Month', key: 'm' },
  { id: 'year', label: 'Year', key: 'y' },
  { id: 'agenda', label: 'Agenda', key: 'a' }
]

interface ToolbarProps {
  onToggleSidebar: () => void
}

export default function Toolbar({ onToggleSidebar }: ToolbarProps): React.JSX.Element {
  const { view, setView, date, navigate, settings } = useCalendar()
  const { user, logout } = useAuth()
  const canUndo = useCalendar((s) => s.canUndo())
  const canRedo = useCalendar((s) => s.canRedo())
  const undo = useCalendar((s) => s.undo)
  const redo = useCalendar((s) => s.redo)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [newEventOpen, setNewEventOpen] = useState(false)

  useEffect(() => {
    const handler = (): void => setNewEventOpen(true)
    window.addEventListener('calendar:new-event', handler)
    return () => window.removeEventListener('calendar:new-event', handler)
  }, [])

  return (
    <div className="h-14 flex items-center gap-1 sm:gap-2 px-2 sm:px-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shrink-0">
      <button
        onClick={onToggleSidebar}
        className="lg:hidden p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
        title="Toggle sidebar"
        aria-label="Toggle sidebar"
      >
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
          <path d="M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2z" />
        </svg>
      </button>

      <h1 className="font-medium text-gray-800 dark:text-gray-100 mr-1 text-lg">
        <svg viewBox="0 0 24 24" className="w-6 h-6 inline mr-1 text-blue-600" fill="currentColor">
          <path d="M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 16H5V10h14v10z" />
        </svg>
        <span className="hidden sm:inline">Calendar</span>
      </h1>

      <button
        onClick={() => setNewEventOpen(true)}
        className="flex items-center gap-1 px-2 md:px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-full"
        title="New event"
        aria-label="New event"
      >
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" /></svg>
        <span className="hidden md:inline">New</span>
      </button>

      <div className="hidden sm:flex items-center">
        <button
          onClick={() => void undo()}
          disabled={!canUndo}
          className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-30 disabled:hover:bg-transparent"
          title="Undo (Ctrl+Z)"
          aria-label="Undo"
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor"><path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z" /></svg>
        </button>
        <button
          onClick={() => void redo()}
          disabled={!canRedo}
          className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-30 disabled:hover:bg-transparent"
          title="Redo (Ctrl+Shift+Z)"
          aria-label="Redo"
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor"><path d="M18.4 10.6C16.55 8.99 14.15 8 11.5 8c-3.85 0-6.96 2.48-8.1 5.91l2.37.78c.82-2.53 3.06-4.38 5.73-4.38 1.96 0 3.73.72 5.12 1.88L13 15h9V6l-3.6 3.6z" /></svg>
        </button>
        <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-1" />
      </div>

      <button
        onClick={() => setView(settings.defaultView)}
        className="px-2 sm:px-4 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
        title="Today (t)"
      >
        Today
      </button>

      <div className="flex items-center gap-1">
        <button
          onClick={() => navigate(-1)}
          className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
          aria-label="Previous"
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor"><path d="M15.4 7.4 14 6l-6 6 6 6 1.4-1.4L10.8 12z" /></svg>
        </button>
        <button
          onClick={() => navigate(1)}
          className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
          aria-label="Next"
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor"><path d="M8.6 16.6 10 18l6-6-6-6-1.4 1.4 4.6 4.6z" /></svg>
        </button>
      </div>

      <h2 className="text-base sm:text-lg font-normal text-gray-800 dark:text-gray-100 truncate">{headerTitle(view, date, settings.firstDayOfWeek)}</h2>

      <div className="flex-1" />

      <div className="hidden md:block">
        <SearchBox />
      </div>

      <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            title={`${v.label} (${v.key})`}
            className={`px-2 sm:px-3 py-1 text-sm rounded-md transition-colors ${
              view === v.id
                ? 'bg-white dark:bg-gray-800 shadow text-gray-900 dark:text-gray-100 font-medium'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => setSettingsOpen(true)}
          className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
          title="Settings"
          aria-label="Settings"
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
            <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.48.48 0 0 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.61 3.61 0 0 1 8.4 12c0-1.98 1.62-3.6 3.6-3.6s3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
          </svg>
        </button>
        <div className="relative group">
          <button className="w-8 h-8 rounded-full bg-blue-600 text-white text-sm font-medium flex items-center justify-center">
            {user?.name?.[0]?.toUpperCase() ?? '?'}
          </button>
          <div className="absolute right-0 top-10 hidden group-hover:block z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 w-44">
            <p className="px-3 py-1 text-sm text-gray-700 dark:text-gray-200 truncate">{user?.email}</p>
            <button onClick={() => void logout()} className="w-full text-left px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700">
              Sign out
            </button>
          </div>
        </div>
      </div>

      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
      {newEventOpen && <EventDialog defaultDate={new Date()} onClose={() => setNewEventOpen(false)} />}
    </div>
  )
}
