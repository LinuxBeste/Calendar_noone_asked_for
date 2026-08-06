import { useEffect, useState } from 'react'
import { useCalendar, useAuth, DEFAULT_SETTINGS } from '../store'
import Sidebar from './Sidebar'
import Toolbar from './Toolbar'
import MonthView from '../views/MonthView'
import WeekView from '../views/WeekView'
import YearView from '../views/YearView'
import AgendaView from '../views/AgendaView'

const NARROW_QUERY = '(max-width: 1023px)'

export default function AppShell(): React.JSX.Element {
  const { view, date, refreshCalendars, settings, setSettings, calendars } = useCalendar()
  const { token } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW_QUERY).matches)

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
    const apply = (): void => {
      const dark = settings.darkMode === 'dark' || (settings.darkMode === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)
      document.documentElement.classList.toggle('dark', dark)
    }
    apply()
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [settings.darkMode])

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900">
      <Toolbar onToggleSidebar={() => setSidebarOpen((o) => !o)} />
      {token && calendars.length === 0 && (
        <div className="h-0.5 bg-gray-100 dark:bg-gray-700 overflow-hidden shrink-0">
          <div className="h-full w-1/3 bg-blue-600 animate-[loading-slide_1s_ease-in-out_infinite]" />
        </div>
      )}
      <div className="flex-1 flex overflow-hidden">
        <Sidebar open={sidebarOpen} narrow={narrow} onClose={() => setSidebarOpen(false)} />
        <main className="flex-1 flex overflow-hidden">
          {view === 'month' && <MonthView date={date} />}
          {view === 'week' && <WeekView date={date} days={7} />}
          {view === 'day' && <WeekView date={date} days={1} />}
          {view === 'year' && <YearView date={date} />}
          {view === 'agenda' && <AgendaView date={date} days={14} />}
        </main>
      </div>
    </div>
  )
}
