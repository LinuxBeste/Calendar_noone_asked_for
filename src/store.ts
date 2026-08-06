import { create } from 'zustand'
import { toast } from './toasts'
import type { Calendar, Event, EventOccurrence, User, ViewType, EventDetail, EventInput } from '@shared/types'

export const DEFAULT_SETTINGS = {
  firstDayOfWeek: 1 as 0 | 1,
  timeFormat: '24h' as '24h' | '12h',
  defaultView: 'week' as ViewType,
  workingHoursStart: 9,
  workingHoursEnd: 17,
  defaultEventDuration: 30,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  darkMode: 'light' as 'light' | 'dark' | 'auto',
  showWeekNumbers: false,
  defaultReminderMinutes: 0
}

export interface HistoryAction {
  op: 'create' | 'update' | 'delete' | 'occurrence' | 'split'
  eventId: string
  createdId?: string
  occurrence?: string
  deletedOccurrence?: boolean
  before?: Partial<EventInput>
  after?: Partial<EventInput>
  deletedEvent?: Event
}

interface AuthState {
  token: string | null
  user: User | null
  booting: boolean
  boot(): Promise<void>
  login(email: string, password: string): Promise<void>
  register(email: string, name: string, password: string): Promise<void>
  logout(): Promise<void>
}

export const useAuth = create<AuthState>((set, get) => ({
  token: localStorage.getItem('calendar.token'),
  user: null,
  booting: true,
  async boot() {
    const token = get().token
    if (!token) {
      set({ booting: false })
      return
    }
    try {
      const user = (await window.calendarApi.auth.validate(token)) as User | null
      if (user) set({ user, booting: false })
      else {
        localStorage.removeItem('calendar.token')
        set({ token: null, booting: false })
      }
    } catch {
      set({ token: null, user: null, booting: false })
    }
  },
  async login(email, password) {
    const result = (await window.calendarApi.auth.login(email, password)) as { token: string; user: User }
    localStorage.setItem('calendar.token', result.token)
    set({ token: result.token, user: result.user })
  },
  async register(email, name, password) {
    const result = (await window.calendarApi.auth.register(email, name, password)) as { token: string; user: User }
    localStorage.setItem('calendar.token', result.token)
    set({ token: result.token, user: result.user })
  },
  async logout() {
    const { token } = get()
    if (token) await window.calendarApi.auth.logout(token).catch(() => undefined)
    localStorage.removeItem('calendar.token')
    set({ token: null, user: null })
  }
}))

interface CalendarState {
  view: ViewType
  date: Date
  calendars: Calendar[]
  events: Record<string, EventOccurrence[]>
  visibleCalendars: Record<string, boolean>
  settings: typeof DEFAULT_SETTINGS
  setView(view: ViewType): void
  setDate(date: Date): void
  navigate(delta: number): void
  refreshCalendars(): Promise<void>
  refreshEvents(from: string, to: string): Promise<EventOccurrence[]>
  toggleCalendar(id: string): void
  setSettings(patch: Partial<typeof DEFAULT_SETTINGS>): void
  history: HistoryAction[]
  historyIndex: number
  canUndo(): boolean
  canRedo(): boolean
  pushHistory(action: HistoryAction): void
  undo(): Promise<void>
  redo(): Promise<void>
}

const HISTORY_LIMIT = 50

function refreshAll(): Promise<void> {
  return useCalendar
    .getState()
    .refreshEvents('0000-01-01T00:00:00.000Z', '9999-12-31T23:59:59.999Z')
    .catch(() => undefined) as Promise<void>
}

function eventToInput(ev: Event): EventInput {
  return {
    calendarId: ev.calendarId,
    title: ev.title,
    description: ev.description,
    location: ev.location,
    allDay: ev.allDay,
    startsAt: ev.startsAt,
    endsAt: ev.endsAt,
    startDate: ev.startDate,
    endDate: ev.endDate,
    color: ev.color,
    busy: ev.busy,
    rrule: ev.rrule
  }
}

