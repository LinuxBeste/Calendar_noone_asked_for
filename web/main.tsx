import React from 'react'
import ReactDOM from 'react-dom/client'
import { useEffect, useState } from 'react'
import App from '../src/App'
import { webApi, startWebReminderEngine, getApiUrl, setApiUrl, isReachable } from './api'
import { nativeNotificationsAvailable } from '../src/lib/platform'
import { startNativeReminderEngine } from '../src/lib/notifications'
import { createDemoApi } from './demo-api'
import { DEMO_TOKEN } from './demo-data'
import '../src/index.css'

if (__DEMO__) {
  window.calendarApi = createDemoApi()
  if (!localStorage.getItem('calendar.token')) localStorage.setItem('calendar.token', DEMO_TOKEN)
  localStorage.setItem('calendar.setupDone', '1')
} else {
  window.calendarApi = webApi
}

if ('serviceWorker' in navigator && location.protocol.startsWith('https')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined)
  })
}

if (!__DEMO__ && !nativeNotificationsAvailable() && 'Notification' in window && Notification.permission === 'default') {
  void Notification.requestPermission()
}

function ConnectionGate({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [reachable, setReachable] = useState<boolean | null>(null)
  const [url, setUrl] = useState(getApiUrl())
  const [error, setError] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)

  const probe = async (): Promise<void> => {
    setError(null)
    setReachable(await isReachable())
  }

  const connect = async (): Promise<void> => {
    const target = url.trim()
    if (!/^https?:\/\//i.test(target)) {
      setError('Enter a full URL starting with http:// or https:// (e.g. http://10.0.2.2:3001)')
      return
    }
    setError(null)
    setConnecting(true)
    setApiUrl(target)
    try {
      const ok = await isReachable()
      if (ok) setReachable(true)
      else setError(`Could not connect to ${target}. Make sure the server is running and reachable from this device.`)
    } catch {
      setError(`Could not connect to ${target}. Make sure the server is running and reachable from this device.`)
    } finally {
      setConnecting(false)
    }
  }

  useEffect(() => {
    void probe()
  }, [])

  if (reachable === null) {
    return (
      <div className="flex h-full items-center justify-center text-gray-500">
        <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (reachable) return <>{children}</>

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-[420px] max-w-full p-6 space-y-4">
        <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">Backend unreachable</h2>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Could not reach the calendar backend. Enter the server URL (e.g. <code className="text-xs">http://10.0.2.2:3001</code> on
          the Android emulator, or your computer's LAN IP from a phone).
        </p>
        <input
          value={url}
          onChange={(e) => {
            setUrl(e.target.value)
            setError(null)
          }}
          onKeyDown={(e) => e.key === 'Enter' && void connect()}
          placeholder="http://localhost:3001"
          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
        />
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <div className="flex items-center justify-between gap-2">
          {connecting ? (
            <span className="text-xs text-gray-400">Connecting…</span>
          ) : (
            <span className="text-xs text-gray-400 dark:text-gray-500">v{__APP_VERSION__}</span>
          )}
          <div className="flex justify-end">
            <button
              onClick={() => void connect()}
              disabled={connecting}
              className="px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
            >
              {connecting ? 'Connecting…' : 'Connect'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {__DEMO__ ? (
      <App />
    ) : (
      <ConnectionGate>
        <App />
      </ConnectionGate>
    )}
  </React.StrictMode>
)

if (__DEMO__) {
  /* demo mode: no reminder engines, data is local */
} else if (nativeNotificationsAvailable()) startNativeReminderEngine()
else startWebReminderEngine()
