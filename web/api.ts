import type { CalendarInput, EventInput, ShareInput, FeedInput } from '@shared/types'
import { useCalendar } from '../src/store'
import { enqueueOp, clearQueue, loadQueue, useConnection, type QueuedOp } from '../src/offline'
import { toast } from '../src/toasts'

export const logger = {
  info: (...args: unknown[]) => console.info('[calendar]', ...args),
  warn: (...args: unknown[]) => console.warn('[calendar]', ...args),
  error: (...args: unknown[]) => console.error('[calendar]', ...args)
}

export const getApiUrl = (): string =>
  localStorage.getItem('calendar.apiUrl') ??
  (isAndroidEmulator()
    ? 'http://10.0.2.2:3001'
    : 'http://localhost:3001')

function isAndroidEmulator(): boolean {
  return typeof window !== 'undefined' && !!window.Capacitor && window.Capacitor.getPlatform() === 'android'
}
export const setApiUrl = (url: string): void => {
  localStorage.setItem('calendar.apiUrl', url)
}
export const isReachable = async (): Promise<boolean> => {
  try {
    const res = await fetch(`${getApiUrl()}/info`, { signal: AbortSignal.timeout(4000) })
    return res.ok
  } catch {
    return false
  }
}

function offline<T>(op: string, payload: unknown, result: T): Promise<T> {
  enqueueOp(op, payload)
  useConnection.getState().setOnline(false)
  toast('Saved offline — will sync when back online', 'info')
  return Promise.resolve(result)
}

/** Play back queued mutations against the server. Returns how many succeeded. */
export async function flushQueue(): Promise<number> {
  const token = localStorage.getItem('calendar.token')
  const ops = loadQueue()
  if (!token || ops.length === 0) return 0
  const queue = [...ops]
  let done = 0
  for (const op of queue) {
    try {
      await replayOp(token, op)
      done++
    } catch (err) {
      logger.warn('queue replay stopped:', err)
      const remaining = loadQueue()
      clearQueue()
      for (const r of remaining) enqueueOp(r.op, r.payload)
      return done
    }
  }
  clearQueue()
  return done
}

async function replayOp(token: string, op: QueuedOp): Promise<void> {
  const p = op.payload as { eventId?: string; input?: EventInput; occurrence?: string; key?: string; value?: unknown }
  switch (op.op) {
    case 'event.create':
      await call('POST', '/events', token, p.input)
      break
    case 'event.update':
      await call('PUT', `/events/${encodeURIComponent(p.eventId ?? '')}`, token, p.input)
      break
    case 'event.delete':
      await call('DELETE', `/events/${encodeURIComponent(p.eventId ?? '')}`, token)
      break
    case 'event.occurrence.update':
      await call('PUT', `/events/${encodeURIComponent(p.eventId ?? '')}/occurrences/${encodeURIComponent(p.occurrence ?? '')}`, token, p.input)
      break
    case 'event.occurrence.delete':
      await call('DELETE', `/events/${encodeURIComponent(p.eventId ?? '')}/occurrences/${encodeURIComponent(p.occurrence ?? '')}`, token)
      break
    case 'event.split':
      await call('POST', `/events/${encodeURIComponent(p.eventId ?? '')}/split/${encodeURIComponent(p.occurrence ?? '')}`, token, p.input)
      break
    case 'settings.set':
      await call('PUT', `/settings/${encodeURIComponent(String(p.key ?? ''))}`, token, { value: p.value })
      break
    default:
      logger.warn('unknown queued op:', op.op)
  }
}

let watchTimer: ReturnType<typeof setInterval> | null = null

/** Probe the backend now; on success flush queued changes and refresh all data. */
export async function checkConnectionNow(): Promise<boolean> {
  const online = await isReachable()
  useConnection.getState().setOnline(online)
  if (!online) return false
  const flushed = await flushQueue().catch(() => 0)
  const s = useCalendar.getState()
  await s.refreshCalendars().catch(() => undefined)
  await s.refreshVisible().catch(() => undefined)
  await s.refreshTrash().catch(() => undefined)
  if (flushed > 0) toast(`${flushed} offline change${flushed === 1 ? '' : 's'} synced`)
  return true
}

