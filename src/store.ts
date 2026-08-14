import { create } from 'zustand'
import { toast, toastError } from './toasts'
import { SETTING_DEFS } from '@shared/settings'
import { scheduleReconcile } from './lib/notifications'
import { loadCache, saveCache, useConnection } from './offline'
import { errorInfo, logError } from './utils/errors'
import { birthdayOccurrences, parseContacts, serializeContacts, type Contact } from './utils/birthdays'
import type { Calendar, Event, EventOccurrence, User, ViewType, EventDetail, EventInput } from '@shared/types'

export const DEFAULT_SETTINGS = {
  firstDayOfWeek: 1 as 0 | 1,
  timeFormat: '24h' as '24h' | '12h',
  defaultView: 'week' as ViewType,
  workingHoursStart: 9,
  workingHoursEnd: 17,
  defaultEventDuration: 30,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  darkMode: 'light' as 'light' | 'dark' | 'auto' | 'scheduled',
  darkModeStart: 22,
  darkModeEnd: 7,
  accentFollowsCalendar: '',
  showWeekNumbers: true,
  defaultReminderMinutes: 0,
  defaultCalendarId: '',
  secondaryTimezone: '',
  hideWeekends: false,
  showHolidays: false,
  holidaysCountry: 'de' as 'de' | 'at' | 'ch' | 'us' | 'gb' | 'fr' | 'es' | 'it' | 'nl' | 'pl' | 'se' | 'jp',
  accentColor: '#1a73e8',
  contacts: '',
  agendaRangeDays: 14,
  monthMaxEvents: 3,
  language: 'en',
  confirmBeforeDelete: true,
  closeOnEscape: true,
  showEventTooltips: true,
  reduceMotion: false,
  startInFullscreen: false,
  autoStartWithSystem: false,
  fontScale: 100,
  density: 'comfortable',
  eventCornerRadius: 'medium',
  eventOpacity: 100,
  eventBorderStyle: 'solid',
  highlightToday: true,
  showNowLine: true,
  weekendShading: true,
  holidayShading: true,
  showCalendarColors: true,
  animateTransitions: true,
  compactSidebar: true,
  showHoverPreview: true,
  scrollToWorkingHours: true,
  fitDayToScreen: true,
  defaultZoomPct: 100,
  snapInterval: 15,
  showQuarterLines: true,
  hourLineStyle: 'solid',
  dayColumnMinWidth: 120,
  showDayHeaders: true,
  showAllDayRow: true,
  timeGutterWidth: 'medium',
  showEndTimesInWeek: true,
  alternateHourShading: false,
  monthShowHolidays: false,
  monthShowWeekNumbers: true,
  monthWeekendShading: true,
  monthTrailingDays: true,
  monthEventStyle: 'bar',
  monthTodayRing: true,
  monthDragDrop: true,
  monthHoverPreview: true,
  monthCompactWeekends: false,
  monthShowEventTime: true,
  agendaShowTime: true,
  agendaShowLocation: true,
  agendaShowIcons: true,
  agendaGroupBy: 'day',
  agendaSortOrder: 'chronological',
  agendaCollapsePast: true,
  agendaShowHolidays: false,
  agendaShowEndTime: true,
  agendaMaxItemsPerDay: 20,
  agendaShowWeekdayHeader: true,
  defaultBusy: 'busy',
  defaultAllDay: false,
  defaultColor: '',
  showEndTimeOnEvent: true,
  dragAndDropEnabled: true,
  resizeEnabled: true,
  deleteToTrash: true,
  duplicateKeepsRecurrence: true,
  autoTitleCase: false,
  showFreeBusyStyle: true,
  newEventsUseSnap: true,
  notificationsEnabled: true,
  notifySound: true,
  notifySnoozeMinutes: 10,
  badgeTodayCount: true,
  notifyUpcomingEvents: false,
  notifyUpcomingWindow: 30,
  notifyWhenFocused: false,
  notificationSoundType: 'default',
  silentHoursEnabled: false,
  silentHoursStart: 22,
  silentHoursEnd: 7,
  weeklyDigest: false,
  digestDay: 1,
  digestTime: 8,
  dateStyle: 'medium',
  timeStyle: 'HH:mm',
  weekNumberStyle: 'iso',
  timezoneDisplay: 'name',
  holidayLabelStyle: 'short',
  monthNamesStyle: 'short',
  weekdayNamesStyle: 'short',
  shareAllowed: true,
  defaultShareRole: 'viewer',
  allowPublicCalendars: false,
  showOwnerNames: true,
  showSharedBadges: true,
  hideDetailsFromViewers: false,
  searchIncludesShared: true,
  showForeignCalendarColors: true,
  activityNotifications: true,
  autoRefreshMinutes: 0,
  apiTimeoutMs: 30000,
  keepTrashDays: 30,
  historyLimit: 50,
  enableKeyboardShortcuts: true,
  enableCommandPalette: true,
  debugLogging: false,
  telemetryOff: true,
  experimentalFeatures: false,
  offlineCacheEnabled: false,
  cacheEventsMonths: 12,
  smartRecurrenceEnd: true,
  strictTimeValidation: true
}

