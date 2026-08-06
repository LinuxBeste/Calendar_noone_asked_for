import React from 'react'
import ReactDOM from 'react-dom/client'
import { useEffect, useState } from 'react'
import App from '../src/App'
import { webApi, startWebReminderEngine, getApiUrl, setApiUrl, isReachable } from './api'
import '../src/index.css'

if ('Notification' in window && Notification.permission === 'default') {
  void Notification.requestPermission()
}

function ConnectionGate({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [reachable, setReachable] = useState<boolean | null>(null)
  const [url, setUrl] = useState(getApiUrl())

  const probe = async (): Promise<void> => {
    setReachable(await isReachable())
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
          onChange={(e) => setUrl(e.target.value)}
          placeholder="http://localhost:3001"
          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
        />
        <div className="flex justify-end gap-2">
          <button
            onClick={() => {
              setApiUrl(url)
              void probe()
            }}
            className="px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white"
          >
            Connect
          </button>
        </div>
      </div>
    </div>
  )
}

window.calendarApi = webApi

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConnectionGate>
      <App />
    </ConnectionGate>
  </React.StrictMode>
)

startWebReminderEngine()