/** Polls the backend while offline and syncs the moment it is back. */
export function startConnectionWatch(): void {
  const onNetwork = (): void => {
    if (navigator.onLine) void checkConnectionNow()
    else useConnection.getState().setOnline(false)
  }
  window.addEventListener('online', onNetwork)
  window.addEventListener('offline', onNetwork)
  if (watchTimer) clearInterval(watchTimer)
  watchTimer = setInterval(() => {
    if (useConnection.getState().online || navigator.onLine) void checkConnectionNow()
  }, 8000)
  void checkConnectionNow()
}

function download(name: string, content: string, type: string): void {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

async function pickFile(accept: string): Promise<string | null> {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = accept
  const file: File | null = await new Promise((resolve) => {
    input.onchange = (): void => resolve(input.files?.[0] ?? null)
    input.click()
  })
  if (!file) return null
  return file.text()
}

/** Browser HTTP implementation of the calendar API surface (window.calendarApi). */
export const webApi = {
  auth: {
    register: (email: string, name: string, password: string) => call('POST', '/auth/register', null, { email, name, password }),
    login: (email: string, password: string) => call('POST', '/auth/login', null, { email, password }),
    logout: (token: string) => call('POST', '/auth/logout', token),
    validate: (token: string) => call('GET', '/auth/validate', token)
  },
  calendars: {
    list: (token: string) => call('GET', '/calendars', token),
    create: (token: string, input: CalendarInput) => call('POST', '/calendars', token, input),
    update: (token: string, id: string, input: Partial<CalendarInput>) => call('PUT', `/calendars/${id}`, token, input),
    delete: (token: string, id: string) => call('DELETE', `/calendars/${id}`, token),
    share: (token: string, calendarId: string, input: ShareInput) => call('POST', `/calendars/${calendarId}/share`, token, input),
    unshare: (token: string, calendarId: string, userId: string) => call('DELETE', `/calendars/${calendarId}/share/${encodeURIComponent(userId)}`, token),
    shares: (token: string, calendarId: string) => call('GET', `/calendars/${calendarId}/shares`, token),
    createLink: (token: string, calendarId: string) => call('POST', `/calendars/${calendarId}/link`, token),
    listLinks: (token: string, calendarId: string) => call('GET', `/calendars/${calendarId}/links`, token),
    removeLink: (token: string, calendarId: string, linkToken: string) => call('DELETE', `/calendars/${calendarId}/link/${encodeURIComponent(linkToken)}`, token)
  },
  feeds: {
    list: (token: string) => call('GET', '/feeds', token),
    create: (token: string, input: FeedInput) => call('POST', '/feeds', token, input),
    remove: (token: string, feedId: string) => call('DELETE', `/feeds/${feedId}`, token),
    sync: (token: string, feedId: string) => call('POST', `/feeds/${feedId}/sync`, token)
  },
  public: {
    getOccurrences: (token: string, from: string, to: string) => {
      const params = new URLSearchParams({ from, to })
      return call('GET', `/public/${token}/events?${params}`, null)
    }
  },
  events: {
    list: (token: string, from: string, to: string, calendarIds?: string[]) => {
      const q = calendarIds?.length ? `&calendarIds=${calendarIds.join(',')}` : ''
      return call('GET', `/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${q}`, token)
    },
    get: (token: string, id: string) => call('GET', `/events/${id}`, token),
    create: (token: string, input: EventInput) => {
      if (!useConnection.getState().online) return offline('event.create', { input }, { id: `offline-${Date.now()}` })
      return call('POST', '/events', token, input)
    },
    update: (token: string, id: string, input: Partial<EventInput>) => {
      if (!useConnection.getState().online) return offline('event.update', { eventId: id, input }, undefined)
      return call('PUT', `/events/${id}`, token, input)
    },
    delete: (token: string, id: string) => {
      if (!useConnection.getState().online) return offline('event.delete', { eventId: id }, undefined)
      return call('DELETE', `/events/${id}`, token)
    },
    trash: (token: string) => call('GET', '/events/trash', token),
    restore: (token: string, id: string) => call('POST', `/events/${id}/restore`, token),
    purge: (token: string, id: string) => call('DELETE', `/events/${id}/forever`, token),
    search: (token: string, query: string, calendarIds?: string[], limit?: number) => {
      const params = new URLSearchParams({ q: query })
      if (calendarIds?.length) params.set('calendarIds', calendarIds.join(','))
      if (limit) params.set('limit', String(limit))
      return call('GET', `/events/search?${params}`, token)
    },
    listOccurrences: (token: string, from: string, to: string, calendarIds?: string[]) => {
      const params = new URLSearchParams({ from, to })
      if (calendarIds?.length) params.set('calendarIds', calendarIds.join(','))
      return call('GET', `/events/occurrences?${params}`, token)
    },
    occurrences: (token: string, eventId: string, from: string, to: string) =>
      call('GET', `/events/${eventId}/occurrences?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, token),
    updateOccurrence: (token: string, eventId: string, occurrence: string, input: Partial<EventInput>) => {
      if (!useConnection.getState().online) return offline('event.occurrence.update', { eventId, occurrence, input }, undefined)
      return call('PUT', `/events/${eventId}/occurrences/${encodeURIComponent(occurrence)}`, token, input)
    },
    deleteOccurrence: (token: string, eventId: string, occurrence: string) => {
      if (!useConnection.getState().online) return offline('event.occurrence.delete', { eventId, occurrence }, undefined)
      return call('DELETE', `/events/${eventId}/occurrences/${encodeURIComponent(occurrence)}`, token)
    },
    splitSeries: (token: string, eventId: string, occurrence: string, input: Partial<EventInput>) => {
      if (!useConnection.getState().online) return offline('event.split', { eventId, occurrence, input }, undefined)
      return call('POST', `/events/${eventId}/split/${encodeURIComponent(occurrence)}`, token, input)
    }
  },
  reminders: {
    create: (token: string, eventId: string, minutes: number) => call('POST', '/reminders', token, { eventId, minutes }),
    delete: (token: string, id: string) => call('DELETE', `/reminders/${id}`, token),
    upcoming: (token: string, days: number) => call('GET', `/reminders/upcoming?days=${days}`, token)
  },
  ical: {
    exportICal: async (token: string, calendarIds?: string[]) => {
      const q = calendarIds?.length ? `?calendarIds=${calendarIds.join(',')}` : ''
      const content = (await call('GET', `/export/ical${q}`, token)) as string
      download('calendar.ics', content, 'text/calendar')
      return { canceled: false }
    },
    importICal: async (token: string, calendarId: string) => {
      const content = await pickFile('.ics,text/calendar')
      if (content === null) return { canceled: true }
      const count = (await call('POST', '/import/ical', token, { calendarId, content })) as number
      return { canceled: false, count }
    },
    importContent: async (token: string, calendarId: string, content: string) => {
      const count = (await call('POST', '/import/ical', token, { calendarId, content })) as number
      return { canceled: false, count }
    },
    exportJson: async (token: string) => {
      const content = (await call('GET', '/export/json', token)) as string
      download('calendar-backup.json', content, 'application/json')
      return { canceled: false }
    },
    importJson: async (token: string) => {
      const content = await pickFile('.json,application/json')
      if (content === null) return { canceled: true }
      const count = (await call('POST', '/import/json', token, { content })) as number
      return { canceled: false, count }
    }
  },
  settings: {
    get: (token: string, key: string) => call('GET', `/settings/${encodeURIComponent(key)}`, token),
    set: (token: string, key: string, value: unknown) => {
      if (!useConnection.getState().online) return offline('settings.set', { key, value }, undefined)
      return call('PUT', `/settings/${encodeURIComponent(key)}`, token, { value })
    }
  },
  updates: {
    checkNow: async (): Promise<{ available: boolean; version: null; error: string }> => ({ available: false, version: null, error: 'Managed in Settings' }),
    subscribe(cb: (message: string) => void): () => void {
      let socket: WebSocket | null = null
      let stopped = false
      let retry: ReturnType<typeof setTimeout> | null = null
      const connect = (): void => {
        if (stopped) return
        const token = localStorage.getItem('calendar.token')
        const url = getApiUrl().replace(/^http/, 'ws') + '/ws?token=' + encodeURIComponent(token ?? '')
        try {
          socket = new WebSocket(url)
        } catch {
          retry = setTimeout(connect, 3000)
          return
        }
        socket.onmessage = (e) => cb(String(e.data))
        socket.onerror = () => socket?.close()
        socket.onclose = () => {
          if (!stopped) retry = setTimeout(connect, 3000)
        }
      }
      connect()
      return () => {
        stopped = true
        if (retry) clearTimeout(retry)
        socket?.close()
      }
    }
  },
  appInfo: () => call('GET', '/info', null)
}

async function call(method: string, path: string, token: string | null, body?: unknown): Promise<unknown> {
  let res: Response
  try {
    res = await fetch(`${getApiUrl()}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(8000)
    })
  } catch (err) {
    useConnection.getState().setOnline(false)
    if (err instanceof DOMException && err.name === 'TimeoutError') throw new Error(`Backend timed out at ${getApiUrl()}`)
    throw new Error(`Backend unreachable at ${getApiUrl()} (${err instanceof Error ? err.message : 'network error'})`)
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(data.error ?? `Request failed (${res.status})`)
  }
  if (res.status === 204) return undefined
  return res.json().catch(() => undefined)
}

