import { useEffect } from 'react'
import { useCalendar, useAuth } from '../store'
import Sidebar from './Sidebar'
import Toolbar from './Toolbar'
import MonthView from '../views/MonthView'
import WeekView from '../views/WeekView'
import YearView from '../views/YearView'
import AgendaView from '../views/AgendaView'

export default function AppShell(): React.JSX.Element {
  const { view, date, refreshCalendars, settings, setSettings } = useCalendar()
  const { token } = useAuth()

  useEffect(() => {
    void refreshCalendars()
  }, [token, refreshCalendars])

  useEffect(() => {
    if (!token) return
    void (async () => {
      const firstDay = await window.calendarApi.settings.get(token, 'firstDayOfWeek')
      if (firstDay !== undefined) setSettings({ firstDayOfWeek: firstDay as 0 | 1 })
      const timeFormat = await window.calendarApi.settings.get(token, 'timeFormat')
      if (timeFormat !== undefined) setSettings({ timeFormat: timeFormat as '24h' | '12h' })
      const darkMode = await window.calendarApi.settings.get(token, 'darkMode')
      if (darkMode !== undefined) setSettings({ darkMode: darkMode as 'light' | 'dark' | 'auto' })
    })()
  }, [token, setSettings])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', settings.darkMode === 'dark')
  }, [settings.darkMode])

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900">
      <Toolbar />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar />
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
