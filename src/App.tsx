import { useEffect } from 'react'
import { useAuth, useCalendar } from './store'
import LoginScreen from './components/LoginScreen'
import AppShell from './components/AppShell'
import Toasts from './components/Toasts'

export default function App(): React.JSX.Element {
  const { booting, user, boot } = useAuth()

  useEffect(() => {
    void boot()
  }, [boot])

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)
      const mod = e.ctrlKey || e.metaKey
      const cal = useCalendar.getState()
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
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  if (booting) {
    return (
      <div className="flex h-full items-center justify-center text-gray-500">
        <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!user) return <LoginScreen />
  return (
    <>
      <AppShell />
      <Toasts />
    </>
  )
}
