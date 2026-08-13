import type { Calendar, Event, EventDetail, EventInput, CalendarInput, User, Session, EventException, Reminder, ICalFeed, CalendarLink } from '@shared/types'

/**
 * Storage abstraction. Implemented by SqliteStore (embedded fallback)
 * and PgStore (PostgreSQL). All methods must be atomic (transactional).
 */
export interface EventStore {
  /** Create tables and run migrations. Idempotent. */
  migrate(): Promise<void>

  // ---- calendars ----
  listCalendars(): Promise<Calendar[]>
  getCalendar(id: string): Promise<Calendar | undefined>
  createCalendar(input: CalendarInput & { ownerId?: string }): Promise<Calendar>
  updateCalendar(id: string, input: Partial<CalendarInput>): Promise<Calendar>
  deleteCalendar(id: string): Promise<void>

  // ---- events ----
  listEvents(from: string, to: string, calendarIds?: string[]): Promise<Event[]>
  getEvent(id: string): Promise<EventDetail | undefined>
  createEvent(input: EventInput & { feedId?: string }): Promise<Event>
  updateEvent(id: string, input: Partial<EventInput>): Promise<Event>
  deleteEvent(id: string): Promise<void>
  restoreEvent(id: string): Promise<void>
  purgeEvent(id: string): Promise<void>
  listTrashedEvents(): Promise<Event[]>

  // ---- reminders ----
  createReminder(eventId: string, minutes: number): Promise<{ id: string; eventId: string; minutes: number }>
  listReminders(eventId: string): Promise<Reminder[]>
  getReminder(id: string): Promise<{ id: string; eventId: string; minutes: number } | null>
  deleteReminder(id: string): Promise<void>
  listDueReminders(now: string, lookAheadMinutes: number): Promise<{ id: string; eventId: string; minutes: number; startsAt?: string; title: string; calendarName: string }[]>
  listDueRemindersForUser(now: string, lookAheadMinutes: number, userId: string): Promise<{ id: string; eventId: string; minutes: number; startsAt?: string; title: string; calendarName: string }[]>
  listUpcomingRemindersForUser(now: string, horizonMs: number, userId: string): Promise<{ id: string; eventId: string; minutes: number; startsAt: string; title: string; calendarName: string }[]>
  markReminderSent(id: string, at: string): Promise<void>

  // ---- recurrence exceptions ----
  listExceptions(eventId: string): Promise<EventException[]>
  upsertException(eventId: string, input: Partial<Omit<EventException, 'id' | 'eventId'>> & { occurrence: string; deleted?: boolean }): Promise<EventException>
  deleteException(id: string): Promise<void>

  // ---- search ----
  searchEvents(query: string, opts?: { limit?: number; calendarIds?: string[] }): Promise<Event[]>
}

/** Storage for users, sessions and calendar shares (multi-user). */
export interface AuthStore {
  createUser(input: { email: string; name: string; passwordHash: string }): Promise<User>
  getUserByEmail(email: string): Promise<(User & { passwordHash: string }) | undefined>
  getUser(id: string): Promise<User | undefined>
  createSession(token: string, userId: string, expiresAt: string): Promise<void>
  getSession(token: string): Promise<Session | undefined>
  deleteSession(token: string): Promise<void>
  deleteExpiredSessions(now: string): Promise<void>
  listShares(calendarId: string): Promise<{ userId: string; role: 'viewer' | 'editor' }[]>
  getUserShares(userId: string): Promise<{ calendarId: string; role: 'viewer' | 'editor' }[]>
  upsertShare(calendarId: string, userId: string, role: 'viewer' | 'editor'): Promise<void>
  removeShare(calendarId: string, userId: string): Promise<void>
  getSetting<T>(key: string): Promise<T | undefined>
  setSetting<T>(key: string, value: T): Promise<void>

  // ---- plugins ----
  getPluginState(pluginId: string, userId: string): Promise<{ enabled: boolean; data: Record<string, unknown> }>
  setPluginState(pluginId: string, userId: string, patch: { enabled?: boolean; data?: Record<string, unknown> }): Promise<void>
  listUsers(): Promise<User[]>
  /** Assigns any ownerless calendars (e.g. the seeded default) to the given user. */
  claimOwnerlessCalendars(userId: string): Promise<void>

  // ---- ICS feed subscriptions ----
  createFeed(input: { id: string; calendarId: string; url: string; ownerId: string }): Promise<void>
  listFeeds(ownerId: string): Promise<ICalFeed[]>
  getFeed(id: string): Promise<ICalFeed | undefined>
  deleteFeed(id: string): Promise<void>
  updateFeedState(id: string, state: { lastFetchedAt: string; lastError?: string | null }): Promise<void>
  findEventByFeedId(feedId: string): Promise<Event | undefined>

  // ---- public share links ----
  createLink(link: { token: string; calendarId: string; createdBy: string }): Promise<void>
  listLinks(calendarId: string): Promise<CalendarLink[]>
  getLinkByToken(token: string): Promise<CalendarLink | undefined>
  deleteLink(token: string): Promise<void>
}

/**
 * Cache abstraction. Implemented by RedisCache (external server)
 * and InMemoryCache (embedded fallback, always available).
 */
export interface EventCache {
  getEvents(rangeKey: string): Promise<Event[] | undefined>
  setEvents(rangeKey: string, events: Event[], ttlSeconds?: number): Promise<void>
  invalidate(rangeKey: string): Promise<void>
  invalidateAll(): Promise<void>
  publish(channel: string, payload: unknown): Promise<void>
  subscribe(channel: string, handler: (payload: unknown) => void): Promise<() => void>
}