/** Browser reminder engine: polls the backend (user-scoped) and shows web notifications. */
export function startWebReminderEngine(): void {
  let running = false
  const check = async (): Promise<void> => {
    const token = localStorage.getItem('calendar.token')
    if (!token) return
    if (running) return
    running = true
    try {
      const due = (await call('GET', '/reminders/due?window=5', token)) as Array<{
        id: string
        title: string
        startsAt?: string
        calendarName: string
      }>
      for (const r of due) {
        try {
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(r.title, {
              body: `Starting ${new Date(r.startsAt ?? '').toLocaleTimeString()} · ${r.calendarName}`
            })
          }
        } catch (err) {
          logger.warn('notification failed:', err)
        }
        await call('POST', `/reminders/${r.id}/sent`, token)
      }
      await checkUpcoming(token)
    } catch (err) {
      logger.warn('reminder check failed:', err)
    } finally {
      running = false
    }
  }

  const checkUpcoming = async (token: string): Promise<void> => {
    const s = useCalendar.getState().settings
    if (!s.notifyUpcomingEvents || s.notifyUpcomingWindow < 5) return
    const winMs = s.notifyUpcomingWindow * 60000
    const from = new Date().toISOString()
    const to = new Date(Date.now() + winMs).toISOString()
    const occurrences = (await call('GET', `/events/occurrences?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, token)) as Array<{
      start: string
      event: { id: string; title: string }
    }>
    let stored: string[] = []
    try {
      stored = JSON.parse(localStorage.getItem('calendar.notifiedUpcoming') ?? '[]') as string[]
    } catch {
      stored = []
    }
    const set = new Set(stored)
    for (const occ of occurrences) {
      const startMs = new Date(occ.start).getTime()
      if (startMs <= Date.now()) continue
      const key = `${occ.event.id}|${occ.start}`
      if (set.has(key)) continue
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(occ.event.title, {
          body: `Starting at ${new Date(startMs).toLocaleTimeString()}`
        })
      }
      set.add(key)
    }
    const cutoff = Date.now() - 48 * 60 * 60 * 1000
    const kept = [...set].filter((k) => {
      const ts = k.split('|')[1]
      return ts ? new Date(ts).getTime() > cutoff : true
    })
    localStorage.setItem('calendar.notifiedUpcoming', JSON.stringify(kept))
  }

  void check()
  setInterval(() => void check(), 30_000)
}