for (const def of SETTING_DEFS) {
  if (DEFAULT_SETTINGS[def.key as keyof typeof DEFAULT_SETTINGS] !== def.defaultValue) {
    console.warn(`Settings catalog mismatch for "${def.key}": default ${JSON.stringify(def.defaultValue)}`)
  }
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
  user: (() => {
    try {
      return JSON.parse(localStorage.getItem('calendar.user') ?? 'null') as User | null
    } catch {
      return null
    }
  })(),
  booting: true,
  async boot() {
    const token = get().token ?? localStorage.getItem('calendar.token')
    if (!token) {
      set({ booting: false })
      return
    }
    try {
      const user = (await window.calendarApi.auth.validate(token)) as User | null
      if (user) set({ token, user, booting: false })
      else {
        localStorage.removeItem('calendar.token')
        localStorage.removeItem('calendar.user')
        set({ token: null, booting: false })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      const offline = msg.startsWith('Backend') || useConnection.getState().online === false
      if (offline && localStorage.getItem('calendar.token')) {
        const cached = (() => {
          try {
            return JSON.parse(localStorage.getItem('calendar.user') ?? 'null') as User | null
          } catch {
            return null
          }
        })()
        set({ token, user: cached, booting: false })
        useConnection.getState().setOnline(false)
      } else {
        localStorage.removeItem('calendar.token')
        localStorage.removeItem('calendar.user')
        set({ token: null, user: null, booting: false })
      }
    }
  },
  async login(email, password) {
    const result = (await window.calendarApi.auth.login(email, password)) as { token: string; user: User }
    localStorage.setItem('calendar.token', result.token)
    localStorage.setItem('calendar.user', JSON.stringify(result.user))
    localStorage.setItem('calendar.setupDone', '1')
    set({ token: result.token, user: result.user })
  },
  async register(email, name, password) {
    const result = (await window.calendarApi.auth.register(email, name, password)) as { token: string; user: User }
    localStorage.setItem('calendar.token', result.token)
    localStorage.setItem('calendar.user', JSON.stringify(result.user))
    localStorage.removeItem('calendar.setupDone')
    set({ token: result.token, user: result.user })
  },
  async logout() {
    const { token } = get()
    if (token) await window.calendarApi.auth.logout(token).catch(() => undefined)
    localStorage.removeItem('calendar.token')
    localStorage.removeItem('calendar.user')
    set({ token: null, user: null })
  }
}))

interface CalendarState {
  view: ViewType
  date: Date
  viewHistory: ViewType[]
  calendars: Calendar[]
  events: EventOccurrence[]
  trash: Event[]
  visibleCalendars: Record<string, boolean>
  settings: typeof DEFAULT_SETTINGS
  lastRange: { from: string; to: string } | null
  publicCalendars: PublicCalendar[]
  birthdaysVisible: boolean
  setView(view: ViewType): void
  backView(): boolean
  setDate(date: Date): void
  navigate(delta: number): void
  refreshCalendars(): Promise<void>
  refreshEvents(from: string, to: string): Promise<EventOccurrence[]>
  refreshVisible(): Promise<void>
  duplicateEvent(event: Event, occurrence?: EventOccurrence): Promise<void>
  refreshTrash(): Promise<void>
  restoreTrashed(id: string): Promise<void>
  purgeTrashed(id: string): Promise<void>
  toggleCalendar(id: string): void
  setSettings(patch: Partial<typeof DEFAULT_SETTINGS>): void
  setContacts(contacts: Contact[]): Promise<void>
  setBirthdaysVisible(visible: boolean): void
  addPublicCalendar(input: PublicCalendar): void
  removePublicCalendar(token: string): void
  history: HistoryAction[]
  historyIndex: number
  canUndo(): boolean
  canRedo(): boolean
  pushHistory(action: HistoryAction): void
  undo(): Promise<void>
  redo(): Promise<void>
}

export interface PublicCalendar {
  token: string
  name: string
  color: string
}

const PUBLIC_KEY = 'calendar.publicCalendars'

