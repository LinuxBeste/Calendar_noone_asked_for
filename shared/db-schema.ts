import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { pgTable, uuid, text as pgText, boolean, integer as pgInteger } from 'drizzle-orm/pg-core'


/**
 * Schema definition shared by both dialects.
 * Column mapping stays identical: timestamps are TEXT (ISO 8601),
 * booleans map to SQLite INTEGER / PG BOOLEAN automatically.
 */

export const calendars = sqliteTable('calendars', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  color: text('color').notNull(),
  description: text('description'),
  visible: integer('visible').notNull().default(1),
  defaultReminderMinutes: integer('default_reminder_minutes'),
  isDefault: integer('is_default').notNull().default(0),
  ownerId: text('owner_id'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
})

export const events = sqliteTable('events', {
  id: text('id').primaryKey(),
  calendarId: text('calendar_id').notNull().references(() => calendars.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  location: text('location'),
  allDay: integer('all_day').notNull().default(0),
  startsAt: text('starts_at'),
  endsAt: text('ends_at'),
  startDate: text('start_date'),
  endDate: text('end_date'),
  timezone: text('timezone'),
  color: text('color'),
  busy: integer('busy').notNull().default(1),
  rrule: text('rrule'),
  rruleTz: text('rrule_tz'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
})

export const eventExceptions = sqliteTable('event_exceptions', {
  id: text('id').primaryKey(),
  eventId: text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  occurrence: text('occurrence').notNull(),
  title: text('title'),
  description: text('description'),
  location: text('location'),
  allDay: integer('all_day'),
  startsAt: text('starts_at'),
  endsAt: text('ends_at'),
  startDate: text('start_date'),
  endDate: text('end_date'),
  color: text('color'),
  busy: integer('busy'),
  deleted: integer('deleted').notNull().default(0)
})

export const attendees = sqliteTable('attendees', {
  id: text('id').primaryKey(),
  eventId: text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  email: text('email'),
  status: text('status').notNull().default('invited')
})

export const reminders = sqliteTable('reminders', {
  id: text('id').primaryKey(),
  eventId: text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  minutes: integer('minutes').notNull(),
  sentAt: text('sent_at')
})

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull()
})

export const pluginData = sqliteTable('plugin_data', {
  pluginId: text('plugin_id').notNull(),
  key: text('key').notNull(),
  value: text('value').notNull()
})

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  createdAt: text('created_at').notNull()
})

export const sessions = sqliteTable('sessions', {
  token: text('token').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: text('created_at').notNull(),
  expiresAt: text('expires_at').notNull()
})

export const calendarShares = sqliteTable('calendar_shares', {
  calendarId: text('calendar_id').notNull().references(() => calendars.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('viewer')
})

// ---------- PostgreSQL mirror ----------

export const pgCalendars = pgTable('calendars', {
  id: uuid('id').primaryKey(),
  name: pgText('name').notNull(),
  color: pgText('color').notNull(),
  description: pgText('description'),
  visible: boolean('visible').notNull().default(true),
  defaultReminderMinutes: pgInteger('default_reminder_minutes'),
  isDefault: boolean('is_default').notNull().default(false),
  ownerId: uuid('owner_id'),
  createdAt: pgText('created_at').notNull(),
  updatedAt: pgText('updated_at').notNull()
})

export const pgEvents = pgTable('events', {
  id: uuid('id').primaryKey(),
  calendarId: uuid('calendar_id').notNull().references(() => pgCalendars.id, { onDelete: 'cascade' }),
  title: pgText('title').notNull(),
  description: pgText('description'),
  location: pgText('location'),
  allDay: boolean('all_day').notNull().default(false),
  startsAt: pgText('starts_at'),
  endsAt: pgText('ends_at'),
  startDate: pgText('start_date'),
  endDate: pgText('end_date'),
  timezone: pgText('timezone'),
  color: pgText('color'),
  busy: boolean('busy').notNull().default(true),
  rrule: pgText('rrule'),
  rruleTz: pgText('rrule_tz'),
  createdAt: pgText('created_at').notNull(),
  updatedAt: pgText('updated_at').notNull()
})

export const pgEventExceptions = pgTable('event_exceptions', {
  id: uuid('id').primaryKey(),
  eventId: uuid('event_id').notNull().references(() => pgEvents.id, { onDelete: 'cascade' }),
  occurrence: pgText('occurrence').notNull(),
  title: pgText('title'),
  description: pgText('description'),
  location: pgText('location'),
  allDay: boolean('all_day'),
  startsAt: pgText('starts_at'),
  endsAt: pgText('ends_at'),
  startDate: pgText('start_date'),
  endDate: pgText('end_date'),
  color: pgText('color'),
  busy: boolean('busy'),
  deleted: boolean('deleted').notNull().default(false)
})

export const pgAttendees = pgTable('attendees', {
  id: uuid('id').primaryKey(),
  eventId: uuid('event_id').notNull().references(() => pgEvents.id, { onDelete: 'cascade' }),
  name: pgText('name').notNull(),
  email: pgText('email'),
  status: pgText('status').notNull().default('invited')
})

export const pgReminders = pgTable('reminders', {
  id: uuid('id').primaryKey(),
  eventId: uuid('event_id').notNull().references(() => pgEvents.id, { onDelete: 'cascade' }),
  minutes: pgInteger('minutes').notNull(),
  sentAt: pgText('sent_at')
})

export const pgSettings = pgTable('settings', {
  key: pgText('key').primaryKey(),
  value: pgText('value').notNull()
})

export const pgPluginData = pgTable('plugin_data', {
  pluginId: pgText('plugin_id').notNull(),
  key: pgText('key').notNull(),
  value: pgText('value').notNull()
})

export const pgUsers = pgTable('users', {
  id: uuid('id').primaryKey(),
  email: pgText('email').notNull().unique(),
  name: pgText('name').notNull(),
  passwordHash: pgText('password_hash').notNull(),
  createdAt: pgText('created_at').notNull()
})

export const pgSessions = pgTable('sessions', {
  token: pgText('token').primaryKey(),
  userId: uuid('user_id').notNull().references(() => pgUsers.id, { onDelete: 'cascade' }),
  createdAt: pgText('created_at').notNull(),
  expiresAt: pgText('expires_at').notNull()
})

export const pgCalendarShares = pgTable('calendar_shares', {
  calendarId: uuid('calendar_id').notNull().references(() => pgCalendars.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => pgUsers.id, { onDelete: 'cascade' }),
  role: pgText('role').notNull().default('viewer')
})
