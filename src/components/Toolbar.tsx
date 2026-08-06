import { useAuth, useCalendar } from '../store'
import { headerTitle } from '../utils/date'
import type { ViewType } from '@shared/types'
import SearchBox from './SearchBox'

const VIEWS: { id: ViewType; label: string; key: string }[] = [
  { id: 'day', label: 'Day', key: 'd' },
  { id: 'week', label: 'Week', key: 'w' },
  { id: 'month', label: 'Month', key: 'm' },
  { id: 'year', label: 'Year', key: 'y' },
  { id: 'agenda', label: 'Agenda', key: 'a' }
]

export default function Toolbar(): React.JSX.Element {
  const { view, setView, date, navigate, settings } = useCalendar()
  const { user, logout } = useAuth()
  const canUndo = useCalendar((s) => s.canUndo())
  const canRedo = useCalendar((s) => s.canRedo())
  const undo = useCalendar((s) => s.undo)
  const redo = useCalendar((s) => s.redo)

  return (
    <div className="h-14 flex items-center gap-2 px-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shrink-0">
      <h1 className="font-medium text-gray-800 dark:text-gray-100 mr-1 text-lg">
        <svg viewBox="0 0 24 24" className="w-6 h-6 inline mr-1 text-blue-600" fill="currentColor">
          <path d="M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 16H5V10h14v10z" />
        </svg>
        Calendar
      </h1>

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

      <button
        onClick={() => setView(settings.defaultView)}
        className="px-4 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
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

      <h2 className="text-lg font-normal text-gray-800 dark:text-gray-100">{headerTitle(view, date, settings.firstDayOfWeek)}</h2>

      <div className="flex-1" />

      <SearchBox />

      <div className="ml-2 flex bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            title={`${v.label} (${v.key})`}
            className={`px-3 py-1 text-sm rounded-md transition-colors ${
              view === v.id
                ? 'bg-white dark:bg-gray-800 shadow text-gray-900 dark:text-gray-100 font-medium'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div className="ml-2 flex items-center gap-2">
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
    </div>
  )
}
