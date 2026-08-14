import { Pool } from 'pg'
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres'
import { eq, and, or, gt, lt, gte, lte, isNull, isNotNull, desc, ilike, like, sql } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import type { EventStore, AuthStore } from './storage'
import type { Calendar, Event, EventDetail, EventInput, CalendarInput, User, Session, EventException, Reminder, ICalFeed, CalendarLink } from '@shared/types'
import {
  pgCalendars,
  pgEvents,
  pgEventExceptions,
  pgAttendees,
  pgReminders,
  pgUsers,
  pgSessions,
  pgCalendarShares,
  pgSettings,
  pgIcalFeeds,
  pgCalendarLinks,
  pgPluginData
} from './schema'

type Db = NodePgDatabase

const opt = <T>(v: T | null | undefined): T | undefined => v ?? undefined

/** Upper bound for reminder lead times (mirrors validation.ts's 24h limit). */
const MAX_REMINDER_MINUTES = 24 * 60

const rowToCalendar = (r: typeof pgCalendars.$inferSelect): Calendar => ({
  id: r.id,
  name: r.name,
  color: r.color,
  description: opt(r.description),
  visible: r.visible,
  defaultReminderMinutes: opt(r.defaultReminderMinutes),
  isDefault: r.isDefault,
  ownerId: opt(r.ownerId),
  createdAt: r.createdAt,
  updatedAt: r.updatedAt
})

const rowToEvent = (r: typeof pgEvents.$inferSelect): Event => ({
  id: r.id,
  calendarId: r.calendarId,
  title: r.title,
  description: opt(r.description),
  location: opt(r.location),
  allDay: r.allDay,
  startsAt: opt(r.startsAt),
  endsAt: opt(r.endsAt),
  startDate: opt(r.startDate),
  endDate: opt(r.endDate),
  timezone: opt(r.timezone),
  color: opt(r.color),
  busy: r.busy,
  rrule: opt(r.rrule),
  rruleTz: opt(r.rruleTz),
  icon: opt(r.icon),
  feedId: opt(r.feedId),
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
  deletedAt: opt(r.deletedAt)
})

