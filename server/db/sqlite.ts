import Database from 'better-sqlite3'
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { eq, and, or, gt, lt, gte, lte, isNull, isNotNull, desc, sql, like } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import type { EventStore, AuthStore } from './storage'
import type { Calendar, Event, EventDetail, EventInput, CalendarInput, User, Session, EventException, Reminder, ICalFeed, CalendarLink } from '@shared/types'
import { calendars, events, eventExceptions, attendees, reminders, settings, users, sessions, calendarShares, icalFeeds, calendarLinks, pluginData } from './schema'

type Db = BetterSQLite3Database

const bool = (n: number | null | undefined): boolean => n === 1
const opt = <T>(v: T | null | undefined): T | undefined => v ?? undefined

const rowToCalendar = (r: typeof calendars.$inferSelect): Calendar => ({
  id: r.id,
  name: r.name,
  color: r.color,
  description: opt(r.description),
  visible: bool(r.visible),
  defaultReminderMinutes: opt(r.defaultReminderMinutes),
  isDefault: bool(r.isDefault),
  ownerId: opt(r.ownerId),
  createdAt: r.createdAt,
  updatedAt: r.updatedAt
})

const rowToEvent = (r: typeof events.$inferSelect): Event => ({
  id: r.id,
  calendarId: r.calendarId,
  title: r.title,
  description: opt(r.description),
  location: opt(r.location),
  allDay: bool(r.allDay),
  startsAt: opt(r.startsAt),
  endsAt: opt(r.endsAt),
  startDate: opt(r.startDate),
  endDate: opt(r.endDate),
  timezone: opt(r.timezone),
  color: opt(r.color),
  busy: bool(r.busy),
  rrule: opt(r.rrule),
  rruleTz: opt(r.rruleTz),
  icon: opt(r.icon),
  feedId: opt(r.feedId),
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
  deletedAt: opt(r.deletedAt)
})

const DEFAULTS = {
  name: 'Personal',
  color: '#1a73e8'
}

export class SqliteStore implements EventStore, AuthStore {
  private db: Db
  private raw: Database.Database

  constructor(dbPath: string) {
    const db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    this.raw = db
    this.db = drizzle(db)
  }

  /** Creates a consistent snapshot of the database file (SQLite online backup). */
  async backupTo(dest: string): Promise<void> {
    await this.raw.backup(dest)
  }