async function applyInverse(action: HistoryAction): Promise<void> {
  const token = useAuth.getState().token
  if (!token) return
  switch (action.op) {
    case 'create':
      await window.calendarApi.events.delete(token, action.eventId)
      break
    case 'update':
      if (action.before) await window.calendarApi.events.update(token, action.eventId, action.before)
      break
    case 'delete':
      if (action.deletedEvent) await window.calendarApi.events.create(token, eventToInput(action.deletedEvent))
      break
    case 'occurrence':
      if (action.deletedOccurrence) {
        await window.calendarApi.events.updateOccurrence(token, action.eventId, action.occurrence!, action.before ?? {})
      } else if (action.before) {
        await window.calendarApi.events.updateOccurrence(token, action.eventId, action.occurrence!, action.before)
      } else {
        await window.calendarApi.events.updateOccurrence(token, action.eventId, action.occurrence!, {})
      }
      break
    case 'split':
      if (action.createdId) await window.calendarApi.events.delete(token, action.createdId)
      if (action.before) await window.calendarApi.events.update(token, action.eventId, action.before)
      break
  }
}

async function applyAction(action: HistoryAction): Promise<void> {
  const token = useAuth.getState().token
  if (!token) return
  switch (action.op) {
    case 'create':
      await window.calendarApi.events.create(token, action.after as EventInput)
      break
    case 'update':
      if (action.after) await window.calendarApi.events.update(token, action.eventId, action.after)
      break
    case 'delete':
      await window.calendarApi.events.delete(token, action.eventId)
      break
    case 'occurrence':
      if (action.deletedOccurrence) {
        await window.calendarApi.events.deleteOccurrence(token, action.eventId, action.occurrence!)
      } else if (action.after) {
        await window.calendarApi.events.updateOccurrence(token, action.eventId, action.occurrence!, action.after)
      }
      break
    case 'split':
      if (action.after) await window.calendarApi.events.splitSeries(token, action.eventId, action.occurrence!, action.after)
      break
  }
}

export const useCalendar = create<CalendarState>((set, get) => ({
  view: DEFAULT_SETTINGS.defaultView,
  date: new Date(),
  calendars: [],
  events: {},
  visibleCalendars: {},
  settings: DEFAULT_SETTINGS,
  setView(view) {
    set({ view })
  },
  setDate(date) {
    set({ date })
  },
  navigate(delta) {
    const { view, date } = get()
    const d = new Date(date)
    if (view === 'day') d.setDate(d.getDate() + delta)
    else if (view === 'week') d.setDate(d.getDate() + delta * 7)
    else if (view === 'month') d.setMonth(d.getMonth() + delta)
    else if (view === 'year') d.setFullYear(d.getFullYear() + delta)
    else d.setDate(d.getDate() + delta)
    set({ date: d })
  },
  async refreshCalendars() {
    const token = useAuth.getState().token
    if (!token) return
    const calendars = (await window.calendarApi.calendars.list(token)) as Calendar[]
    set((s) => {
      const visibleCalendars = { ...s.visibleCalendars }
      for (const c of calendars) {
        if (visibleCalendars[c.id] === undefined) visibleCalendars[c.id] = c.visible
      }
      return { calendars, visibleCalendars }
    })
  },
  async refreshEvents(from, to) {
    const token = useAuth.getState().token
    if (!token) return [] as EventOccurrence[]
    const visible = Object.entries(get().visibleCalendars)
      .filter(([, v]) => v)
      .map(([id]) => id)
    const events = (await window.calendarApi.events.listOccurrences(token, from, to, visible.length ? visible : undefined)) as EventOccurrence[]
    set((s) => ({ events: { ...s.events, [`${from}|${to}`]: events } }))
    return events ?? []
  },
  toggleCalendar(id) {
    set((s) => ({ visibleCalendars: { ...s.visibleCalendars, [id]: !s.visibleCalendars[id] } }))
  },
  setSettings(patch) {
    set((s) => ({ settings: { ...s.settings, ...patch } }))
  },
  history: [],
  historyIndex: 0,
  canUndo() {
    return get().historyIndex > 0
  },
  canRedo() {
    return get().historyIndex < get().history.length
  },
  pushHistory(action) {
    const { history, historyIndex } = get()
    const truncated = history.slice(0, historyIndex)
    set({ history: [...truncated, action].slice(-HISTORY_LIMIT), historyIndex: Math.min(historyIndex + 1, HISTORY_LIMIT) })
  },
  async undo() {
    const { history, historyIndex } = get()
    if (historyIndex <= 0) return
    const action = history[historyIndex - 1]!
    await applyInverse(action)
    set({ historyIndex: historyIndex - 1 })
    toast('Undo', 'info')
    await refreshAll()
  },
  async redo() {
    const { history, historyIndex } = get()
    if (historyIndex >= history.length) return
    const action = history[historyIndex]!
    await applyAction(action)
    set({ historyIndex: historyIndex + 1 })
    toast('Redo', 'info')
    await refreshAll()
  }
}))

export type { EventDetail }
