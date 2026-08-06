import { contextBridge, ipcRenderer } from 'electron'
import type { CalendarInput, EventInput, ShareInput, AppSettings } from '@shared/types'

const invoke = (channel: string, payload: unknown): Promise<unknown> => ipcRenderer.invoke(channel, payload)

const api = {
  auth: {
    register: (email: string, name: string, password: string) =>
      invoke('auth:register', { email, name, password }),
    login: (email: string, password: string) => invoke('auth:login', { email, password }),
    logout: (token: string) => invoke('auth:logout', { token }),
    validate: (token: string) => invoke('auth:validate', { token })
  },
  calendars: {
    list: (token: string) => invoke('calendar:list', { token }),
    create: (token: string, input: CalendarInput) => invoke('calendar:create', { token, input }),
    update: (token: string, id: string, input: Partial<CalendarInput>) => invoke('calendar:update', { token, id, input }),
    delete: (token: string, id: string) => invoke('calendar:delete', { token, id }),
    share: (token: string, calendarId: string, input: ShareInput) => invoke('calendar:share', { token, calendarId, input }),
    unshare: (token: string, calendarId: string, userId: string) => invoke('calendar:unshare', { token, calendarId, userId }),
    shares: (token: string, calendarId: string) => invoke('calendar:shares', { token, calendarId })
  },
  events: {
    list: (token: string, from: string, to: string, calendarIds?: string[]) => invoke('events:list', { token, from, to, calendarIds }),
    get: (token: string, id: string) => invoke('events:get', { token, id }),
    create: (token: string, input: EventInput) => invoke('events:create', { token, input }),
    update: (token: string, id: string, input: Partial<EventInput>) => invoke('events:update', { token, id, input }),
    delete: (token: string, id: string) => invoke('events:delete', { token, id }),
    search: (token: string, query: string, calendarIds?: string[], limit?: number) =>
      invoke('events:search', { token, query, calendarIds, limit }),
    listOccurrences: (token: string, from: string, to: string, calendarIds?: string[]) =>
      invoke('events:listOccurrences', { token, from, to, calendarIds }),
    occurrences: (token: string, eventId: string, from: string, to: string) =>
      invoke('events:occurrences', { token, eventId, from, to }),
    updateOccurrence: (token: string, eventId: string, occurrence: string, input: Partial<EventInput>) =>
      invoke('events:updateOccurrence', { token, eventId, occurrence, input }),
    deleteOccurrence: (token: string, eventId: string, occurrence: string) =>
      invoke('events:deleteOccurrence', { token, eventId, occurrence }),
    splitSeries: (token: string, eventId: string, occurrence: string, input: Partial<EventInput>) =>
      invoke('events:splitSeries', { token, eventId, occurrence, input })
  },
  settings: {
    get: (token: string, key: string) => invoke('settings:get', { token, key }),
    set: (token: string, key: string, value: unknown) => invoke('settings:set', { token, key, value })
  },
  appInfo: () => invoke('app:info', {})
}

export type CalendarApi = typeof api

contextBridge.exposeInMainWorld('calendarApi', api)
