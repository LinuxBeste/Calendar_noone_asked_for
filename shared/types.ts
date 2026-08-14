export interface Calendar {
  id: string
  name: string
  color: string
  description?: string
  visible: boolean
  defaultReminderMinutes?: number
  isDefault: boolean
  ownerId?: string
  ownerName?: string
  role?: 'owner' | 'editor' | 'viewer'
  createdAt: string
  updatedAt: string
}

export interface User {
  id: string
  email: string
  name: string
  createdAt: string
}

export interface Session {
  token: string
  userId: string
  expiresAt: string
}

export interface LoginResult {
  token: string
  user: User
}

export interface ShareInput {
  email: string
  role: 'viewer' | 'editor'
}

export interface ICalFeed {
  id: string
  calendarId: string
  url: string
  ownerId: string
  lastFetchedAt?: string | null
  lastError?: string | null
  createdAt: string
}

export interface FeedInput {
  calendarId: string
  url: string
}

export interface CalendarLink {
  token: string
  calendarId: string
  createdBy: string
  createdAt: string
}

export interface PublicCalendarView {
  calendar: { id: string; name: string; color: string; description?: string }
  events: Event[]
}

export interface EventException {
  id: string
  eventId: string
  occurrence: string
  title?: string
  description?: string
  location?: string
  allDay?: boolean
  startsAt?: string
  endsAt?: string
  startDate?: string
  endDate?: string
  color?: string
  busy?: boolean
  deleted: boolean
}

export interface Event {
  id: string
  calendarId: string
  title: string
  description?: string
  location?: string
  allDay: boolean
  startsAt?: string
  endsAt?: string
  startDate?: string
  endDate?: string
  timezone?: string
  color?: string
  busy: boolean
  rrule?: string
  rruleTz?: string
  icon?: string
  feedId?: string
  createdAt: string
  updatedAt: string
  deletedAt?: string | null
}

export interface EventInput {
  calendarId: string
  title: string
  description?: string
  location?: string
  allDay?: boolean
  startsAt?: string
  endsAt?: string
  startDate?: string
  endDate?: string
  timezone?: string
  color?: string
  busy?: boolean
  rrule?: string
  rruleTz?: string
  icon?: string
}

export interface Attendee {
  id: string
  eventId: string
  name: string
  email?: string
  status: 'invited' | 'yes' | 'maybe' | 'no'
}

export interface Reminder {
  id: string
  eventId: string
  minutes: number
  sentAt?: string
}

export interface EventDetail extends Event {
  attendees: Attendee[]
  reminders: Reminder[]
  exceptions: EventException[]
}

export type ViewType = 'day' | 'week' | 'month' | 'year' | 'agenda' | 'split'

export interface AppSettings {
  firstDayOfWeek: 0 | 1
  timeFormat: '24h' | '12h'
  defaultView: ViewType
  workingHoursStart: number
  workingHoursEnd: number
  defaultEventDuration: number
  defaultReminderMinutes?: number
  timezone: string
  darkMode: 'light' | 'dark' | 'auto'
  showWeekNumbers: boolean
  [key: string]: unknown
}

export interface CalendarInput {
  name: string
  color: string
  description?: string
  visible?: boolean
  defaultReminderMinutes?: number
  isDefault?: boolean
}

export interface EventSearchQuery {
  query: string
  from?: string
  to?: string
  calendarIds?: string[]
  limit?: number
}

export interface EventOccurrence {
  event: Event
  exception?: EventException
  start: string
  end: string
  allDay: boolean
  isException: boolean
}
