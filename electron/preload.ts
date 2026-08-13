import { contextBridge, ipcRenderer } from 'electron'
import type { CalendarInput, EventInput, ShareInput, AppSettings, FeedInput } from '@shared/types'

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
    shares: (token: string, calendarId: string) => invoke('calendar:shares', { token, calendarId }),
    createLink: (token: string, calendarId: string) => invoke('calendar:link:create', { token, calendarId }),
    listLinks: (token: string, calendarId: string) => invoke('calendar:link:list', { token, calendarId }),
    removeLink: (token: string, calendarId: string, linkToken: string) => invoke('calendar:link:remove', { token, calendarId, linkToken })
  },
  feeds: {
    list: (token: string) => invoke('feeds:list', { token }),
    create: (token: string, input: FeedInput) => invoke('feeds:create', { token, input }),
    remove: (token: string, feedId: string) => invoke('feeds:remove', { token, feedId }),
    sync: (token: string, feedId: string) => invoke('feeds:sync', { token, feedId })
  },
  public: {
    getOccurrences: (token: string, from: string, to: string) => invoke('public:occurrences', { token, from, to })
  },
  events: {
    list: (token: string, from: string, to: string, calendarIds?: string[]) => invoke('events:list', { token, from, to, calendarIds }),
    get: (token: string, id: string) => invoke('events:get', { token, id }),
    create: (token: string, input: EventInput) => invoke('events:create', { token, input }),
    update: (token: string, id: string, input: Partial<EventInput>) => invoke('events:update', { token, id, input }),
    delete: (token: string, id: string) => invoke('events:delete', { token, id }),
    trash: (token: string) => invoke('events:trash', { token }),
    restore: (token: string, id: string) => invoke('events:restore', { token, id }),
    purge: (token: string, id: string) => invoke('events:purge', { token, id }),
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
  reminders: {
    create: (token: string, eventId: string, minutes: number) => invoke('reminders:create', { token, eventId, minutes }),
    delete: (token: string, id: string) => invoke('reminders:delete', { token, id }),
    upcoming: (token: string, days: number) => invoke('reminders:upcoming', { token, days })
  },
  ical: {
    exportICal: (token: string, calendarIds?: string[]) => invoke('export:ical', { token, calendarIds }),
    importICal: (token: string, calendarId: string) => invoke('import:ical', { token, calendarId }),
    importContent: (token: string, calendarId: string, content: string) => invoke('import:ical-content', { token, calendarId, content }),
    exportJson: (token: string) => invoke('export:json', { token }),
    importJson: (token: string) => invoke('import:json', { token })
  },
  settings: {
    get: (token: string, key: string) => invoke('settings:get', { token, key }),
    set: (token: string, key: string, value: unknown) => invoke('settings:set', { token, key, value })
  },
  plugins: {
    getState: (token: string, pluginId: string) => invoke('plugins:get-state', { token, pluginId }),
    setState: (token: string, pluginId: string, patch: { enabled?: boolean; data?: Record<string, unknown> }) =>
      invoke('plugins:set-state', { token, pluginId, patch })
  },
  updates: {
    subscribe: (cb: (message: string) => void) => {
      const listener = (_e: unknown, data: string): void => cb(data)
      ipcRenderer.on('ws:message', listener)
      return () => {
        ipcRenderer.removeListener('ws:message', listener)
      }
    },
    checkNow: () => invoke('updates:check-now', {})
  },
  appInfo: () => invoke('app:info', {})
}

export type CalendarApi = typeof api

contextBridge.exposeInMainWorld('calendarApi', api)
