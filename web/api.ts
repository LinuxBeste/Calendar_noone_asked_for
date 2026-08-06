import type { CalendarInput, EventInput, ShareInput } from '@shared/types'

export const logger = {
  info: (...args: unknown[]) => console.info('[calendar]', ...args),
  warn: (...args: unknown[]) => console.warn('[calendar]', ...args),
  error: (...args: unknown[]) => console.error('[calendar]', ...args)
}

export const getApiUrl = (): string => localStorage.getItem('calendar.apiUrl') ?? 'http://localhost:3001'
export const setApiUrl = (url: string): void => {
  localStorage.setItem('calendar.apiUrl', url)
}
export const isReachable = async (): Promise<boolean> => {
  try {
    const res = await fetch(`${getApiUrl()}/info`)
    return res.ok
  } catch {
    return false
  }
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
    shares: (token: string, calendarId: string) => call('GET', `/calendars/${calendarId}/shares`, token)
  },
  events: {
    list: (token: string, from: string, to: string, calendarIds?: string[]) => {
      const q = calendarIds?.length ? `&calendarIds=${calendarIds.join(',')}` : ''
      return call('GET', `/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${q}`, token)
    },
    get: (token: string, id: string) => call('GET', `/events/${id}`, token),
    create: (token: string, input: EventInput) => call('POST', '/events', token, input),
    update: (token: string, id: string, input: Partial<EventInput>) => call('PUT', `/events/${id}`, token, input),
    delete: (token: string, id: string) => call('DELETE', `/events/${id}`, token),
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
    updateOccurrence: (token: string, eventId: string, occurrence: string, input: Partial<EventInput>) =>
      call('PUT', `/events/${eventId}/occurrences/${encodeURIComponent(occurrence)}`, token, input),
    deleteOccurrence: (token: string, eventId: string, occurrence: string) =>
      call('DELETE', `/events/${eventId}/occurrences/${encodeURIComponent(occurrence)}`, token),
    splitSeries: (token: string, eventId: string, occurrence: string, input: Partial<EventInput>) =>
      call('POST', `/events/${eventId}/split/${encodeURIComponent(occurrence)}`, token, input)
  },
  reminders: {
    create: (token: string, eventId: string, minutes: number) => call('POST', '/reminders', token, { eventId, minutes }),
    delete: (token: string, id: string) => call('DELETE', `/reminders/${id}`, token)
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
    set: (token: string, key: string, value: unknown) => call('PUT', `/settings/${encodeURIComponent(key)}`, token, { value })
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
      body: body !== undefined ? JSON.stringify(body) : undefined
    })
  } catch (err) {
    throw new Error(`Backend unreachable at ${getApiUrl()} (${err instanceof Error ? err.message : 'network error'})`)
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(data.error ?? `Request failed (${res.status})`)
  }
  if (res.status === 204) return undefined
  return res.json().catch(() => undefined)
}

/** Browser reminder engine: polls the backend and shows web notifications. */
export function startWebReminderEngine(): void {
  let running = false
  const check = async (): Promise<void> => {
    if (running) return
    running = true
    try {
      const due = (await call('GET', '/reminders/due?window=5', null)) as Array<{
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
        await call('POST', `/reminders/${r.id}/sent`, null)
      }
    } catch (err) {
      logger.warn('reminder check failed:', err)
    } finally {
      running = false
    }
  }
  void check()
  setInterval(() => void check(), 30_000)
}
