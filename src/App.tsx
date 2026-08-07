import { useEffect, useState } from 'react'
import { useAuth, useCalendar } from './store'
import LoginScreen from './components/LoginScreen'
import AppShell from './components/AppShell'
import Toasts from './components/Toasts'
import ErrorBoundary from './components/ErrorBoundary'
import CommandPalette from './components/CommandPalette'
import ShortcutsDialog from './components/ShortcutsDialog'
import SetupDialog from './components/SetupDialog'

export default function App(): React.JSX.Element {
  const { booting, user, boot } = useAuth()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [setupOpen, setSetupOpen] = useState(false)

  useEffect(() => {
    void boot()
  }, [boot])

  useEffect(() => {
    if (user && localStorage.getItem('calendar.setupDone') !== '1') setSetupOpen(true)
  }, [user])

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)
      const mod = e.ctrlKey || e.metaKey
      const cal = useCalendar.getState()
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(true)
        return
      }
      if (mod && e.key.toLowerCase() === 'z' && !typing) {
        e.preventDefault()
        if (e.shiftKey) void cal.redo()
        else void cal.undo()
        return
      }
      if (mod && e.key.toLowerCase() === 'y' && !typing) {
        e.preventDefault()
        void cal.redo()
        return
      }
      if (typing || mod || e.altKey) return
      switch (e.key.toLowerCase()) {
        case '?':
          setHelpOpen(true)
          break
        case 't':
          cal.setDate(new Date())
          break
        case 'd':
          cal.setView('day')
          break
        case 'w':
          cal.setView('week')
          break
        case 'm':
          cal.setView('month')
          break
        case 'y':
          cal.setView('year')
          break
        case 'a':
          cal.setView('agenda')
          break
        case 'n':
          window.dispatchEvent(new CustomEvent('calendar:new-event'))
          break
        case 'q':
          window.dispatchEvent(new CustomEvent('calendar:quick-add'))
          break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  if (booting) {
    return (
      <div className="flex h-full items-center justify-center text-gray-500">
        <div className="animate-spin h-8 w-8 border-2 border-accent border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!user) return <LoginScreen />
  return (
    <ErrorBoundary>
      <AppShell />
      <Toasts />
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
      {helpOpen && <ShortcutsDialog onClose={() => setHelpOpen(false)} />}
      {setupOpen && <SetupDialog onClose={() => setSetupOpen(false)} />}
    </ErrorBoundary>
  )
}