function loadPublicCalendars(): PublicCalendar[] {
  try {
    return JSON.parse(localStorage.getItem(PUBLIC_KEY) ?? '[]') as PublicCalendar[]
  } catch {
    return []
  }
}

function savePublicCalendars(items: PublicCalendar[]): void {
  localStorage.setItem(PUBLIC_KEY, JSON.stringify(items))
}

const HISTORY_LIMIT = 50

/** Guards against out-of-order responses overwriting fresher data (lost update). */
// Incremented per refresh so stale responses can be discarded.
let refreshSeq = 0

const FULL_RANGE_FROM = '0000-01-01T00:00:00.000Z'
const FULL_RANGE_TO = '9999-12-31T23:59:59.999Z'

function isFullRange(from: string, to: string): boolean {
  return from === FULL_RANGE_FROM && to === FULL_RANGE_TO
}

function refreshAll(): Promise<void> {
  return useCalendar
    .getState()
    .refreshEvents(FULL_RANGE_FROM, FULL_RANGE_TO)
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
  viewHistory: [],
  calendars: loadCache()?.calendars ?? [],
  events: loadCache()?.events ?? [],
  trash: loadCache()?.trash ?? [],
  visibleCalendars: {},
  settings: { ...DEFAULT_SETTINGS, ...(loadCache()?.settings as Partial<typeof DEFAULT_SETTINGS> | undefined) },
  lastRange: null,
  publicCalendars: loadPublicCalendars(),
  birthdaysVisible: localStorage.getItem('calendar.birthdaysVisible') !== '0',  setView(view) {
    const { view: current } = get()
    if (current === view) return
    set((s) => ({ view, viewHistory: [...s.viewHistory, current].slice(-20) }))
  },
  backView() {
    const { viewHistory } = get()
    if (viewHistory.length === 0) return false
    const prev = viewHistory[viewHistory.length - 1]!
    set({ view: prev, viewHistory: viewHistory.slice(0, -1) })
    return true
  },
  setDate(date) {
    set({ date })
  },
  navigate(delta) {
    const { view, date } = get()
    const d = new Date(date)
    if (view === 'day') d.setDate(d.getDate() + delta)
    else if (view === 'week') d.setDate(d.getDate() + delta * 7)
    else if (view === 'month' || view === 'split') d.setMonth(d.getMonth() + delta)
    else if (view === 'year') d.setFullYear(d.getFullYear() + delta)
    else d.setDate(d.getDate() + delta)
    set({ date: d })
  },
  async refreshCalendars() {
    const token = useAuth.getState().token
    if (!token) return
    try {
      const calendars = (await window.calendarApi.calendars.list(token)) as Calendar[]
      saveCache({ calendars })
      set((s) => {
        const visibleCalendars = { ...s.visibleCalendars }
        for (const c of calendars) {
          if (visibleCalendars[c.id] === undefined) visibleCalendars[c.id] = c.visible
        }
        return { calendars, visibleCalendars }
      })
    } catch (err) {
      logError('refreshCalendars', err)
      if (errorInfo(err).code === 'NETWORK') useConnection.getState().setOnline(false)
    }
  },
  async refreshEvents(from, to) {
    const seq = ++refreshSeq
    const token = useAuth.getState().token
    if (!token) return [] as EventOccurrence[]
    try {
      const state = get()
      const visible = Object.entries(state.visibleCalendars)
        .filter(([, v]) => v)
        .map(([id]) => id)
      const hasVisibilityState = Object.keys(state.visibleCalendars).length > 0
      const publics = get().publicCalendars
      const [events, ...publicBatches] = await Promise.all([
        window.calendarApi.events.listOccurrences(token, from, to, hasVisibilityState ? visible : undefined) as Promise<EventOccurrence[]>,
        ...publics.map((pc, i) =>
          (window.calendarApi.public.getOccurrences(pc.token, from, to) as Promise<EventOccurrence[]>).catch(() => [] as EventOccurrence[])
            .then((occs) => occs.map((occ) => ({
              ...occ,
              event: { ...occ.event, id: `pub-${i}-${occ.event.id}`, calendarId: `pub-${i}`, feedId: 'public' }
            })))
        )
      ])
      const merged = [
        ...(events ?? []),
        ...publicBatches.flat(),
        // Birthdays are client-only; merge so views treat them like normal events.
        ...(state.birthdaysVisible ? birthdayOccurrences(parseContacts(state.settings.contacts), from, to) : [])
      ]
      // Drop responses that lost a refresh race (a slow old response must not clobber fresh data).
      if (seq !== refreshSeq) return merged
      set((s) => (isFullRange(from, to) ? { events: merged } : { events: merged, lastRange: { from, to } }))
      saveCache({ events: merged })
      scheduleReconcile()
      return merged
    } catch (err) {
      logError('refreshEvents', err)
      if (errorInfo(err).code === 'NETWORK') useConnection.getState().setOnline(false)
      return [] as EventOccurrence[]
    }
  },
  async refreshVisible() {
    const range = get().lastRange
    if (!range) return
    await get().refreshEvents(range.from, range.to)
  },
  async duplicateEvent(event, occurrence) {
    const token = useAuth.getState().token
    if (!token) return
    const allDay = occurrence?.allDay ?? event.allDay
    const input: EventInput = {
      calendarId: event.calendarId,
      title: event.title,
      description: event.description,
      location: event.location,
      allDay,
      startsAt: allDay ? undefined : (occurrence?.start ?? event.startsAt),
      endsAt: allDay ? undefined : (occurrence?.end ?? event.endsAt),
      startDate: allDay ? (occurrence?.start.slice(0, 10) ?? event.startDate) : undefined,
      endDate: allDay ? (occurrence?.end.slice(0, 10) ?? event.endDate) : undefined,
      color: event.color,
      busy: event.busy,
      rrule: occurrence ? undefined : event.rrule
    }
    const created = (await window.calendarApi.events.create(token, input)) as { id: string }
    get().pushHistory({ op: 'create', eventId: created.id, after: input })
    toast('Event duplicated')
    await get().refreshVisible()
  },
  async refreshTrash() {
    const token = useAuth.getState().token
    if (!token) return
    try {
      const trash = (await window.calendarApi.events.trash(token)) as Event[]
      set({ trash: trash ?? [] })
      saveCache({ trash: trash ?? [] })
    } catch {
      set({ trash: [] })
    }
  },
  async restoreTrashed(id) {
    const token = useAuth.getState().token
    if (!token) return
    try {
      await window.calendarApi.events.restore(token, id)
      toast('Event restored')
      await Promise.all([get().refreshTrash(), get().refreshVisible()])
    } catch (err) {
      logError('restoreTrashed', err)
      toastError(err)
    }
  },
  async purgeTrashed(id) {
    const token = useAuth.getState().token
    if (!token) return
    try {
      await window.calendarApi.events.purge(token, id)
      toast('Event deleted permanently')
      await get().refreshTrash()
    } catch (err) {
      logError('purgeTrashed', err)
      toastError(err)
    }
  },
  toggleCalendar(id) {
    set((s) => ({ visibleCalendars: { ...s.visibleCalendars, [id]: !s.visibleCalendars[id] } }))
    void get().refreshVisible()
  },
  addPublicCalendar(input) {
    set((s) => {
      const items = [...s.publicCalendars.filter((p) => p.token !== input.token), input]
      savePublicCalendars(items)
      return { publicCalendars: items }
    })
    void refreshAll()
  },
  removePublicCalendar(token) {
    set((s) => {
      const items = s.publicCalendars.filter((p) => p.token !== token)
      savePublicCalendars(items)
      return { publicCalendars: items }
    })
    void refreshAll()
  },
  setSettings(patch) {
    set((s) => ({ settings: { ...s.settings, ...patch } }))
    saveCache({ settings: { ...useCalendar.getState().settings, ...patch } })
  },
  async setContacts(contacts) {
    // Optimistic save; refreshVisible re-merges birthday occurrences.
    const token = useAuth.getState().token
    const json = serializeContacts(contacts)
    set((s) => ({ settings: { ...s.settings, contacts: json } }))
    saveCache({ settings: useCalendar.getState().settings })
    if (!token) return
    try {
      await window.calendarApi.settings.set(token, 'contacts', json)
      scheduleReconcile()
      await get().refreshVisible()
    } catch (err) {
      logError('setContacts', err)
      toastError(err)
    }
  },
  setBirthdaysVisible(visible) {
    // Device-local preference; not synced to the server.
    localStorage.setItem('calendar.birthdaysVisible', visible ? '1' : '0')
    set({ birthdaysVisible: visible })
    void get().refreshVisible()
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
    try {
      await applyInverse(action)
    } catch (err) {
      logError('undo', err)
      toastError(err)
      return
    }
    set({ historyIndex: historyIndex - 1 })
    toast('Undo', 'info')
    await refreshAll()
  },
  async redo() {
    const { history, historyIndex } = get()
    if (historyIndex >= history.length) return
    const action = history[historyIndex]!
    try {
      await applyAction(action)
    } catch (err) {
      logError('redo', err)
      toastError(err)
      return
    }
    set({ historyIndex: historyIndex + 1 })
    toast('Redo', 'info')
    await refreshAll()
  }
}))

export type { EventDetail }
