import { useState, useEffect } from 'react'
import QRCode from 'qrcode'
import { useAuth, useCalendar } from '../store'
import { toast, toastError } from '../toasts'
import { nativeShare } from '../lib/platform'
import { toErrorMessage } from '../utils/errors'
import MiniCalendar from './MiniCalendar'
import { enabledWidgets, usePlugins } from '../lib/plugins'
import ContextMenu from './ContextMenu'
import ConfirmDialog from './ConfirmDialog'
import TrashDialog from './TrashDialog'
import type { Calendar, ICalFeed } from '@shared/types'

const API_BASE = (): string => localStorage.getItem('calendar.apiUrl') ?? 'http://localhost:3001'

function extractToken(input: string): string | null {
  const match = input.trim().match(/public\/([A-Za-z0-9_-]+)/)
  return match ? match[1]! : input.trim().match(/^[A-Za-z0-9_-]{10,}$/) ? input.trim() : null
}

interface SidebarProps {
  open: boolean
  narrow: boolean
  onClose: () => void
}

export default function Sidebar({ open, narrow, onClose }: SidebarProps): React.JSX.Element | null {
  const { calendars, visibleCalendars, toggleCalendar, settings, trash, publicCalendars, addPublicCalendar, removePublicCalendar } = useCalendar()
  const { token, user } = useAuth()
  const enabledPlugins = usePlugins((s) => s.enabled)
  const widgets = enabledWidgets()
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#1a73e8')
  const [sharing, setSharing] = useState<Calendar | null>(null)
  const [linkFor, setLinkFor] = useState<Calendar | null>(null)
  const [transfer, setTransfer] = useState(false)
  const [trashOpen, setTrashOpen] = useState(false)
  const [menu, setMenu] = useState<{ x: number; y: number; calendar: Calendar } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Calendar | null>(null)
  const [feeds, setFeeds] = useState<ICalFeed[]>([])
  const [addingFeed, setAddingFeed] = useState(false)
  const [feedUrl, setFeedUrl] = useState('')
  const [feedTarget, setFeedTarget] = useState('')
  const [addingPublic, setAddingPublic] = useState(false)
  const [publicUrl, setPublicUrl] = useState('')
  const [busyFeed, setBusyFeed] = useState<string | null>(null)

  const loadFeeds = (): void => {
    if (!token) return
    window.calendarApi.feeds.list(token).then((f) => setFeeds((f as ICalFeed[]) ?? [])).catch(() => undefined)
  }

  useEffect(() => {
    void useCalendar.getState().refreshTrash()
    const openTrash = (): void => setTrashOpen(true)
    window.addEventListener('calendar:trash', openTrash)
    loadFeeds()
    return () => window.removeEventListener('calendar:trash', openTrash)
  }, [])

  useEffect(() => {
    if (!(narrow && open)) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [narrow, open, onClose])

  const addFeed = async (): Promise<void> => {
    if (!token || !feedUrl.trim() || !feedTarget) return
    setBusyFeed('add')
    try {
      await window.calendarApi.feeds.create(token, { calendarId: feedTarget, url: feedUrl.trim() })
      setFeedUrl('')
      setAddingFeed(false)
      loadFeeds()
      toast('Feed subscribed — events will sync automatically')
    } catch (err) {
      toastError(err)
    } finally {
      setBusyFeed(null)
    }
  }

  const syncFeed = async (id: string): Promise<void> => {
    if (!token) return
    setBusyFeed(id)
    try {
      const res = (await window.calendarApi.feeds.sync(token, id)) as { created: number; updated: number }
      toast(`Feed synced (${res.created} new, ${res.updated} updated)`)
      loadFeeds()
      await useCalendar.getState().refreshVisible()
    } catch (err) {
      toastError(err)
      loadFeeds()
    } finally {
      setBusyFeed(null)
    }
  }

  const removeFeed = async (id: string): Promise<void> => {
    if (!token) return
    await window.calendarApi.feeds.remove(token, id)
    loadFeeds()
    await useCalendar.getState().refreshVisible()
    toast('Feed removed')
  }

  const addPublic = async (): Promise<void> => {
    const token2 = extractToken(publicUrl)
    if (!token2) {
      toast('Enter a share link or token', 'error')
      return
    }
    try {
      const res = await fetch(`${API_BASE()}/public/${token2}`)
      if (!res.ok) throw new Error('Link not found or revoked')
      const data = (await res.json()) as { calendar: { name: string; color: string } }
      addPublicCalendar({ token: token2, name: data.calendar.name, color: data.calendar.color })
      setPublicUrl('')
      setAddingPublic(false)
      toast(`Subscribed to “${data.calendar.name}”`)
    } catch (err) {
      toastError(err)
    }
  }

  const deleteCalendar = async (): Promise<void> => {
    if (!token || !confirmDelete) return
    await window.calendarApi.calendars.delete(token, confirmDelete.id)
    const cal = confirmDelete
    setConfirmDelete(null)
    await useCalendar.getState().refreshCalendars()
    await useCalendar.getState().refreshVisible()
    toast(`Calendar “${cal.name}” deleted`)
  }

  const createCalendar = async (): Promise<void> => {
    if (!newName.trim() || !token) return
    await window.calendarApi.calendars.create(token, { name: newName.trim(), color: newColor })
    setNewName('')
    setAdding(false)
    await useCalendar.getState().refreshCalendars()
  }

  if (narrow && !open) return null

  const content = (
    <div className={`${narrow ? 'w-full' : 'w-60 shrink-0'} flex flex-col border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-y-auto h-full`}>
      <button
        onClick={() => setAdding(true)}
        className="mx-3 mt-3 flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium text-accent dark:text-accent border border-gray-300 dark:border-gray-600 hover:bg-accent/10 dark:hover:bg-accent/20 transition-colors"
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
            <button onClick={() => void createCalendar()} className="px-3 py-1 text-xs rounded bg-accent text-white">
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

      {widgets.map((p) => (
        <div key={p.id} className="mt-2 animate-fade-in">
          {p.renderWidget?.()}
        </div>
      ))}

      <div className="mt-2 px-4">
        <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">My calendars</h3>
        <div className="space-y-1">
          {calendars.map((c) => (
            <div key={c.id} className="group flex items-center gap-2 px-1 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
              <input
                type="checkbox"
                checked={visibleCalendars[c.id] ?? true}
                onChange={() => toggleCalendar(c.id)}
                className="accent-accent"
              />
              <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: c.color }} />
              <span className="flex-1 text-sm truncate text-gray-700 dark:text-gray-200">{c.name}</span>
              {c.role === 'owner' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setMenu({ x: e.clientX, y: e.clientY, calendar: c })
                  }}
                  className="opacity-0 group-hover:opacity-100 text-xs text-gray-400 hover:text-accent"
                  title="Calendar options"
                  aria-label="Calendar options"
                >
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor">
                    <path d="M6 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm12 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm-6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
        {user && (
          <p className="mt-2 text-[10px] text-gray-400 dark:text-gray-500">Signed in as {user.name}</p>
        )}

        <h3 className="mt-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Subscribed feeds</h3>
        {feeds.length > 0 && (
          <div className="space-y-1 mb-1">
            {feeds.map((f) => (
              <div key={f.id} className="flex items-center gap-1 px-1 py-0.5 text-xs group/feed">
                <span className="flex-1 truncate text-gray-600 dark:text-gray-300" title={`${f.url}${f.lastError ? '\n' + f.lastError : ''}`}>
                  {f.url.replace(/^https?:\/\//, '')}
                  {f.lastError ? ' ⚠' : ''}
                </span>
                <button
                  onClick={() => void syncFeed(f.id)}
                  disabled={busyFeed === f.id}
                  className="opacity-0 group-hover/feed:opacity-100 text-gray-400 hover:text-accent disabled:opacity-30"
                  title="Sync now"
                  aria-label="Sync feed"
                >
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor">
                    <path d="M17.65 6.35A7.95 7.95 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
                  </svg>
                </button>
                <button
                  onClick={() => void removeFeed(f.id)}
                  className="opacity-0 group-hover/feed:opacity-100 text-gray-400 hover:text-red-600"
                  title="Unsubscribe"
                  aria-label="Unsubscribe"
                >
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor">
                    <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
        {addingFeed && (
          <div className="mx-1 p-2 rounded-lg border border-gray-200 dark:border-gray-700 space-y-1.5">
            <input
              autoFocus
              placeholder="https://example.com/feed.ics"
              value={feedUrl}
              onChange={(e) => setFeedUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void addFeed()}
              className="w-full px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
            <select
              value={feedTarget}
              onChange={(e) => setFeedTarget(e.target.value)}
              className="w-full px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              <option value="">Target calendar…</option>
              {calendars.filter((c) => c.role !== 'viewer').map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <div className="flex gap-1.5">
              <button onClick={() => void addFeed()} disabled={busyFeed === 'add'} className="flex-1 px-2 py-1 text-xs rounded bg-accent text-white disabled:opacity-50">
                {busyFeed === 'add' ? 'Subscribing…' : 'Subscribe'}
              </button>
              <button onClick={() => setAddingFeed(false)} className="px-2 py-1 text-xs rounded hover:bg-gray-200 dark:hover:bg-gray-700">
                Cancel
              </button>
            </div>
          </div>
        )}
        <button
          onClick={() => setAddingFeed(true)}
          className="flex items-center gap-2 px-2 py-1 w-full text-xs text-gray-500 dark:text-gray-400 hover:text-accent hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
        >
          + Subscribe to ICS feed
        </button>

        <h3 className="mt-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Public calendars</h3>
        {publicCalendars.map((pc) => (
          <div key={pc.token} className="group flex items-center gap-2 px-1 py-1">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: pc.color }} />
            <span className="flex-1 text-sm truncate text-gray-700 dark:text-gray-200">{pc.name}</span>
            <button
              onClick={() => removePublicCalendar(pc.token)}
              className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-600 text-xs"
              title="Unsubscribe"
              aria-label="Unsubscribe public calendar"
            >
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor">
                <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
              </svg>
            </button>
          </div>
        ))}
        {addingPublic && (
          <div className="mx-1 p-2 rounded-lg border border-gray-200 dark:border-gray-700 space-y-1.5">
            <input
              autoFocus
              placeholder="Share link or token"
              value={publicUrl}
              onChange={(e) => setPublicUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void addPublic()}
              className="w-full px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
            <div className="flex gap-1.5">
              <button onClick={() => void addPublic()} className="flex-1 px-2 py-1 text-xs rounded bg-accent text-white">
                Add
              </button>
              <button onClick={() => setAddingPublic(false)} className="px-2 py-1 text-xs rounded hover:bg-gray-200 dark:hover:bg-gray-700">
                Cancel
              </button>
            </div>
          </div>
        )}
        <button
          onClick={() => setAddingPublic(true)}
          className="flex items-center gap-2 px-2 py-1 w-full text-xs text-gray-500 dark:text-gray-400 hover:text-accent hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
        >
          + Add public calendar
        </button>

        <button
          onClick={() => setTransfer(true)}
          className="mt-3 flex items-center gap-2 px-2 py-1.5 w-full text-xs text-gray-500 dark:text-gray-400 hover:text-accent hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
        >
          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor">
            <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
          </svg>
          Import / Export
        </button>
        <button
          onClick={() => setTrashOpen(true)}
          className="mt-1 flex items-center gap-2 px-2 py-1.5 w-full text-xs text-gray-500 dark:text-gray-400 hover:text-red-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
        >
          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor">
            <path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
          </svg>
          Trash
          {trash.length > 0 && <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400">{trash.length}</span>}
        </button>
      </div>

      {sharing && <ShareDialog calendar={sharing} onClose={() => setSharing(null)} />}
      {linkFor && <LinkDialog calendar={linkFor} onClose={() => setLinkFor(null)} />}
      {transfer && <TransferDialog onClose={() => setTransfer(false)} />}
      {trashOpen && <TrashDialog onClose={() => setTrashOpen(false)} />}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            { label: 'Share…', onClick: () => setSharing(menu.calendar) },
            { label: 'Share link…', onClick: () => setLinkFor(menu.calendar) },
            {
              label: 'Delete calendar',
              danger: true,
              onClick: () => setConfirmDelete(menu.calendar)
            }
          ]}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          title="Delete calendar?"
          message={`“${confirmDelete.name}” and all its events will be permanently deleted. This cannot be undone.`}
          confirmLabel="Delete calendar"
          onConfirm={deleteCalendar}
          onClose={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )

  if (narrow) {
    return (
      <>
        <div className="fixed inset-0 z-30 bg-black/40 animate-fade-in" onClick={onClose} />
        <div className="fixed left-0 top-14 bottom-0 z-30 w-72 max-w-[85vw] shadow-xl animate-panel-in">{content}</div>
      </>
    )
  }

  return content
}

function LinkDialog({ calendar, onClose }: { calendar: Calendar; onClose: () => void }): React.JSX.Element {
  const { token } = useAuth()
  const [links, setLinks] = useState<{ token: string; createdAt: string }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [qrs, setQrs] = useState<Record<string, string>>({})

  const load = async (): Promise<void> => {
    if (!token) return
    setLinks((await window.calendarApi.calendars.listLinks(token, calendar.id)) as typeof links)
  }

  useEffect(() => {
    void load()
  }, [])

  useEffect(() => {
    void (async () => {
      const next: Record<string, string> = {}
      for (const l of links) {
        if (qrs[l.token]) continue
        try {
          next[l.token] = await QRCode.toDataURL(`${API_BASE()}/public/${l.token}`, {
            width: 180,
            margin: 1,
            color: { dark: '#000000ff', light: '#ffffffff' }
          })
        } catch {
          // QR generation failed — skip
        }
      }
      if (Object.keys(next).length > 0) setQrs((q) => ({ ...q, ...next }))
    })()
  }, [links])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const create = async (): Promise<void> => {
    if (!token) return
    try {
      await window.calendarApi.calendars.createLink(token, calendar.id)
      await load()
    } catch (err) {
      setError(toErrorMessage(err))
    }
  }

  const revoke = async (linkToken: string): Promise<void> => {
    if (!token) return
    await window.calendarApi.calendars.removeLink(token, calendar.id, linkToken)
    await load()
  }

  const copy = (linkToken: string): void => {
    void navigator.clipboard.writeText(`${API_BASE()}/public/${linkToken}`).then(() => toast('Link copied'))
  }

  const share = async (linkToken: string): Promise<void> => {
    const url = `${API_BASE()}/public/${linkToken}`
    const shared = await nativeShare({ title: `Calendar: ${calendar.name}`, text: `View “${calendar.name}”`, url })
    if (shared) return
    await navigator.clipboard.writeText(url)
    toast('Link copied')
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 w-[420px] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-medium text-gray-800 dark:text-gray-100 mb-1">Share “{calendar.name}” by link</h3>
        <p className="text-sm text-gray-500 mb-4">Anyone with the link can view this calendar — no account needed. You can also subscribe to it in any calendar app via the .ics URL.</p>

        {links.map((l) => (
          <div key={l.token} className="mb-3">
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs px-2 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 truncate" title={`${API_BASE()}/public/${l.token}`}>
                {API_BASE()}/public/{l.token}
              </code>
              <button onClick={() => copy(l.token)} className="px-2 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700">
                Copy
              </button>
              <button onClick={() => void share(l.token)} className="px-2 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700">
                Share
              </button>
              <button onClick={() => void revoke(l.token)} className="px-2 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30">
                Revoke
              </button>
            </div>
            {qrs[l.token] && (
              <div className="mt-2 flex flex-col items-center gap-1">
                <img src={qrs[l.token]} alt={`QR code for ${calendar.name} share link`} className="w-32 h-32 rounded-lg border border-gray-200 dark:border-gray-600 bg-white p-1" />
                <p className="text-[10px] text-gray-400">Scan to open on your phone</p>
              </div>
            )}
          </div>
        ))}

        {links.length === 0 && (
          <button onClick={() => void create()} className="w-full py-2 rounded-lg bg-accent text-white text-sm">
            Create link
          </button>
        )}
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}

        <button onClick={onClose} className="w-full py-2 mt-3 rounded-lg border border-gray-300 dark:border-gray-600 text-sm">
          Close
        </button>
      </div>
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

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
      if (!r?.canceled) {
        toast(
          typeof r?.count === 'number'
            ? `Imported ${r.count} event${r.count === 1 ? '' : 's'}`
            : r?.filePath
              ? 'Export complete'
              : 'Done'
        )
      }
    } catch (err) {
      setMessage(toErrorMessage(err))
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const share = async (): Promise<void> => {
    if (!token) return
    try {
      await window.calendarApi.calendars.share(token, calendar.id, { email, role })
      setEmail('')
      await load()
    } catch (err) {
      setError(toErrorMessage(err))
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
          <button onClick={() => void share()} className="px-3 py-1.5 text-sm rounded-lg bg-accent text-white">
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
