import type { CalendarInput, EventInput, ShareInput, FeedInput } from '@shared/types'

const BASE = process.env.CALENDAR_API_URL ?? 'http://localhost:3001'
const API_KEY = process.env.CALENDAR_API_KEY?.trim() || undefined
const REQUEST_TIMEOUT_MS = 30_000

export interface FieldError {
  path: string
  message: string
}

/** Own enumerable fields survive contextBridge serialization (renderer duck-types). */
export class ApiError extends Error {
  readonly code: string
  readonly statusCode?: number
  readonly details?: FieldError[]

  constructor(message: string, code = 'BAD_REQUEST', statusCode?: number, details?: FieldError[]) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.statusCode = statusCode
    this.details = details
  }
}

/** Thin HTTP client for the calendar backend. All methods mirror the IPC surface. */
class ApiClient {
  private async call(method: string, path: string, token?: string | null, body?: unknown, system = false): Promise<unknown> {
    // Abort after 30 s — the renderer has no timeout of its own.
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    let res: Response
    try {
      res = await fetch(`${BASE}${path}`, {
        method,
        headers: {
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(system && API_KEY ? { 'X-Api-Key': API_KEY } : {})
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal
      })
    } catch (err) {
      const timedOut = err instanceof Error && err.name === 'AbortError'
      throw new ApiError(
        `Backend unreachable at ${BASE} — is the server running?${timedOut ? ' (request timed out)' : ''}`,
        'NETWORK',
        undefined,
        undefined
      )
    } finally {
      clearTimeout(timer)
    }
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string; details?: FieldError[] }
      const fallbackCode =
        res.status === 401
          ? 'UNAUTHORIZED'
          : res.status === 403
            ? 'FORBIDDEN'
            : res.status === 404
              ? 'NOT_FOUND'
              : res.status === 429
                ? 'RATE_LIMIT'
                : 'BAD_REQUEST'
      throw new ApiError(data.error ?? `Request failed (${res.status})`, data.code ?? fallbackCode, res.status, data.details)
    }
    if (res.status === 204) return undefined
    return res.json().catch(() => undefined)
  }

  async info(): Promise<{ using: string }> {
    return (await this.call('GET', '/info')) as { using: string }
  }

  // ---- auth ----
  async register(payload: { email: string; name: string; password: string }): Promise<{ token: string; user: unknown }> {
    return (await this.call('POST', '/auth/register', null, payload)) as { token: string; user: unknown }
  }
  async login(email: string, password: string): Promise<{ token: string; user: unknown }> {
    return (await this.call('POST', '/auth/login', null, { email, password })) as { token: string; user: unknown }
  }
  async logout(token: string): Promise<void> {
    await this.call('POST', '/auth/logout', token)
  }
  async validate(token: string): Promise<unknown> {
    return this.call('GET', '/auth/validate', token)
  }

  // ---- calendars ----
  async listCalendars(token: string): Promise<unknown> {
    return this.call('GET', '/calendars', token)
  }
  async createCalendar(token: string, input: CalendarInput): Promise<unknown> {
    return this.call('POST', '/calendars', token, input)
  }
  async updateCalendar(token: string, id: string, input: Partial<CalendarInput>): Promise<unknown> {
    return this.call('PUT', `/calendars/${id}`, token, input)
  }
  async deleteCalendar(token: string, id: string): Promise<unknown> {
    return this.call('DELETE', `/calendars/${id}`, token)
  }
  async shareCalendar(token: string, id: string, input: ShareInput): Promise<unknown> {
    return this.call('POST', `/calendars/${id}/share`, token, input)
  }
  async unshareCalendar(token: string, id: string, userId: string): Promise<unknown> {
    return this.call('DELETE', `/calendars/${id}/share/${encodeURIComponent(userId)}`, token)
  }
  async listShares(token: string, id: string): Promise<unknown> {
    return this.call('GET', `/calendars/${id}/shares`, token)
  }
  async createLink(token: string, id: string): Promise<unknown> {
    return this.call('POST', `/calendars/${id}/link`, token)
  }
  async listLinks(token: string, id: string): Promise<unknown> {
    return this.call('GET', `/calendars/${id}/links`, token)
  }
  async deleteLink(token: string, id: string, linkToken: string): Promise<unknown> {
    return this.call('DELETE', `/calendars/${id}/link/${encodeURIComponent(linkToken)}`, token)
  }

  // ---- ICS feed subscriptions ----
  async listFeeds(token: string): Promise<unknown> {
    return this.call('GET', '/feeds', token)
  }
  async createFeed(token: string, input: FeedInput): Promise<unknown> {
    return this.call('POST', '/feeds', token, input)
  }
  async deleteFeed(token: string, feedId: string): Promise<unknown> {
    return this.call('DELETE', `/feeds/${feedId}`, token)
  }
  async syncFeed(token: string, feedId: string): Promise<unknown> {
    return this.call('POST', `/feeds/${feedId}/sync`, token)
  }

  // ---- public share links (no auth) ----
  async getPublicOccurrences(token: string, from: string, to: string): Promise<unknown> {
    return this.call('GET', `/public/${encodeURIComponent(token)}/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, null)
  }

  // ---- events ----
  async listEvents(token: string, from: string, to: string, calendarIds?: string[]): Promise<unknown> {
    const q = calendarIds?.length ? `&calendarIds=${calendarIds.join(',')}` : ''
    return this.call('GET', `/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${q}`, token)
  }
  async getEvent(token: string, id: string): Promise<unknown> {
    return this.call('GET', `/events/${id}`, token)
  }
  async createEvent(token: string, input: EventInput): Promise<unknown> {
    return this.call('POST', '/events', token, input)
  }
  async updateEvent(token: string, id: string, input: Partial<EventInput>): Promise<unknown> {
    return this.call('PUT', `/events/${id}`, token, input)
  }
  async deleteEvent(token: string, id: string): Promise<unknown> {
    return this.call('DELETE', `/events/${id}`, token)
  }
  async listTrash(token: string): Promise<unknown> {
    return this.call('GET', '/events/trash', token)
  }
  async restoreEvent(token: string, id: string): Promise<unknown> {
    return this.call('POST', `/events/${id}/restore`, token)
  }
  async purgeEvent(token: string, id: string): Promise<unknown> {
    return this.call('DELETE', `/events/${id}/forever`, token)
  }
  async searchEvents(token: string, q: string, calendarIds?: string[], limit?: number): Promise<unknown> {
    const params = new URLSearchParams({ q })
    if (calendarIds?.length) params.set('calendarIds', calendarIds.join(','))
    if (limit) params.set('limit', String(limit))
    return this.call('GET', `/events/search?${params}`, token)
  }
  async listOccurrences(token: string, from: string, to: string, calendarIds?: string[]): Promise<unknown> {
    const params = new URLSearchParams({ from, to })
    if (calendarIds?.length) params.set('calendarIds', calendarIds.join(','))
    return this.call('GET', `/events/occurrences?${params}`, token)
  }
  async listEventOccurrences(token: string, eventId: string, from: string, to: string): Promise<unknown> {
    return this.call('GET', `/events/${eventId}/occurrences?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, token)
  }
  async updateOccurrence(token: string, eventId: string, occurrence: string, input: Partial<EventInput>): Promise<unknown> {
    return this.call('PUT', `/events/${eventId}/occurrences/${encodeURIComponent(occurrence)}`, token, input)
  }
  async deleteOccurrence(token: string, eventId: string, occurrence: string): Promise<unknown> {
    return this.call('DELETE', `/events/${eventId}/occurrences/${encodeURIComponent(occurrence)}`, token)
  }
  async splitSeries(token: string, eventId: string, occurrence: string, input: Partial<EventInput>): Promise<unknown> {
    return this.call('POST', `/events/${eventId}/split/${encodeURIComponent(occurrence)}`, token, input)
  }

  // ---- reminders ----
  async createReminder(token: string, eventId: string, minutes: number): Promise<unknown> {
    return this.call('POST', '/reminders', token, { eventId, minutes })
  }
  async deleteReminder(token: string, id: string): Promise<unknown> {
    return this.call('DELETE', `/reminders/${id}`, token)
  }

  async listUpcomingReminders(token: string, days: number): Promise<unknown> {
    return this.call('GET', `/reminders/upcoming?days=${days}`, token)
  }

  // ---- settings ----
  async getSetting(token: string, key: string): Promise<unknown> {
    return this.call('GET', `/settings/${encodeURIComponent(key)}`, token)
  }
  async setSetting(token: string, key: string, value: unknown): Promise<void> {
    await this.call('PUT', `/settings/${encodeURIComponent(key)}`, token, { value })
  }

  // ---- plugins ----
  async getPluginState(token: string, pluginId: string): Promise<unknown> {
    return this.call('GET', `/plugins/${encodeURIComponent(pluginId)}/state`, token)
  }
  async setPluginState(token: string, pluginId: string, patch: { enabled?: boolean; data?: Record<string, unknown> }): Promise<void> {
    await this.call('PUT', `/plugins/${encodeURIComponent(pluginId)}/state`, token, patch)
  }

  // ---- import / export ----
  async exportICal(token: string, calendarIds?: string[]): Promise<string> {
    const q = calendarIds?.length ? `?calendarIds=${calendarIds.join(',')}` : ''
    return (await this.call('GET', `/export/ical${q}`, token)) as string
  }
  async exportJson(token: string): Promise<string> {
    return (await this.call('GET', '/export/json', token)) as string
  }
  async importICal(token: string, calendarId: string, content: string): Promise<number> {
    return (await this.call('POST', '/import/ical', token, { calendarId, content })) as number
  }
  async importICalContent(token: string, calendarId: string, content: string): Promise<number> {
    return (await this.call('POST', '/import/ical', token, { calendarId, content })) as number
  }
  async importJson(token: string, content: string): Promise<number> {
    return (await this.call('POST', '/import/json', token, { content })) as number
  }

  // ---- reminder engine (system-level, API key) ----
  async listDueReminders(windowMinutes = 5): Promise<Array<{ id: string; eventId: string; minutes: number; startsAt?: string; title: string; calendarName: string }>> {
    return (await this.call('GET', `/reminders/due?window=${windowMinutes}`, null, undefined, true)) as never
  }
  async markReminderSent(id: string): Promise<void> {
    await this.call('POST', `/reminders/${id}/sent`, null, undefined, true)
  }
}

export const api = new ApiClient()