export class PgStore implements EventStore, AuthStore {
  private db: Db
  private pool: Pool

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString, max: 10 })
    this.db = drizzle(this.pool)
  }

  async migrate(): Promise<void> {
    await this.db.execute(sql`
      CREATE TABLE IF NOT EXISTS calendars (
        id UUID PRIMARY KEY,
        name TEXT NOT NULL,
        color TEXT NOT NULL,
        description TEXT,
        visible BOOLEAN NOT NULL DEFAULT TRUE,
        default_reminder_minutes INTEGER,
        is_default BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS events (
        id UUID PRIMARY KEY,
        calendar_id UUID NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT,
        location TEXT,
        all_day BOOLEAN NOT NULL DEFAULT FALSE,
        starts_at TEXT,
        ends_at TEXT,
        start_date TEXT,
        end_date TEXT,
        timezone TEXT,
        color TEXT,
        busy BOOLEAN NOT NULL DEFAULT TRUE,
        rrule TEXT,
        rrule_tz TEXT,
        icon TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      ALTER TABLE events ADD COLUMN IF NOT EXISTS deleted_at TEXT;
      ALTER TABLE events ADD COLUMN IF NOT EXISTS icon TEXT;
      ALTER TABLE events ADD COLUMN IF NOT EXISTS feed_id TEXT;
      CREATE INDEX IF NOT EXISTS idx_events_time ON events (starts_at, ends_at);
      CREATE INDEX IF NOT EXISTS idx_events_calendar ON events (calendar_id);
      CREATE TABLE IF NOT EXISTS event_exceptions (
        id UUID PRIMARY KEY,
        event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        occurrence TEXT NOT NULL,
        title TEXT,
        description TEXT,
        location TEXT,
        all_day BOOLEAN,
        starts_at TEXT,
        ends_at TEXT,
        start_date TEXT,
        end_date TEXT,
        color TEXT,
        busy BOOLEAN,
        deleted BOOLEAN NOT NULL DEFAULT FALSE,
        UNIQUE (event_id, occurrence)
      );
      CREATE TABLE IF NOT EXISTS attendees (
        id UUID PRIMARY KEY,
        event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        email TEXT,
        status TEXT NOT NULL DEFAULT 'invited',
        UNIQUE (event_id, name)
      );
      CREATE TABLE IF NOT EXISTS reminders (
        id UUID PRIMARY KEY,
        event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        minutes INTEGER NOT NULL,
        sent_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_reminders_sent ON reminders (sent_at, event_id);
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS plugin_data (
        plugin_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        PRIMARY KEY (plugin_id, key)
      );
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);
      ALTER TABLE calendars ADD COLUMN IF NOT EXISTS owner_id UUID;
      CREATE TABLE IF NOT EXISTS calendar_shares (
        calendar_id UUID NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL DEFAULT 'viewer',
        PRIMARY KEY (calendar_id, user_id)
      );
      CREATE TABLE IF NOT EXISTS ical_feeds (
        id UUID PRIMARY KEY,
        calendar_id UUID NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
        url TEXT NOT NULL,
        owner_id UUID NOT NULL,
        last_fetched_at TEXT,
        last_error TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS calendar_links (
        token TEXT PRIMARY KEY,
        calendar_id UUID NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
        created_by UUID NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_events_feed ON events (feed_id);
    `)

    const count = await this.db.select({ n: sql<number>`count(*)` }).from(pgCalendars)
    if ((count[0]?.n ?? 0) === 0) {
      const now = new Date().toISOString()
      await this.db
        .insert(pgCalendars)
        .values({ id: randomUUID(), name: 'Personal', color: '#1a73e8', visible: true, isDefault: true, createdAt: now, updatedAt: now })
    }
  }

  async listCalendars(): Promise<Calendar[]> {
    const rows = await this.db.select().from(pgCalendars).orderBy(desc(pgCalendars.isDefault), pgCalendars.name)
    return rows.map(rowToCalendar)
  }

  async getCalendar(id: string): Promise<Calendar | undefined> {
    const rows = await this.db.select().from(pgCalendars).where(eq(pgCalendars.id, id)).limit(1)
    return rows[0] ? rowToCalendar(rows[0]) : undefined
  }

  async createCalendar(input: CalendarInput & { ownerId?: string }): Promise<Calendar> {
    const now = new Date().toISOString()
    const rows = await this.db
      .insert(pgCalendars)
      .values({
        id: randomUUID(),
        name: input.name,
        color: input.color,
        description: input.description,
        visible: input.visible ?? true,
        defaultReminderMinutes: input.defaultReminderMinutes,
        isDefault: input.isDefault ?? false,
        ownerId: input.ownerId,
        createdAt: now,
        updatedAt: now
      })
      .returning()
    return rowToCalendar(rows[0]!)
  }

  async updateCalendar(id: string, input: Partial<CalendarInput>): Promise<Calendar> {
    const patch: Partial<typeof pgCalendars.$inferInsert> = {}
    if (input.name !== undefined) patch.name = input.name
    if (input.color !== undefined) patch.color = input.color
    if (input.description !== undefined) patch.description = input.description
    if (input.visible !== undefined) patch.visible = input.visible
    if (input.defaultReminderMinutes !== undefined) patch.defaultReminderMinutes = input.defaultReminderMinutes
    if (input.isDefault !== undefined) patch.isDefault = input.isDefault
    if (Object.keys(patch).length === 0) return (await this.getCalendar(id))!
    patch.updatedAt = new Date().toISOString()
    const rows = await this.db.update(pgCalendars).set(patch).where(eq(pgCalendars.id, id)).returning()
    return rowToCalendar(rows[0]!)
  }

  async deleteCalendar(id: string): Promise<void> {
    await this.db.delete(pgCalendars).where(eq(pgCalendars.id, id))
  }

  async listEvents(from: string, to: string, calendarIds?: string[]): Promise<Event[]> {
    const timed = and(isNotNull(pgEvents.startsAt), lt(pgEvents.startsAt, to), or(gt(pgEvents.endsAt, from), isNotNull(pgEvents.rrule)))
    const allDay = and(
      isNotNull(pgEvents.startDate),
      lte(pgEvents.startDate, to),
      or(gte(sql`COALESCE(${pgEvents.endDate}, ${pgEvents.startDate})`, from), isNotNull(pgEvents.rrule))
    )
    let where = and(isNull(pgEvents.deletedAt), or(timed, allDay))
    if (calendarIds && calendarIds.length > 0) {
      where = and(where, sql`${pgEvents.calendarId} IN (${sql.join(calendarIds, sql`, `)})`)
    }
    const rows = await this.db.select().from(pgEvents).where(where).orderBy(pgEvents.startsAt)
    return rows.map(rowToEvent)
  }

  async getEvent(id: string): Promise<EventDetail | undefined> {
    const rows = await this.db.select().from(pgEvents).where(and(eq(pgEvents.id, id), isNull(pgEvents.deletedAt))).limit(1)
    if (!rows[0]) return undefined
    const event = rowToEvent(rows[0])
    const [attRows, remRows, excRows] = await Promise.all([
      this.db.select().from(pgAttendees).where(eq(pgAttendees.eventId, id)),
      this.db.select().from(pgReminders).where(eq(pgReminders.eventId, id)),
      this.db.select().from(pgEventExceptions).where(eq(pgEventExceptions.eventId, id))
    ])
    return {
      ...event,
      attendees: attRows.map((a) => ({ id: a.id, eventId: a.eventId, name: a.name, email: opt(a.email), status: a.status as 'invited' | 'yes' | 'maybe' | 'no' })),
      reminders: remRows.map((rm) => ({ id: rm.id, eventId: rm.eventId, minutes: rm.minutes, sentAt: opt(rm.sentAt) })),
      exceptions: excRows.map((ex) => ({
        id: ex.id,
        eventId: ex.eventId,
        occurrence: ex.occurrence,
        title: opt(ex.title),
        description: opt(ex.description),
        location: opt(ex.location),
        allDay: ex.allDay ?? undefined,
        startsAt: opt(ex.startsAt),
        endsAt: opt(ex.endsAt),
        startDate: opt(ex.startDate),
        endDate: opt(ex.endDate),
        color: opt(ex.color),
        busy: ex.busy ?? undefined,
        deleted: ex.deleted
      }))
    }
  }

  async createEvent(input: EventInput & { feedId?: string }): Promise<Event> {
    const now = new Date().toISOString()
    const rows = await this.db
      .insert(pgEvents)
      .values({
        id: randomUUID(),
        calendarId: input.calendarId,
        title: input.title,
        description: input.description,
        location: input.location,
        allDay: input.allDay ?? false,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        startDate: input.startDate,
        endDate: input.endDate,
        timezone: input.timezone,
        color: input.color,
        busy: input.busy ?? true,
        rrule: input.rrule,
        rruleTz: input.rruleTz,
        icon: input.icon,
        feedId: input.feedId,
        createdAt: now,
        updatedAt: now
      })
      .returning()
    return rowToEvent(rows[0]!)
  }

  async updateEvent(id: string, input: Partial<EventInput>): Promise<Event> {
    const patch: Partial<typeof pgEvents.$inferInsert> = {}
    if (input.calendarId !== undefined) patch.calendarId = input.calendarId
    if (input.title !== undefined) patch.title = input.title
    if (input.description !== undefined) patch.description = input.description
    if (input.location !== undefined) patch.location = input.location
    if (input.allDay !== undefined) patch.allDay = input.allDay
    if (input.startsAt !== undefined) patch.startsAt = input.startsAt
    if (input.endsAt !== undefined) patch.endsAt = input.endsAt
    if (input.startDate !== undefined) patch.startDate = input.startDate
    if (input.endDate !== undefined) patch.endDate = input.endDate
    if (input.timezone !== undefined) patch.timezone = input.timezone
    if (input.color !== undefined) patch.color = input.color
    if (input.busy !== undefined) patch.busy = input.busy
    if (input.rrule !== undefined) patch.rrule = input.rrule
    if (input.rruleTz !== undefined) patch.rruleTz = input.rruleTz
    if (input.icon !== undefined) patch.icon = input.icon
    if ((input as { feedId?: string }).feedId !== undefined) patch.feedId = (input as { feedId?: string }).feedId
    if (Object.keys(patch).length === 0) return (await this.getEvent(id))!
    patch.updatedAt = new Date().toISOString()
    const rows = await this.db.update(pgEvents).set(patch).where(eq(pgEvents.id, id)).returning()
    return rowToEvent(rows[0]!)
  }

  async deleteEvent(id: string): Promise<void> {
    await this.db.update(pgEvents).set({ deletedAt: new Date().toISOString() }).where(eq(pgEvents.id, id))
  }

  async restoreEvent(id: string): Promise<void> {
    await this.db.update(pgEvents).set({ deletedAt: null }).where(eq(pgEvents.id, id))
  }

  async purgeEvent(id: string): Promise<void> {
    await this.db.delete(pgReminders).where(eq(pgReminders.eventId, id))
    await this.db.delete(pgEvents).where(eq(pgEvents.id, id))
  }

  async listTrashedEvents(): Promise<Event[]> {
    const rows = await this.db
      .select()
      .from(pgEvents)
      .where(isNotNull(pgEvents.deletedAt))
      .orderBy(desc(pgEvents.deletedAt))
    return rows.map(rowToEvent)
  }

  async listExceptions(eventId: string): Promise<EventException[]> {
    const rows = await this.db.select().from(pgEventExceptions).where(eq(pgEventExceptions.eventId, eventId))
    return rows.map((ex) => ({
      id: ex.id,
      eventId: ex.eventId,
      occurrence: ex.occurrence,
      title: opt(ex.title),
      description: opt(ex.description),
      location: opt(ex.location),
      allDay: ex.allDay ?? undefined,
      startsAt: opt(ex.startsAt),
      endsAt: opt(ex.endsAt),
      startDate: opt(ex.startDate),
      endDate: opt(ex.endDate),
      color: opt(ex.color),
      busy: ex.busy ?? undefined,
      deleted: ex.deleted
    }))
  }

  async upsertException(
    eventId: string,
    input: Partial<Omit<EventException, 'id' | 'eventId'>> & { occurrence: string; deleted?: boolean }
  ): Promise<EventException> {
    const rows = await this.db
      .insert(pgEventExceptions)
      .values({
        id: randomUUID(),
        eventId,
        occurrence: input.occurrence,
        title: input.title,
        description: input.description,
        location: input.location,
        allDay: input.allDay,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        startDate: input.startDate,
        endDate: input.endDate,
        color: input.color,
        busy: input.busy,
        deleted: input.deleted ?? false
      })
      .onConflictDoUpdate({
        target: [pgEventExceptions.eventId, pgEventExceptions.occurrence],
        set: {
          title: input.title,
          description: input.description,
          location: input.location,
          allDay: input.allDay,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          startDate: input.startDate,
          endDate: input.endDate,
          color: input.color,
          busy: input.busy,
          deleted: input.deleted ?? false
        }
      })
      .returning()
    const r = rows[0]!
    return {
      id: r.id,
      eventId: r.eventId,
      occurrence: r.occurrence,
      title: opt(r.title),
      description: opt(r.description),
      location: opt(r.location),
      allDay: r.allDay ?? undefined,
      startsAt: opt(r.startsAt),
      endsAt: opt(r.endsAt),
      startDate: opt(r.startDate),
      endDate: opt(r.endDate),
      color: opt(r.color),
      busy: r.busy ?? undefined,
      deleted: r.deleted
    }
  }

  async deleteException(id: string): Promise<void> {
    await this.db.delete(pgEventExceptions).where(eq(pgEventExceptions.id, id))
  }

  async createReminder(eventId: string, minutes: number): Promise<{ id: string; eventId: string; minutes: number }> {
    const rows = await this.db.insert(pgReminders).values({ id: randomUUID(), eventId, minutes }).returning()
    const r = rows[0]!
    return { id: r.id, eventId: r.eventId, minutes: r.minutes }
  }

  async listReminders(eventId: string): Promise<Reminder[]> {
    const rows = await this.db.select().from(pgReminders).where(eq(pgReminders.eventId, eventId))
    return rows as unknown as Reminder[]
  }

  async getReminder(id: string): Promise<{ id: string; eventId: string; minutes: number } | null> {
    const rows = await this.db.select({ id: pgReminders.id, eventId: pgReminders.eventId, minutes: pgReminders.minutes }).from(pgReminders).where(eq(pgReminders.id, id))
    return rows[0] ?? null
  }

  async deleteReminder(id: string): Promise<void> {
    await this.db.delete(pgReminders).where(eq(pgReminders.id, id))
  }

  private collectDue(
    rows: { id: string; eventId: string; minutes: number; startsAt: string | null; title: string; calendarName: string }[],
    now: string,
    lookAheadMinutes: number
  ): { id: string; eventId: string; minutes: number; startsAt: string; title: string; calendarName: string }[] {
    const due = new Date(now).getTime()
    const windowMs = lookAheadMinutes * 60000
    const dueList: { id: string; eventId: string; minutes: number; startsAt: string; title: string; calendarName: string }[] = []
    for (const r of rows) {
      if (!r.startsAt) continue
      const t = new Date(r.startsAt).getTime() - r.minutes * 60000
      if (t <= due && t > due - windowMs) dueList.push({ id: r.id, eventId: r.eventId, minutes: r.minutes, startsAt: r.startsAt, title: r.title, calendarName: r.calendarName })
    }
    return dueList
  }

  async listDueReminders(now: string, lookAheadMinutes: number): Promise<{ id: string; eventId: string; minutes: number; startsAt?: string; title: string; calendarName: string }[]> {
    const nowMs = new Date(now).getTime()
    const rows = await this.db
      .select({
        id: pgReminders.id,
        eventId: pgReminders.eventId,
        minutes: pgReminders.minutes,
        startsAt: pgEvents.startsAt,
        title: pgEvents.title,
        calendarName: pgCalendars.name
      })
      .from(pgReminders)
      .innerJoin(pgEvents, eq(pgReminders.eventId, pgEvents.id))
      .innerJoin(pgCalendars, eq(pgEvents.calendarId, pgCalendars.id))
      .where(
        and(
          isNull(pgReminders.sentAt),
          isNull(pgEvents.deletedAt),
          gt(pgEvents.startsAt, new Date(nowMs - lookAheadMinutes * 60000).toISOString()),
          lt(pgEvents.startsAt, new Date(nowMs + MAX_REMINDER_MINUTES * 60000).toISOString())
        )
      )
    return this.collectDue(rows, now, lookAheadMinutes)
  }

  async listDueRemindersForUser(now: string, lookAheadMinutes: number, userId: string): Promise<{ id: string; eventId: string; minutes: number; startsAt?: string; title: string; calendarName: string }[]> {
    const nowMs = new Date(now).getTime()
    const rows = await this.db
      .select({
        id: pgReminders.id,
        eventId: pgReminders.eventId,
        minutes: pgReminders.minutes,
        startsAt: pgEvents.startsAt,
        title: pgEvents.title,
        calendarName: pgCalendars.name
      })
      .from(pgReminders)
      .innerJoin(pgEvents, eq(pgReminders.eventId, pgEvents.id))
      .innerJoin(pgCalendars, eq(pgEvents.calendarId, pgCalendars.id))
      .leftJoin(pgCalendarShares, and(eq(pgCalendarShares.calendarId, pgEvents.calendarId), eq(pgCalendarShares.userId, userId)))
      .where(
        and(
          isNull(pgReminders.sentAt),
          isNull(pgEvents.deletedAt),
          or(eq(pgCalendars.ownerId, userId), isNotNull(pgCalendarShares.userId)),
          gt(pgEvents.startsAt, new Date(nowMs - lookAheadMinutes * 60000).toISOString()),
          lt(pgEvents.startsAt, new Date(nowMs + MAX_REMINDER_MINUTES * 60000).toISOString())
        )
      )
    return this.collectDue(rows, now, lookAheadMinutes)
  }

  async listUpcomingRemindersForUser(now: string, horizonMs: number, userId: string): Promise<{ id: string; eventId: string; minutes: number; startsAt: string; title: string; calendarName: string }[]> {
    const nowMs = new Date(now).getTime()
    const rows = await this.db
      .select({
        id: pgReminders.id,
        eventId: pgReminders.eventId,
        minutes: pgReminders.minutes,
        startsAt: pgEvents.startsAt,
        title: pgEvents.title,
        calendarName: pgCalendars.name
      })
      .from(pgReminders)
      .innerJoin(pgEvents, eq(pgReminders.eventId, pgEvents.id))
      .innerJoin(pgCalendars, eq(pgEvents.calendarId, pgCalendars.id))
      .leftJoin(pgCalendarShares, and(eq(pgCalendarShares.calendarId, pgEvents.calendarId), eq(pgCalendarShares.userId, userId)))
      .where(
        and(
          isNull(pgReminders.sentAt),
          isNull(pgEvents.deletedAt),
          or(eq(pgCalendars.ownerId, userId), isNotNull(pgCalendarShares.userId)),
          gt(pgEvents.startsAt, new Date(nowMs - MAX_REMINDER_MINUTES * 60000).toISOString()),
          lt(pgEvents.startsAt, new Date(nowMs + horizonMs + MAX_REMINDER_MINUTES * 60000).toISOString())
        )
      )
    return this.collectUpcoming(rows, now, horizonMs)
  }

  private collectUpcoming(
    rows: { id: string; eventId: string; minutes: number; startsAt: string | null; title: string; calendarName: string }[],
    now: string,
    horizonMs: number
  ): { id: string; eventId: string; minutes: number; startsAt: string; title: string; calendarName: string }[] {
    const due = new Date(now).getTime()
    const list: { id: string; eventId: string; minutes: number; startsAt: string; title: string; calendarName: string }[] = []
    for (const r of rows) {
      if (!r.startsAt) continue
      const t = new Date(r.startsAt).getTime() - r.minutes * 60000
      if (t > due && t <= due + horizonMs) list.push({ id: r.id, eventId: r.eventId, minutes: r.minutes, startsAt: r.startsAt, title: r.title, calendarName: r.calendarName })
    }
    return list
  }

  async markReminderSent(id: string, at: string): Promise<void> {
    await this.db.update(pgReminders).set({ sentAt: at }).where(eq(pgReminders.id, id))
  }

  async searchEvents(query: string, opts?: { limit?: number; calendarIds?: string[] }): Promise<Event[]> {
    const pattern = `%${query}%`
    let where = and(
      isNull(pgEvents.deletedAt),
      or(
        ilike(pgEvents.title, pattern),
        ilike(pgEvents.description, pattern),
        ilike(pgEvents.location, pattern)
      )
    )
    if (opts?.calendarIds && opts.calendarIds.length > 0) {
      where = and(where, sql`${pgEvents.calendarId} IN (${sql.join(opts.calendarIds, sql`, `)})`)
    }
    const rows = await this.db
      .select()
      .from(pgEvents)
      .where(where)
      .orderBy(sql`${pgEvents.startsAt} IS NULL`, pgEvents.startsAt)
      .limit(opts?.limit ?? 20)
    return rows.map(rowToEvent)
  }

  async close(): Promise<void> {
    await this.pool.end()
  }

  // ---- auth (multi-user) ----

  async createUser(input: { email: string; name: string; passwordHash: string }): Promise<User> {
    const now = new Date().toISOString()
    const rows = await this.db
      .insert(pgUsers)
      .values({ id: randomUUID(), email: input.email, name: input.name, passwordHash: input.passwordHash, createdAt: now })
      .returning()
    const r = rows[0]!
    return { id: r.id, email: r.email, name: r.name, createdAt: r.createdAt }
  }

  async getUserByEmail(email: string): Promise<(User & { passwordHash: string }) | undefined> {
    const rows = await this.db.select().from(pgUsers).where(eq(pgUsers.email, email)).limit(1)
    const r = rows[0]
    return r
      ? { id: r.id, email: r.email, name: r.name, createdAt: r.createdAt, passwordHash: r.passwordHash }
      : undefined
  }

  async getUser(id: string): Promise<User | undefined> {
    const rows = await this.db.select().from(pgUsers).where(eq(pgUsers.id, id)).limit(1)
    const r = rows[0]
    return r ? { id: r.id, email: r.email, name: r.name, createdAt: r.createdAt } : undefined
  }

  async createSession(token: string, userId: string, expiresAt: string): Promise<void> {
    await this.db
      .insert(pgSessions)
      .values({ token, userId, createdAt: new Date().toISOString(), expiresAt })
  }

  async getSession(token: string): Promise<Session | undefined> {
    const rows = await this.db.select().from(pgSessions).where(eq(pgSessions.token, token)).limit(1)
    const r = rows[0]
    return r ? { token: r.token, userId: r.userId, expiresAt: r.expiresAt } : undefined
  }

  async deleteSession(token: string): Promise<void> {
    await this.db.delete(pgSessions).where(eq(pgSessions.token, token))
  }

  async deleteExpiredSessions(now: string): Promise<void> {
    await this.db.delete(pgSessions).where(lt(pgSessions.expiresAt, now))
  }

  async listShares(calendarId: string): Promise<{ userId: string; role: 'viewer' | 'editor' }[]> {
    const rows = await this.db.select().from(pgCalendarShares).where(eq(pgCalendarShares.calendarId, calendarId))
    return rows.map((r) => ({ userId: r.userId, role: r.role as 'viewer' | 'editor' }))
  }

  async getUserShares(userId: string): Promise<{ calendarId: string; role: 'viewer' | 'editor' }[]> {
    const rows = await this.db.select().from(pgCalendarShares).where(eq(pgCalendarShares.userId, userId))
    return rows.map((r) => ({ calendarId: r.calendarId, role: r.role as 'viewer' | 'editor' }))
  }

  async upsertShare(calendarId: string, userId: string, role: 'viewer' | 'editor'): Promise<void> {
    await this.db
      .insert(pgCalendarShares)
      .values({ calendarId, userId, role })
      .onConflictDoUpdate({ target: [pgCalendarShares.calendarId, pgCalendarShares.userId], set: { role } })
  }

  async removeShare(calendarId: string, userId: string): Promise<void> {
    await this.db
      .delete(pgCalendarShares)
      .where(and(eq(pgCalendarShares.calendarId, calendarId), eq(pgCalendarShares.userId, userId)))
  }

  async getSetting<T>(key: string): Promise<T | undefined> {
    const rows = await this.db.select().from(pgSettings).where(eq(pgSettings.key, key)).limit(1)
    return rows[0] ? (JSON.parse(rows[0].value) as T) : undefined
  }

  async setSetting<T>(key: string, value: T): Promise<void> {
    await this.db
      .insert(pgSettings)
      .values({ key, value: JSON.stringify(value) })
      .onConflictDoUpdate({ target: pgSettings.key, set: { value: JSON.stringify(value) } })
  }

  // ---- plugins ----
  async getPluginState(pluginId: string, userId: string): Promise<{ enabled: boolean; data: Record<string, unknown> }> {
    const rows = await this.db
      .select()
      .from(pgPluginData)
      .where(and(eq(pgPluginData.pluginId, pluginId), like(pgPluginData.key, `user:${userId}:%`)))
      .limit(50)
    const read = (key: string): string | undefined => rows.find((r) => r.key === `user:${userId}:${key}`)?.value
    const enabled = read('enabled') === 'true'
    let data: Record<string, unknown> = {}
    const raw = read('data')
    if (raw) {
      try {
        data = JSON.parse(raw) as Record<string, unknown>
      } catch {
        // ignore malformed payloads
      }
    }
    return { enabled, data }
  }

  async setPluginState(pluginId: string, userId: string, patch: { enabled?: boolean; data?: Record<string, unknown> }): Promise<void> {
    if (patch.enabled !== undefined) {
      await this.db
        .insert(pgPluginData)
        .values({ pluginId, key: `user:${userId}:enabled`, value: patch.enabled ? 'true' : 'false' })
        .onConflictDoUpdate({ target: [pgPluginData.pluginId, pgPluginData.key], set: { value: patch.enabled ? 'true' : 'false' } })
    }
    if (patch.data !== undefined) {
      await this.db
        .insert(pgPluginData)
        .values({ pluginId, key: `user:${userId}:data`, value: JSON.stringify(patch.data) })
        .onConflictDoUpdate({ target: [pgPluginData.pluginId, pgPluginData.key], set: { value: JSON.stringify(patch.data) } })
    }
  }

  async claimOwnerlessCalendars(userId: string): Promise<void> {
    await this.db.update(pgCalendars).set({ ownerId: userId }).where(isNull(pgCalendars.ownerId))
  }

  async listUsers(): Promise<User[]> {
    return await this.db.select({ id: pgUsers.id, email: pgUsers.email, name: pgUsers.name, createdAt: pgUsers.createdAt }).from(pgUsers)
  }

  // ---- ICS feed subscriptions ----

  async createFeed(input: { id: string; calendarId: string; url: string; ownerId: string }): Promise<void> {
    await this.db.insert(pgIcalFeeds).values({
      id: input.id,
      calendarId: input.calendarId,
      url: input.url,
      ownerId: input.ownerId,
      createdAt: new Date().toISOString()
    })
  }

  async listFeeds(ownerId: string): Promise<ICalFeed[]> {
    const rows = await this.db.select().from(pgIcalFeeds).where(eq(pgIcalFeeds.ownerId, ownerId))
    return rows.map((r) => ({
      id: r.id,
      calendarId: r.calendarId,
      url: r.url,
      ownerId: r.ownerId,
      lastFetchedAt: opt(r.lastFetchedAt),
      lastError: opt(r.lastError),
      createdAt: r.createdAt
    }))
  }

  async getFeed(id: string): Promise<ICalFeed | undefined> {
    const rows = await this.db.select().from(pgIcalFeeds).where(eq(pgIcalFeeds.id, id))
    const r = rows[0]
    if (!r) return undefined
    return {
      id: r.id,
      calendarId: r.calendarId,
      url: r.url,
      ownerId: r.ownerId,
      lastFetchedAt: opt(r.lastFetchedAt),
      lastError: opt(r.lastError),
      createdAt: r.createdAt
    }
  }

  async deleteFeed(id: string): Promise<void> {
    await this.db.delete(pgIcalFeeds).where(eq(pgIcalFeeds.id, id))
    await this.db.update(pgEvents).set({ feedId: null }).where(like(pgEvents.feedId, id + '|%'))
  }

  async updateFeedState(id: string, state: { lastFetchedAt: string; lastError?: string | null }): Promise<void> {
    await this.db.update(pgIcalFeeds).set({ lastFetchedAt: state.lastFetchedAt, lastError: state.lastError ?? null }).where(eq(pgIcalFeeds.id, id))
  }

  async findEventByFeedId(feedId: string): Promise<Event | undefined> {
    const rows = await this.db.select().from(pgEvents).where(eq(pgEvents.feedId, feedId))
    return rows[0] ? rowToEvent(rows[0]) : undefined
  }

  // ---- public share links ----

  async createLink(link: { token: string; calendarId: string; createdBy: string }): Promise<void> {
    await this.db.insert(pgCalendarLinks).values({
      token: link.token,
      calendarId: link.calendarId,
      createdBy: link.createdBy,
      createdAt: new Date().toISOString()
    })
  }

  async listLinks(calendarId: string): Promise<CalendarLink[]> {
    const rows = await this.db.select().from(pgCalendarLinks).where(eq(pgCalendarLinks.calendarId, calendarId))
    return rows.map((r) => ({ token: r.token, calendarId: r.calendarId, createdBy: r.createdBy, createdAt: r.createdAt }))
  }

  async getLinkByToken(token: string): Promise<CalendarLink | undefined> {
    const rows = await this.db.select().from(pgCalendarLinks).where(eq(pgCalendarLinks.token, token))
    const r = rows[0]
    if (!r) return undefined
    return { token: r.token, calendarId: r.calendarId, createdBy: r.createdBy, createdAt: r.createdAt }
  }

  async deleteLink(token: string): Promise<void> {
    await this.db.delete(pgCalendarLinks).where(eq(pgCalendarLinks.token, token))
  }
}