  async migrate(): Promise<void> {
    const ddl = [
      `CREATE TABLE IF NOT EXISTS calendars (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        color TEXT NOT NULL,
        description TEXT,
        visible INTEGER NOT NULL DEFAULT 1,
        default_reminder_minutes INTEGER,
        is_default INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        calendar_id TEXT NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT,
        location TEXT,
        all_day INTEGER NOT NULL DEFAULT 0,
        starts_at TEXT,
        ends_at TEXT,
        start_date TEXT,
        end_date TEXT,
        timezone TEXT,
        color TEXT,
        busy INTEGER NOT NULL DEFAULT 1,
        rrule TEXT,
        rrule_tz TEXT,
        icon TEXT,
        feed_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      )`,
      `CREATE INDEX IF NOT EXISTS idx_events_time ON events (starts_at, ends_at)`,
      `CREATE INDEX IF NOT EXISTS idx_events_calendar ON events (calendar_id)`,
      `CREATE TABLE IF NOT EXISTS event_exceptions (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        occurrence TEXT NOT NULL,
        title TEXT,
        description TEXT,
        location TEXT,
        all_day INTEGER,
        starts_at TEXT,
        ends_at TEXT,
        start_date TEXT,
        end_date TEXT,
        color TEXT,
        busy INTEGER,
        deleted INTEGER NOT NULL DEFAULT 0,
        UNIQUE (event_id, occurrence)
      )`,
      `CREATE TABLE IF NOT EXISTS attendees (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        email TEXT,
        status TEXT NOT NULL DEFAULT 'invited',
        UNIQUE (event_id, name)
      )`,
      `CREATE TABLE IF NOT EXISTS reminders (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        minutes INTEGER NOT NULL,
        sent_at TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS plugin_data (
        plugin_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        PRIMARY KEY (plugin_id, key)
      )`,
      `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id)`,
      `CREATE TABLE IF NOT EXISTS calendar_shares (
        calendar_id TEXT NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL DEFAULT 'viewer',
        PRIMARY KEY (calendar_id, user_id)
      )`,
      `CREATE TABLE IF NOT EXISTS ical_feeds (
        id TEXT PRIMARY KEY,
        calendar_id TEXT NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
        url TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        last_fetched_at TEXT,
        last_error TEXT,
        created_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS calendar_links (
        token TEXT PRIMARY KEY,
        calendar_id TEXT NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`
    ]
    for (const stmt of ddl) {
      this.db.run(sql.raw(stmt))
    }
    const cols = this.db.all(sql`PRAGMA table_info(calendars)`) as { name: string }[]
    if (!cols.some((c) => c.name === 'owner_id')) {
      this.db.run(sql.raw(`ALTER TABLE calendars ADD COLUMN owner_id TEXT`))
    }
    const evCols = this.db.all(sql`PRAGMA table_info(events)`) as { name: string }[]
    if (!evCols.some((c) => c.name === 'deleted_at')) {
      this.db.run(sql.raw(`ALTER TABLE events ADD COLUMN deleted_at TEXT`))
    }
    if (!evCols.some((c) => c.name === 'feed_id')) {
      this.db.run(sql.raw(`ALTER TABLE events ADD COLUMN feed_id TEXT`))
    }
    this.db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_events_feed ON events (feed_id)`))
    if (!evCols.some((c) => c.name === 'icon')) {
      this.db.run(sql.raw(`ALTER TABLE events ADD COLUMN icon TEXT`))
    }

    const count = this.db.select({ n: sql<number>`count(*)` }).from(calendars).get()
    if ((count?.n ?? 0) === 0) {
      const now = new Date().toISOString()
      this.db
        .insert(calendars)
        .values({ id: randomUUID(), ...DEFAULTS, visible: 1, isDefault: 1, createdAt: now, updatedAt: now })
        .run()
    }
  }

  async listCalendars(): Promise<Calendar[]> {
    const rows = this.db
      .select()
      .from(calendars)
      .orderBy(desc(calendars.isDefault), calendars.name)
      .all()
    return rows.map(rowToCalendar)
  }

  async getCalendar(id: string): Promise<Calendar | undefined> {
    const row = this.db.select().from(calendars).where(eq(calendars.id, id)).get()
    return row ? rowToCalendar(row) : undefined
  }

  async createCalendar(input: CalendarInput & { ownerId?: string }): Promise<Calendar> {
    const now = new Date().toISOString()
    const row = this.db
      .insert(calendars)
      .values({
        id: randomUUID(),
        name: input.name,
        color: input.color,
        description: input.description,
        visible: input.visible ?? true ? 1 : 0,
        defaultReminderMinutes: input.defaultReminderMinutes,
        isDefault: input.isDefault ?? false ? 1 : 0,
        ownerId: input.ownerId,
        createdAt: now,
        updatedAt: now
      })
      .returning()
      .get()
    return rowToCalendar(row)
  }

  async updateCalendar(id: string, input: Partial<CalendarInput>): Promise<Calendar> {
    const patch: Partial<typeof calendars.$inferInsert> = {}
    if (input.name !== undefined) patch.name = input.name
    if (input.color !== undefined) patch.color = input.color
    if (input.description !== undefined) patch.description = input.description
    if (input.visible !== undefined) patch.visible = input.visible ? 1 : 0
    if (input.defaultReminderMinutes !== undefined) patch.defaultReminderMinutes = input.defaultReminderMinutes
    if (input.isDefault !== undefined) patch.isDefault = input.isDefault ? 1 : 0
    if (Object.keys(patch).length === 0) return (await this.getCalendar(id))!
    patch.updatedAt = new Date().toISOString()
    const row = this.db.update(calendars).set(patch).where(eq(calendars.id, id)).returning().get()
    return rowToCalendar(row)
  }

  async deleteCalendar(id: string): Promise<void> {
    this.db.delete(calendars).where(eq(calendars.id, id)).run()
  }

  async listEvents(from: string, to: string, calendarIds?: string[]): Promise<Event[]> {
    const timed = and(
      isNotNull(events.startsAt),
      lt(events.startsAt, to),
      gt(events.endsAt, from)
    )
    const allDay = and(
      isNotNull(events.startDate),
      lte(events.startDate, to),
      gte(sql`COALESCE(${events.endDate}, ${events.startDate})`, from)
    )
    let where = and(isNull(events.deletedAt), or(timed, allDay))
    if (calendarIds && calendarIds.length > 0) {
      where = and(where, sql`${events.calendarId} IN (${sql.join(calendarIds, sql`, `)})`)
    }
    const rows = this.db.select().from(events).where(where).orderBy(events.startsAt).all()
    return rows.map(rowToEvent)
  }

  async getEvent(id: string): Promise<EventDetail | undefined> {
    const row = this.db.select().from(events).where(and(eq(events.id, id), isNull(events.deletedAt))).get()
    if (!row) return undefined
    const event = rowToEvent(row)
    const [attRows, remRows, excRows] = [
      this.db.select().from(attendees).where(eq(attendees.eventId, id)).all(),
      this.db.select().from(reminders).where(eq(reminders.eventId, id)).all(),
      this.db.select().from(eventExceptions).where(eq(eventExceptions.eventId, id)).all()
    ]
    return {
      ...event,
      attendees: attRows.map((a) => ({
        id: a.id,
        eventId: a.eventId,
        name: a.name,
        email: opt(a.email),
        status: a.status as 'invited' | 'yes' | 'maybe' | 'no'
      })),
      reminders: remRows.map((rm) => ({ id: rm.id, eventId: rm.eventId, minutes: rm.minutes, sentAt: opt(rm.sentAt) })),
      exceptions: excRows.map((ex) => ({
        id: ex.id,
        eventId: ex.eventId,
        occurrence: ex.occurrence,
        title: opt(ex.title),
        description: opt(ex.description),
        location: opt(ex.location),
        allDay: ex.allDay === null ? undefined : ex.allDay === 1,
        startsAt: opt(ex.startsAt),
        endsAt: opt(ex.endsAt),
        startDate: opt(ex.startDate),
        endDate: opt(ex.endDate),
        color: opt(ex.color),
        busy: ex.busy === null ? undefined : ex.busy === 1,
        deleted: ex.deleted === 1
      }))
    }
  }

  async createEvent(input: EventInput & { feedId?: string }): Promise<Event> {
    const now = new Date().toISOString()
    const row = this.db
      .insert(events)
      .values({
        id: randomUUID(),
        calendarId: input.calendarId,
        title: input.title,
        description: input.description,
        location: input.location,
        allDay: input.allDay ?? false ? 1 : 0,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        startDate: input.startDate,
        endDate: input.endDate,
        timezone: input.timezone,
        color: input.color,
        busy: input.busy ?? true ? 1 : 0,
        rrule: input.rrule,
        rruleTz: input.rruleTz,
        icon: input.icon,
        feedId: input.feedId,
        createdAt: now,
        updatedAt: now
      })
      .returning()
      .get()
    return rowToEvent(row)
  }

  async updateEvent(id: string, input: Partial<EventInput>): Promise<Event> {
    const patch: Partial<typeof events.$inferInsert> = {}
    if (input.calendarId !== undefined) patch.calendarId = input.calendarId
    if (input.title !== undefined) patch.title = input.title
    if (input.description !== undefined) patch.description = input.description
    if (input.location !== undefined) patch.location = input.location
    if (input.allDay !== undefined) patch.allDay = input.allDay ? 1 : 0
    if (input.startsAt !== undefined) patch.startsAt = input.startsAt
    if (input.endsAt !== undefined) patch.endsAt = input.endsAt
    if (input.startDate !== undefined) patch.startDate = input.startDate
    if (input.endDate !== undefined) patch.endDate = input.endDate
    if (input.timezone !== undefined) patch.timezone = input.timezone
    if (input.color !== undefined) patch.color = input.color
    if (input.busy !== undefined) patch.busy = input.busy ? 1 : 0
    if (input.rrule !== undefined) patch.rrule = input.rrule
    if (input.rruleTz !== undefined) patch.rruleTz = input.rruleTz
    if (input.icon !== undefined) patch.icon = input.icon
    if ((input as { feedId?: string }).feedId !== undefined) patch.feedId = (input as { feedId?: string }).feedId
    if (Object.keys(patch).length === 0) return (await this.getEvent(id))!
    patch.updatedAt = new Date().toISOString()
    const row = this.db.update(events).set(patch).where(eq(events.id, id)).returning().get()
    return rowToEvent(row)
  }

  async deleteEvent(id: string): Promise<void> {
    this.db.update(events).set({ deletedAt: new Date().toISOString() }).where(eq(events.id, id)).run()
  }

  async restoreEvent(id: string): Promise<void> {
    this.db.update(events).set({ deletedAt: null }).where(eq(events.id, id)).run()
  }

  async purgeEvent(id: string): Promise<void> {
    this.db.delete(reminders).where(eq(reminders.eventId, id)).run()
    this.db.delete(events).where(eq(events.id, id)).run()
  }

  async listTrashedEvents(): Promise<Event[]> {
    const rows = this.db
      .select()
      .from(events)
      .where(isNotNull(events.deletedAt))
      .orderBy(desc(events.deletedAt))
      .all()
    return rows.map(rowToEvent)
  }

  async listExceptions(eventId: string): Promise<EventException[]> {
    const rows = this.db.select().from(eventExceptions).where(eq(eventExceptions.eventId, eventId)).all()
    return rows.map((ex) => ({
      id: ex.id,
      eventId: ex.eventId,
      occurrence: ex.occurrence,
      title: opt(ex.title),
      description: opt(ex.description),
      location: opt(ex.location),
      allDay: ex.allDay === null ? undefined : ex.allDay === 1,
      startsAt: opt(ex.startsAt),
      endsAt: opt(ex.endsAt),
      startDate: opt(ex.startDate),
      endDate: opt(ex.endDate),
      color: opt(ex.color),
      busy: ex.busy === null ? undefined : ex.busy === 1,
      deleted: ex.deleted === 1
    }))
  }

  async upsertException(
    eventId: string,
    input: Partial<Omit<EventException, 'id' | 'eventId'>> & { occurrence: string; deleted?: boolean }
  ): Promise<EventException> {
    const existing = this.db.select().from(eventExceptions).where(and(eq(eventExceptions.eventId, eventId), eq(eventExceptions.occurrence, input.occurrence))).get()
    const patch: Partial<typeof eventExceptions.$inferInsert> = { ...existing }
    const map: Record<string, unknown> = {
      title: input.title,
      description: input.description,
      location: input.location,
      allDay: input.allDay === undefined ? patch.allDay : input.allDay ? 1 : 0,
      startsAt: input.startsAt ?? patch.startsAt,
      endsAt: input.endsAt ?? patch.endsAt,
      startDate: input.startDate ?? patch.startDate,
      endDate: input.endDate ?? patch.endDate,
      color: input.color ?? patch.color,
      busy: input.busy === undefined ? patch.busy : input.busy ? 1 : 0,
      deleted: input.deleted === undefined ? patch.deleted : input.deleted ? 1 : 0
    }
    const values = {
      id: existing?.id ?? randomUUID(),
      eventId,
      occurrence: input.occurrence,
      ...map
    }
    this.db
      .insert(eventExceptions)
      .values(values as typeof eventExceptions.$inferInsert)
      .onConflictDoUpdate({
        target: [eventExceptions.eventId, eventExceptions.occurrence],
        set: Object.fromEntries(
          Object.entries(map).map(([k, v]) => [k, v as never])
        )
      })
      .run()
    return (await this.listExceptions(eventId)).find((e) => e.occurrence === input.occurrence)!
  }

  async deleteException(id: string): Promise<void> {
    this.db.delete(eventExceptions).where(eq(eventExceptions.id, id)).run()
  }

  async createReminder(eventId: string, minutes: number): Promise<{ id: string; eventId: string; minutes: number }> {
    const id = randomUUID()
    this.db.insert(reminders).values({ id, eventId, minutes }).run()
    return { id, eventId, minutes }
  }

  async listReminders(eventId: string): Promise<Reminder[]> {
    return this.db.select().from(reminders).where(eq(reminders.eventId, eventId)).all() as unknown as Reminder[]
  }

  async getReminder(id: string): Promise<{ id: string; eventId: string; minutes: number } | null> {
    const row = this.db.select({ id: reminders.id, eventId: reminders.eventId, minutes: reminders.minutes }).from(reminders).where(eq(reminders.id, id)).get()
    return row ?? null
  }

  async deleteReminder(id: string): Promise<void> {
    this.db.delete(reminders).where(eq(reminders.id, id)).run()
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
    const rows = this.db
      .select({
        id: reminders.id,
        eventId: reminders.eventId,
        minutes: reminders.minutes,
        startsAt: events.startsAt,
        title: events.title,
        calendarName: calendars.name
      })
      .from(reminders)
      .innerJoin(events, eq(reminders.eventId, events.id))
      .innerJoin(calendars, eq(events.calendarId, calendars.id))
      .where(and(isNull(reminders.sentAt), isNull(events.deletedAt)))
      .all()
    return this.collectDue(rows, now, lookAheadMinutes)
  }

  async listDueRemindersForUser(now: string, lookAheadMinutes: number, userId: string): Promise<{ id: string; eventId: string; minutes: number; startsAt?: string; title: string; calendarName: string }[]> {
    const rows = this.db
      .select({
        id: reminders.id,
        eventId: reminders.eventId,
        minutes: reminders.minutes,
        startsAt: events.startsAt,
        title: events.title,
        calendarName: calendars.name
      })
      .from(reminders)
      .innerJoin(events, eq(reminders.eventId, events.id))
      .innerJoin(calendars, eq(events.calendarId, calendars.id))
      .leftJoin(calendarShares, and(eq(calendarShares.calendarId, events.calendarId), eq(calendarShares.userId, userId)))
      .where(and(isNull(reminders.sentAt), isNull(events.deletedAt), or(eq(calendars.ownerId, userId), isNotNull(calendarShares.userId))))
      .all()
    return this.collectDue(rows, now, lookAheadMinutes)
  }

  async listUpcomingRemindersForUser(now: string, horizonMs: number, userId: string): Promise<{ id: string; eventId: string; minutes: number; startsAt: string; title: string; calendarName: string }[]> {
    const rows = this.db
      .select({
        id: reminders.id,
        eventId: reminders.eventId,
        minutes: reminders.minutes,
        startsAt: events.startsAt,
        title: events.title,
        calendarName: calendars.name
      })
      .from(reminders)
      .innerJoin(events, eq(reminders.eventId, events.id))
      .innerJoin(calendars, eq(events.calendarId, calendars.id))
      .leftJoin(calendarShares, and(eq(calendarShares.calendarId, events.calendarId), eq(calendarShares.userId, userId)))
      .where(and(isNull(reminders.sentAt), isNull(events.deletedAt), or(eq(calendars.ownerId, userId), isNotNull(calendarShares.userId))))
      .all()
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
    this.db.update(reminders).set({ sentAt: at }).where(eq(reminders.id, id)).run()
  }

  async searchEvents(query: string, opts?: { limit?: number; calendarIds?: string[] }): Promise<Event[]> {
    const like = `%${query}%`
    let where = and(
      isNull(events.deletedAt),
      or(
        sql`${events.title} LIKE ${like}`,
        sql`${events.description} LIKE ${like}`,
        sql`${events.location} LIKE ${like}`
      )
    )
    if (opts?.calendarIds && opts.calendarIds.length > 0) {
      where = and(where, sql`${events.calendarId} IN (${sql.join(opts.calendarIds, sql`, `)})`)
    }
    const rows = this.db
      .select()
      .from(events)
      .where(where)
      .orderBy(sql`${events.startsAt} IS NULL`, events.startsAt)
      .limit(opts?.limit ?? 20)
      .all()
    return rows.map(rowToEvent)
  }

  // ---- auth (multi-user) ----

  async createUser(input: { email: string; name: string; passwordHash: string }): Promise<User> {
    const id = randomUUID()
    const now = new Date().toISOString()
    this.db
      .insert(users)
      .values({ id, email: input.email, name: input.name, passwordHash: input.passwordHash, createdAt: now })
      .run()
    return { id, email: input.email, name: input.name, createdAt: now }
  }

  async getUserByEmail(email: string): Promise<(User & { passwordHash: string }) | undefined> {
    const row = this.db.select().from(users).where(eq(users.email, email)).get()
    return row
      ? { id: row.id, email: row.email, name: row.name, createdAt: row.createdAt, passwordHash: row.passwordHash }
      : undefined
  }

  async getUser(id: string): Promise<User | undefined> {
    const row = this.db.select().from(users).where(eq(users.id, id)).get()
    return row ? { id: row.id, email: row.email, name: row.name, createdAt: row.createdAt } : undefined
  }

  async createSession(token: string, userId: string, expiresAt: string): Promise<void> {
    this.db
      .insert(sessions)
      .values({ token, userId, createdAt: new Date().toISOString(), expiresAt })
      .run()
  }

  async getSession(token: string): Promise<Session | undefined> {
    const row = this.db.select().from(sessions).where(eq(sessions.token, token)).get()
    return row ? { token: row.token, userId: row.userId, expiresAt: row.expiresAt } : undefined
  }

  async deleteSession(token: string): Promise<void> {
    this.db.delete(sessions).where(eq(sessions.token, token)).run()
  }

  async deleteExpiredSessions(now: string): Promise<void> {
    this.db.delete(sessions).where(lt(sessions.expiresAt, now)).run()
  }

  async listShares(calendarId: string): Promise<{ userId: string; role: 'viewer' | 'editor' }[]> {
    const rows = this.db.select().from(calendarShares).where(eq(calendarShares.calendarId, calendarId)).all()
    return rows.map((r) => ({ userId: r.userId, role: r.role as 'viewer' | 'editor' }))
  }

  async getUserShares(userId: string): Promise<{ calendarId: string; role: 'viewer' | 'editor' }[]> {
    const rows = this.db.select().from(calendarShares).where(eq(calendarShares.userId, userId)).all()
    return rows.map((r) => ({ calendarId: r.calendarId, role: r.role as 'viewer' | 'editor' }))
  }

  async upsertShare(calendarId: string, userId: string, role: 'viewer' | 'editor'): Promise<void> {
    this.db
      .insert(calendarShares)
      .values({ calendarId, userId, role })
      .onConflictDoUpdate({ target: [calendarShares.calendarId, calendarShares.userId], set: { role } })
      .run()
  }

  async removeShare(calendarId: string, userId: string): Promise<void> {
    this.db
      .delete(calendarShares)
      .where(and(eq(calendarShares.calendarId, calendarId), eq(calendarShares.userId, userId)))
      .run()
  }

  async getSetting<T>(key: string): Promise<T | undefined> {
    const row = this.db.select().from(settings).where(eq(settings.key, key)).get()
    return row ? (JSON.parse(row.value) as T) : undefined
  }

  async setSetting<T>(key: string, value: T): Promise<void> {
    this.db
      .insert(settings)
      .values({ key, value: JSON.stringify(value) })
      .onConflictDoUpdate({ target: settings.key, set: { value: JSON.stringify(value) } })
      .run()
  }

  // ---- plugins ----
  async getPluginState(pluginId: string, userId: string): Promise<{ enabled: boolean; data: Record<string, unknown> }> {
    const rows = this.db
      .select()
      .from(pluginData)
      .where(and(eq(pluginData.pluginId, pluginId), like(pluginData.key, `user:${userId}:%`)))
      .all()
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
      this.db
        .insert(pluginData)
        .values({ pluginId, key: `user:${userId}:enabled`, value: patch.enabled ? 'true' : 'false' })
        .onConflictDoUpdate({ target: [pluginData.pluginId, pluginData.key], set: { value: patch.enabled ? 'true' : 'false' } })
        .run()
    }
    if (patch.data !== undefined) {
      this.db
        .insert(pluginData)
        .values({ pluginId, key: `user:${userId}:data`, value: JSON.stringify(patch.data) })
        .onConflictDoUpdate({ target: [pluginData.pluginId, pluginData.key], set: { value: JSON.stringify(patch.data) } })
        .run()
    }
  }

  async claimOwnerlessCalendars(userId: string): Promise<void> {
    this.db.update(calendars).set({ ownerId: userId }).where(isNull(calendars.ownerId)).run()
  }

  async listUsers(): Promise<User[]> {
    return this.db.select({ id: users.id, email: users.email, name: users.name, createdAt: users.createdAt }).from(users).all()
  }

  // ---- ICS feed subscriptions ----

  async createFeed(input: { id: string; calendarId: string; url: string; ownerId: string }): Promise<void> {
    this.db.insert(icalFeeds).values({
      id: input.id,
      calendarId: input.calendarId,
      url: input.url,
      ownerId: input.ownerId,
      createdAt: new Date().toISOString()
    }).run()
  }

  async listFeeds(ownerId: string): Promise<ICalFeed[]> {
    const rows = this.db.select().from(icalFeeds).where(eq(icalFeeds.ownerId, ownerId)).all()
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
    const r = this.db.select().from(icalFeeds).where(eq(icalFeeds.id, id)).get()
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
    this.db.delete(icalFeeds).where(eq(icalFeeds.id, id)).run()
    this.db.update(events).set({ feedId: null }).where(like(events.feedId, id + '|%')).run()
  }

  async updateFeedState(id: string, state: { lastFetchedAt: string; lastError?: string | null }): Promise<void> {
    this.db.update(icalFeeds).set({ lastFetchedAt: state.lastFetchedAt, lastError: state.lastError ?? null }).where(eq(icalFeeds.id, id)).run()
  }

  async findEventByFeedId(feedId: string): Promise<Event | undefined> {
    const r = this.db.select().from(events).where(eq(events.feedId, feedId)).get()
    if (!r) return undefined
    return rowToEvent(r)
  }

  // ---- public share links ----

  async createLink(link: { token: string; calendarId: string; createdBy: string }): Promise<void> {
    this.db.insert(calendarLinks).values({
      token: link.token,
      calendarId: link.calendarId,
      createdBy: link.createdBy,
      createdAt: new Date().toISOString()
    }).run()
  }

  async listLinks(calendarId: string): Promise<CalendarLink[]> {
    const rows = this.db.select().from(calendarLinks).where(eq(calendarLinks.calendarId, calendarId)).all()
    return rows.map((r) => ({ token: r.token, calendarId: r.calendarId, createdBy: r.createdBy, createdAt: r.createdAt }))
  }

  async getLinkByToken(token: string): Promise<CalendarLink | undefined> {
    const r = this.db.select().from(calendarLinks).where(eq(calendarLinks.token, token)).get()
    if (!r) return undefined
    return { token: r.token, calendarId: r.calendarId, createdBy: r.createdBy, createdAt: r.createdAt }
  }

  async deleteLink(token: string): Promise<void> {
    this.db.delete(calendarLinks).where(eq(calendarLinks.token, token)).run()
  }
}
