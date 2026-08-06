import { useState, useEffect } from 'react'
import { useAuth, useCalendar } from '../store'
import MiniCalendar from './MiniCalendar'
import type { Calendar } from '@shared/types'

export default function Sidebar(): React.JSX.Element {
  const { calendars, visibleCalendars, toggleCalendar, settings } = useCalendar()
  const { token, user } = useAuth()
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#1a73e8')
  const [sharing, setSharing] = useState<Calendar | null>(null)
  const [transfer, setTransfer] = useState(false)

  const createCalendar = async (): Promise<void> => {
    if (!newName.trim() || !token) return
    await window.calendarApi.calendars.create(token, { name: newName.trim(), color: newColor })
    setNewName('')
    setAdding(false)
    await useCalendar.getState().refreshCalendars()
  }

  return (
    <div className="w-60 shrink-0 flex flex-col border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-y-auto">
      <button
        onClick={() => setAdding(true)}
        className="mx-3 mt-3 flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium text-blue-600 dark:text-blue-400 border border-gray-300 dark:border-gray-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
      >
        <span className="text-lg leading-none">+</span> Create
      </button>

      {adding && (
        <div className="mx-3 mt-2 p-3 rounded-lg border border-gray-200 dark:border-gray-700 space-y-2">
          <input
            autoFocus
            placeholder="Calendar name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void createCalendar()}
            className="w-full px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          />
          <div className="flex items-center gap-2">
            <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} className="w-7 h-7 rounded cursor-pointer" />
            <button onClick={() => void createCalendar()} className="px-3 py-1 text-xs rounded bg-blue-600 text-white">
              Add
            </button>
            <button onClick={() => setAdding(false)} className="px-3 py-1 text-xs rounded hover:bg-gray-200 dark:hover:bg-gray-700">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="mt-2">
        <MiniCalendar weekStartsOn={settings.firstDayOfWeek} />
      </div>

      <div className="mt-2 px-4">
        <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">My calendars</h3>
        <div className="space-y-1">
          {calendars.map((c) => (
            <div key={c.id} className="group flex items-center gap-2 px-1 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
              <input
                type="checkbox"
                checked={visibleCalendars[c.id] ?? true}
                onChange={() => toggleCalendar(c.id)}
                className="accent-blue-600"
              />
              <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: c.color }} />
              <span className="flex-1 text-sm truncate text-gray-700 dark:text-gray-200">{c.name}</span>
              {c.role === 'owner' && (
                <button
                  onClick={() => setSharing(c)}
                  className="opacity-0 group-hover:opacity-100 text-xs text-gray-400 hover:text-blue-600"
                  title="Share calendar"
                >
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor">
                    <path d="M12 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 12c-3.3 0-8 1.7-8 5v1h16v-1c0-3.3-4.7-5-8-5z" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
        {user && (
          <p className="mt-2 text-[10px] text-gray-400 dark:text-gray-500">Signed in as {user.name}</p>
        )}
        <button
          onClick={() => setTransfer(true)}
          className="mt-3 flex items-center gap-2 px-2 py-1.5 w-full text-xs text-gray-500 dark:text-gray-400 hover:text-blue-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
        >
          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor">
            <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
          </svg>
          Import / Export
        </button>
      </div>

      {sharing && <ShareDialog calendar={sharing} onClose={() => setSharing(null)} />}
      {transfer && <TransferDialog onClose={() => setTransfer(false)} />}
    </div>
  )
}

function TransferDialog({ onClose }: { onClose: () => void }): React.JSX.Element {
  const { token } = useAuth()
  const { calendars, refreshCalendars, refreshEvents } = useCalendar()
  const [target, setTarget] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!target && calendars.length > 0) setTarget(calendars[0]!.id)
  }, [calendars, target])

  const run = async (fn: () => Promise<unknown>, label: string): Promise<void> => {
    if (!token) return
    setBusy(label)
    setMessage(null)
    try {
      const res = await fn()
      await useCalendar.getState().refreshCalendars()
      await useCalendar.getState().refreshEvents('0000-01-01T00:00:00.000Z', '9999-12-31T23:59:59.999Z').catch(() => undefined)
      const r = res as { canceled?: boolean; count?: number; filePath?: string }
      setMessage(
        r?.canceled
          ? 'Canceled.'
          : typeof r?.count === 'number'
            ? `Imported ${r.count} event${r.count === 1 ? '' : 's'}.`
            : r?.filePath
              ? `Exported to ${r.filePath}`
              : 'Done.'
      )
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Operation failed')
    } finally {
      setBusy(null)
    }
  }

  const btnCls =
    'px-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 w-full'

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-[460px] max-w-[92vw] p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">Import / Export</h2>

        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">Import into calendar</p>
          <select value={target} onChange={(e) => setTarget(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm">
            {calendars.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button className={btnCls} disabled={busy !== null} onClick={() => void run(() => window.calendarApi.ical.importICal(token!, target), 'import-ical')}>
            {busy === 'import-ical' ? 'Importing…' : 'Import .ics'}
          </button>
          <button className={btnCls} disabled={busy !== null} onClick={() => void run(() => window.calendarApi.ical.importJson(token!), 'import-json')}>
            {busy === 'import-json' ? 'Importing…' : 'Import backup'}
          </button>
          <button className={btnCls} disabled={busy !== null} onClick={() => void run(() => window.calendarApi.ical.exportICal(token!), 'export-ical')}>
            {busy === 'export-ical' ? 'Exporting…' : 'Export .ics'}
          </button>
          <button className={btnCls} disabled={busy !== null} onClick={() => void run(() => window.calendarApi.ical.exportJson(token!), 'export-json')}>
            {busy === 'export-json' ? 'Exporting…' : 'Export backup'}
          </button>
        </div>

        {message && <p className="text-sm text-gray-600 dark:text-gray-300 break-all">{message}</p>}

        <div className="flex justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

function ShareDialog({ calendar, onClose }: { calendar: Calendar; onClose: () => void }): React.JSX.Element {
  const { token } = useAuth()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'viewer' | 'editor'>('viewer')
  const [shares, setShares] = useState<{ userId: string; role: string; email?: string }[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = async (): Promise<void> => {
    if (!token) return
    setShares((await window.calendarApi.calendars.shares(token, calendar.id)) as typeof shares)
  }

  useEffect(() => {
    void load()
  }, [])

  const share = async (): Promise<void> => {
    if (!token) return
    try {
      await window.calendarApi.calendars.share(token, calendar.id, { email, role })
      setEmail('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sharing failed')
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 w-96 max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-medium text-gray-800 dark:text-gray-100 mb-1">Share “{calendar.name}”</h3>
        <p className="text-sm text-gray-500 mb-4">People can view events on this calendar.</p>

        <div className="flex gap-2 mb-3">
          <input
            type="email"
            placeholder="Email of user"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as 'viewer' | 'editor')}
            className="px-2 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          >
            <option value="viewer">Viewer</option>
            <option value="editor">Editor</option>
          </select>
          <button onClick={() => void share()} className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white">
            Share
          </button>
        </div>
        {error && <p className="text-sm text-red-600 mb-2">{error}</p>}

        {shares.length > 0 && (
          <ul className="space-y-1 mb-3">
            {shares.map((s) => (
              <li key={s.userId} className="flex items-center justify-between text-sm text-gray-700 dark:text-gray-200">
                <span>{s.email}</span>
                <button
                  onClick={() => token && window.calendarApi.calendars.unshare(token, calendar.id, s.userId).then(load)}
                  className="text-gray-400 hover:text-red-600 text-xs"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        <button onClick={onClose} className="w-full py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm">
          Close
        </button>
      </div>
    </div>
  )
}
