import { useAuth, useCalendar } from '../store'
import { headerTitle } from '../utils/date'
import { parseQuickAdd } from '../utils/quickadd'
import { listTemplates, removeTemplate, type EventTemplate } from '../utils/templates'
import { exportEventsCsv, printEvents } from '../utils/export'
import type { ViewType } from '@shared/types'
import SearchBox from './SearchBox'
import SettingsDialog from './SettingsDialog'
import EventDialog from './EventDialog'
import FindFreeTimeDialog from './FindFreeTimeDialog'
import ShortcutsDialog from './ShortcutsDialog'
import StatsDialog from './StatsDialog'
import { useEffect, useRef, useState } from 'react'
import { format } from 'date-fns'
import { toast } from '../toasts'

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
  const { view, setView, date, setDate, navigate, settings } = useCalendar()
  const { user, logout, token } = useAuth()
  const canUndo = useCalendar((s) => s.canUndo())
  const canRedo = useCalendar((s) => s.canRedo())
  const undo = useCalendar((s) => s.undo)
  const redo = useCalendar((s) => s.redo)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [newEventOpen, setNewEventOpen] = useState(false)
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [quickAddText, setQuickAddText] = useState('')
  const [moreOpen, setMoreOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [findFreeOpen, setFindFreeOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)
  const [templates, setTemplates] = useState<EventTemplate[]>([])
  const [templateEvent, setTemplateEvent] = useState<EventTemplate | null>(null)
  const [quickAddError, setQuickAddError] = useState<string | null>(null)
  const quickAddRef = useRef<HTMLInputElement>(null)
  const moreRef = useRef<HTMLDivElement>(null)
  const accountRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (): void => setNewEventOpen(true)
    window.addEventListener('calendar:new-event', handler)
    const qa = (): void => {
      setQuickAddOpen(true)
      setTimeout(() => quickAddRef.current?.focus(), 0)
    }
    window.addEventListener('calendar:quick-add', qa)
    const ff = (): void => setFindFreeOpen(true)
    window.addEventListener('calendar:find-free', ff)
    const st = (): void => setSettingsOpen(true)
    window.addEventListener('calendar:settings', st)
    return () => {
      window.removeEventListener('calendar:new-event', handler)
      window.removeEventListener('calendar:quick-add', qa)
      window.removeEventListener('calendar:find-free', ff)
      window.removeEventListener('calendar:settings', st)
    }
  }, [])

  useEffect(() => {
    const outside = (e: MouseEvent): void => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false)
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) setAccountOpen(false)
    }
    window.addEventListener('mousedown', outside)
    return () => window.removeEventListener('mousedown', outside)
  }, [])

  useEffect(() => {
    setTemplates(listTemplates())
  }, [newEventOpen, quickAddOpen])

  const runQuickAdd = async (): Promise<void> => {
    const text = quickAddText.trim()
    if (!text || !token) return
    const parsed = parseQuickAdd(text, new Date(), settings.defaultEventDuration)
    if (!parsed) {
      setQuickAddError('Could not understand that — try “Lunch tomorrow 12:30 for 1h”')
      return
    }
    try {
      const { calendars: cals } = useCalendar.getState()
      const calendarId = settings.defaultCalendarId || cals[0]?.id || ''
      if (!calendarId) {
        setQuickAddError('Create a calendar first (sidebar → + New)')
        return
      }
      const created = (await window.calendarApi.events.create(token, {
        calendarId,
        title: parsed.title,
        description: undefined,
        location: undefined,
        allDay: parsed.allDay,
        startsAt: parsed.startsAt,
        endsAt: parsed.endsAt,
        startDate: parsed.startDate,
        endDate: parsed.endDate
      })) as { id: string }
      useCalendar.getState().pushHistory({ op: 'create', eventId: created.id, after: parsed as never })
      toast(`Created “${parsed.title}”`)
      setQuickAddText('')
      setQuickAddOpen(false)
      setQuickAddError(null)
      await useCalendar.getState().refreshEvents('0000-01-01T00:00:00.000Z', '9999-12-31T23:59:59.999Z').catch(() => undefined)
    } catch (err) {
      setQuickAddError(err instanceof Error ? err.message : 'Could not create event')
    }
  }

  return (
    <div className="min-h-14 shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-wrap items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5">
      <button
        onClick={onToggleSidebar}
        className="lg:hidden p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 shrink-0"
        title="Toggle sidebar"
        aria-label="Toggle sidebar"
      >
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
          <path d="M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2z" />
        </svg>
      </button>

      <h1 className="font-medium text-gray-800 dark:text-gray-100 mr-1 text-lg">
        <svg viewBox="0 0 24 24" className="w-6 h-6 inline mr-1 text-accent" fill="currentColor">
          <path d="M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 16H5V10h14v10z" />
        </svg>
        <span className="hidden sm:inline">Calendar</span>
      </h1>

      <button
        onClick={() => setNewEventOpen(true)}
        className="flex items-center gap-1 px-2 md:px-3 py-1.5 text-sm font-medium text-white bg-accent hover:bg-accent-hover rounded-full shrink-0"
        title="New event"
        aria-label="New event"
      >
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" /></svg>
        <span className="hidden md:inline">New</span>
      </button>

      <div className="hidden lg:flex items-center shrink-0">
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
        className="px-2 sm:px-4 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 shrink-0"
        title="Today (t)"
      >
        Today
      </button>

      <input
        type="date"
        value={format(date, 'yyyy-MM-dd')}
        onChange={(e) => e.target.value && setDate(new Date(e.target.value + 'T00:00:00'))}
        title="Go to date"
        aria-label="Go to date"
        className="hidden xl:block px-2 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-accent shrink-0"
      />

      <div className="flex items-center gap-1 shrink-0">
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

      <h2 className="flex-1 min-w-0 text-base sm:text-lg font-normal text-gray-800 dark:text-gray-100 truncate">{headerTitle(view, date, settings.firstDayOfWeek)}</h2>

      <div className="hidden md:flex min-w-0">
        <SearchBox />
      </div>

      <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5 shrink-0">
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
        <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus-within:ring-2 focus-within:ring-accent w-56">
          <span className="text-sm leading-none">⚡</span>
          <input
            ref={quickAddRef}
            value={quickAddText}
            onChange={(e) => {
              setQuickAddText(e.target.value)
              setQuickAddError(null)
            }}
            onFocus={() => setQuickAddOpen(true)}
            onBlur={() => setTimeout(() => setQuickAddOpen(false), 200)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void runQuickAdd()
              if (e.key === 'Escape') setQuickAddOpen(false)
            }}
            placeholder="Quick add… ( q )"
            className="flex-1 bg-transparent outline-none text-sm text-gray-800 dark:text-gray-100 placeholder:text-gray-400"
            aria-label="Quick add event"
          />
          {quickAddError && (
            <span className="text-[10px] text-red-500 whitespace-nowrap" title={quickAddError}>⚠</span>
          )}
        </div>
        {quickAddOpen && quickAddText && (
          <p className="absolute top-14 right-40 hidden lg:block text-xs bg-amber-50 dark:bg-amber-900/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 px-3 py-1.5 rounded-lg shadow-lg">
            {quickAddError ?? 'Press Enter to create the event'}
          </p>
        )}

        <div className="relative" ref={moreRef}>
          <button
            onClick={() => setMoreOpen((o) => !o)}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
            title="More (⋯)"
            aria-label="More actions"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
              <path d="M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
            </svg>
          </button>
          {moreOpen && (
            <div className="absolute right-0 top-10 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl py-1 w-56">
              <button
                onClick={() => {
                  setMoreOpen(false)
                  setFindFreeOpen(true)
                }}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Find free time
              </button>
              <div className="px-2 pt-1">
                <p className="px-2 pb-1 text-[10px] uppercase tracking-wider text-gray-400">Templates</p>
                {templates.length === 0 && <p className="px-2 pb-1 text-xs text-gray-400">None yet — save one from the event dialog</p>}
                {templates.map((t) => (
                  <div key={t.name} className="flex items-center">
                    <button
                      onClick={() => {
                        setMoreOpen(false)
                        setTemplateEvent(t)
                      }}
                      className="flex-1 text-left px-2 py-1.5 text-sm rounded-lg text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 truncate"
                      title={t.name}
                    >
                      {t.name}
                    </button>
                    <button
                      onClick={() => {
                        removeTemplate(t.name)
                        setTemplates(listTemplates())
                        toast('Template removed')
                      }}
                      className="p-1 text-xs text-gray-400 hover:text-red-500"
                      aria-label={`Remove template ${t.name}`}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <div className="border-t border-gray-100 dark:border-gray-700 my-1" />
              <button
                onClick={() => {
                  setMoreOpen(false)
                  const { events, calendars } = useCalendar.getState()
                  if (events.length === 0) {
                    toast('Nothing to export yet', 'info')
                    return
                  }
                  const from = events[0]!.start.slice(0, 10)
                  const to = events[events.length - 1]!.start.slice(0, 10)
                  exportEventsCsv(events.map((o) => o.event), calendars, `${from}_${to}`)
                  toast('CSV exported')
                }}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Export CSV
              </button>
              <button
                onClick={() => {
                  setMoreOpen(false)
                  const { events, calendars } = useCalendar.getState()
                  if (events.length === 0) {
                    toast('Nothing to print yet', 'info')
                    return
                  }
                  printEvents(events.map((o) => o.event), calendars, headerTitle(view, date, settings.firstDayOfWeek))
                }}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Print / PDF…
              </button>
              <button
                onClick={() => {
                  setMoreOpen(false)
                  setStatsOpen(true)
                }}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Stats
              </button>
              <button
                onClick={() => {
                  setMoreOpen(false)
                  setShortcutsOpen(true)
                }}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Keyboard shortcuts
              </button>
            </div>
          )}
        </div>
        <div className="relative" ref={accountRef}>
          <button
            onClick={() => setAccountOpen((o) => !o)}
            className="w-8 h-8 rounded-full bg-accent text-white text-sm font-medium flex items-center justify-center hover:opacity-90"
            title="Account menu"
            aria-label="Account menu"
          >
            {user?.name?.[0]?.toUpperCase() ?? '?'}
          </button>
          {accountOpen && (
            <div className="absolute right-0 top-10 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 w-44">
              <p className="px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 truncate">{user?.email}</p>
              <div className="border-t border-gray-100 dark:border-gray-700 my-1" />
              <button
                onClick={() => {
                  setAccountOpen(false)
                  setSettingsOpen(true)
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4 text-gray-400" fill="currentColor">
                  <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.48.48 0 0 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.61 3.61 0 0 1 8.4 12c0-1.98 1.62-3.6 3.6-3.6s3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
                </svg>
                Settings
              </button>
              <button
                onClick={() => void logout()}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                  <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5v-1l-5-2zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z" />
                </svg>
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>

      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
      {newEventOpen && <EventDialog defaultDate={new Date()} onClose={() => setNewEventOpen(false)} />}
      {findFreeOpen && <FindFreeTimeDialog onClose={() => setFindFreeOpen(false)} />}
      {shortcutsOpen && <ShortcutsDialog onClose={() => setShortcutsOpen(false)} />}
      {statsOpen && <StatsDialog onClose={() => setStatsOpen(false)} />}
      {templateEvent && (
        <EventDialog
          template={templateEvent.input}
          defaultDate={new Date()}
          onClose={() => setTemplateEvent(null)}
        />
      )}
    </div>
  )
}
