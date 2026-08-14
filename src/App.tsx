import { useEffect, useState } from 'react'
import { useAuth, useCalendar } from './store'
import { onAndroidBack, minimizeApp } from './lib/platform'
import { bindSettingsProvider } from './lib/notifications'
import './lib/plugin-smart-tags'
import './lib/plugin-daily-quote'
import { toast } from './toasts'
import { logError } from './utils/errors'
import { compareVersions, fetchLatestRelease, isInstalled } from './updater'
import LoginScreen from './components/LoginScreen'
import AppShell from './components/AppShell'
import Toasts from './components/Toasts'
import OfflineBanner from './components/OfflineBanner'
import ErrorBoundary from './components/ErrorBoundary'
import CommandPalette from './components/CommandPalette'
import ShortcutsDialog from './components/ShortcutsDialog'
import SetupDialog from './components/SetupDialog'
import TourOverlay from './components/TourOverlay'

bindSettingsProvider(() => useCalendar.getState().settings)

export default function App(): React.JSX.Element {
  const { booting, user, boot } = useAuth()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [setupOpen, setSetupOpen] = useState(false)
  const [tourOpen, setTourOpen] = useState(() => __DEMO__ && localStorage.getItem('calendar.tourDone') !== '1')

  useEffect(() => {
    let lastErrorToast = 0
    const report = (msg: string): void => {
      const now = Date.now()
      if (now - lastErrorToast < 8000) return
      lastErrorToast = now
      toast(msg, 'error')
    }
    const onError = (e: ErrorEvent): void => {
      logError('uncaught-error', e.error ?? e.message)
      report('Something went wrong — the app tried to recover.')
    }
    const onRejection = (e: PromiseRejectionEvent): void => {
      logError('unhandled-rejection', e.reason)
      report(typeof e.reason === 'string' ? e.reason : 'A background action failed — the app stays usable.')
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])

  useEffect(() => {
    void boot()
  }, [boot])

  useEffect(() => {
    let dispose: (() => void) | null = null
    void onAndroidBack(async () => {
      const overlay = document.querySelector<HTMLElement>('.fixed.inset-0')
      if (overlay) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
        await new Promise((r) => setTimeout(r, 120))
        if (document.querySelector('.fixed.inset-0') === overlay) overlay.click()
        return
      }
      const wentBack = useCalendar.getState().backView()
      if (!wentBack) await minimizeApp()
    }).then((d) => {
      dispose = d
    })
    return () => dispose?.()
  }, [])

  useEffect(() => {
    if (user && localStorage.getItem('calendar.setupDone') !== '1') setSetupOpen(true)
  }, [user])

  useEffect(() => {
    if (__DEMO__ || !isInstalled()) return
    const last = Number(localStorage.getItem('calendar.updateCheckAt') ?? 0)
    if (Date.now() - last < 24 * 60 * 60 * 1000) return
    const t = window.setTimeout(() => {
      localStorage.setItem('calendar.updateCheckAt', String(Date.now()))
      void fetchLatestRelease()
        .then((info) => {
          if (compareVersions(info.version, __APP_VERSION__) > 0) {
            toast(`Update available: v${info.version} — open Settings to install`, 'info')
          }
        })
        .catch(() => undefined)
    }, 15_000)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)
      const mod = e.ctrlKey || e.metaKey
      const cal = useCalendar.getState()
      if (!cal.settings.enableKeyboardShortcuts) return
      if (mod && e.key.toLowerCase() === 'k' && cal.settings.enableCommandPalette) {
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
          if (cal.view !== cal.settings.defaultView) cal.setView(cal.settings.defaultView)
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
        case 's':
          cal.setView('split')
          break
        case 'j':
          cal.navigate(1)
          break
        case 'k':
          cal.navigate(-1)
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

  if (!user) return (
    <>
      <OfflineBanner />
      <LoginScreen />
    </>
  )
  return (
    <ErrorBoundary>
      <OfflineBanner />
      <AppShell />
      <Toasts />
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
      {helpOpen && <ShortcutsDialog onClose={() => setHelpOpen(false)} />}
      {setupOpen && <SetupDialog onClose={() => setSetupOpen(false)} />}
      {tourOpen && (
        <TourOverlay
          onClose={() => {
            localStorage.setItem('calendar.tourDone', '1')
            setTourOpen(false)
          }}
        />
      )}
    </ErrorBoundary>
  )
}
