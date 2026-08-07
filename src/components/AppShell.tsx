import { useEffect, useState } from 'react'
import { useCalendar, useAuth, DEFAULT_SETTINGS } from '../store'
import { applyTheme } from '../utils/theme'
import NavRail from './NavRail'
import Sidebar from './Sidebar'
import Toolbar from './Toolbar'
import MonthView from '../views/MonthView'
import WeekView from '../views/WeekView'
import YearView from '../views/YearView'
import AgendaView from '../views/AgendaView'
import { toast } from '../toasts'

const NARROW_QUERY = '(max-width: 1023px)'

function readUrlState(): void {
  try {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const view = params.get('view') as ReturnType<typeof useCalendar.getState>['view'] | null
    const date = params.get('date')
    const s = useCalendar.getState()
    if (view && ['day', 'week', 'month', 'year', 'agenda'].includes(view)) s.setView(view)
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) s.setDate(new Date(date + 'T00:00:00'))
  } catch {
    // ignore malformed URLs
  }
}

function writeUrlState(): void {
  const { view, date } = useCalendar.getState()
  const d = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  const next = `#view=${view}&date=${d}`
  if (window.location.hash !== next) window.history.replaceState(null, '', next)
}

export default function AppShell(): React.JSX.Element {
  const { view, date, refreshCalendars, settings, setSettings, calendars } = useCalendar()
  const { token } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW_QUERY).matches)
  const [dragOver, setDragOver] = useState(false)

  useEffect(() => {
    readUrlState()
    const t = setInterval(writeUrlState, 2000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    writeUrlState()
  }, [view, date])

  useEffect(() => {
    const mq = window.matchMedia(NARROW_QUERY)
    const onChange = (e: MediaQueryListEvent): void => {
      setNarrow(e.matches)
      setSidebarOpen(!e.matches)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    void refreshCalendars()
  }, [token, refreshCalendars])

  useEffect(() => {
    const refresh = (): void => {
      void useCalendar.getState().refreshVisible()
    }
    window.addEventListener('focus', refresh)
    const t = setInterval(refresh, 60_000)
    return () => {
      window.removeEventListener('focus', refresh)
      clearInterval(t)
    }
  }, [])

  useEffect(() => {
    if (!token) return
    void (async () => {
      const loaded: Record<string, unknown> = {}
      for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof typeof DEFAULT_SETTINGS)[]) {
        const value = await window.calendarApi.settings.get(token, key)
        if (value !== undefined) loaded[key] = value
      }
      if (Object.keys(loaded).length > 0) setSettings(loaded as Partial<typeof DEFAULT_SETTINGS>)
    })()
  }, [token, setSettings])

  useEffect(() => {
    applyTheme(settings)
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (): void => applyTheme(settings)
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [settings.darkMode, settings.accentColor])

  useEffect(() => {
    if (!token) return
    const unsub = window.calendarApi.updates.subscribe((raw) => {
      try {
        const msg = JSON.parse(raw) as { type?: string }
        if (msg.type === 'events') {
          void useCalendar.getState().refreshVisible().catch(() => undefined)
          void useCalendar.getState().refreshTrash()
        } else if (msg.type === 'calendars') {
          void useCalendar
            .getState()
            .refreshCalendars()
            .then(() => useCalendar.getState().refreshVisible())
            .catch(() => undefined)
        }
      } catch {
        // ignore malformed messages
      }
    })
    return unsub
  }, [token])

  useEffect(() => {
    if (!token) return
    const onDragOver = (e: DragEvent): void => {
      if (e.dataTransfer?.types.includes('Files')) {
        e.preventDefault()
        setDragOver(true)
      }
    }
    const onDragLeave = (): void => setDragOver(false)
    const onDrop = (e: DragEvent): void => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer?.files?.[0]
      if (!file || !/\.ics$/i.test(file.name)) {
        toast('Drop a .ics file to import events', 'info')
        return
      }
      void (async () => {
        try {
          const content = await file.text()
          const s = useCalendar.getState()
          const target = s.settings.defaultCalendarId || s.calendars[0]?.id || ''
          const count = (await window.calendarApi.ical.importContent(token, target, content)) as number
          toast(`Imported ${count} event${count === 1 ? '' : 's'} from ${file.name}`)
          await useCalendar.getState().refreshEvents('0000-01-01T00:00:00.000Z', '9999-12-31T23:59:59.999Z').catch(() => undefined)
        } catch (err) {
          toast(err instanceof Error ? err.message : 'Import failed', 'error')
        }
      })()
    }
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [token])

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900">
      <Toolbar onToggleSidebar={() => setSidebarOpen((o) => !o)} />
      {dragOver && (
        <div className="pointer-events-none fixed inset-0 z-[80] bg-accent/20 border-4 border-dashed border-accent flex items-center justify-center">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl px-8 py-6 text-center">
            <p className="text-2xl mb-1">📅</p>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Drop the .ics file to import its events</p>
          </div>
        </div>
      )}
      {token && calendars.length === 0 && (
        <div className="h-0.5 bg-gray-100 dark:bg-gray-700 overflow-hidden shrink-0">
          <div className="h-full w-1/3 bg-accent animate-[loading-slide_1s_ease-in-out_infinite]" />
        </div>
      )}
      <div className="flex-1 flex overflow-hidden">
        <NavRail />
        <Sidebar open={sidebarOpen} narrow={narrow} onClose={() => setSidebarOpen(false)} />
        <main className="flex-1 flex min-w-0 overflow-hidden">
          {view === 'month' && <MonthView date={date} />}
          {view === 'week' && <WeekView date={date} days={7} />}
          {view === 'day' && <WeekView date={date} days={1} />}
          {view === 'year' && <YearView date={date} />}
          {view === 'agenda' && <AgendaView date={date} days={settings.agendaRangeDays} />}
        </main>
      </div>
    </div>
  )
}
