import { create } from 'zustand'
import type { Calendar, Event, User, ViewType, EventDetail } from '@shared/types'

export const DEFAULT_SETTINGS = {
  firstDayOfWeek: 1 as 0 | 1,
  timeFormat: '24h' as '24h' | '12h',
  defaultView: 'week' as ViewType,
  workingHoursStart: 9,
  workingHoursEnd: 17,
  defaultEventDuration: 30,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  darkMode: 'light' as 'light' | 'dark' | 'auto',
  showWeekNumbers: false
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
  events: Record<string, Event[]>
  visibleCalendars: Record<string, boolean>
  settings: typeof DEFAULT_SETTINGS
  setView(view: ViewType): void
  setDate(date: Date): void
  navigate(delta: number): void
  refreshCalendars(): Promise<void>
  refreshEvents(from: string, to: string): Promise<Event[]>
  toggleCalendar(id: string): void
  setSettings(patch: Partial<typeof DEFAULT_SETTINGS>): void
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
    if (!token) return
    const visible = Object.entries(get().visibleCalendars)
      .filter(([, v]) => v)
      .map(([id]) => id)
    const events = (await window.calendarApi.events.list(token, from, to, visible.length ? visible : undefined)) as Event[]
    set((s) => ({ events: { ...s.events, [`${from}|${to}`]: events } }))
    return events ?? []
  },
  toggleCalendar(id) {
    set((s) => ({ visibleCalendars: { ...s.visibleCalendars, [id]: !s.visibleCalendars[id] } }))
  },
  setSettings(patch) {
    set((s) => ({ settings: { ...s.settings, ...patch } }))
  }
}))

export type { EventDetail }
