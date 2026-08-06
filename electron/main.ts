import 'dotenv/config'
import { app, BrowserWindow, ipcMain, Notification, dialog } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'
import { readFile, writeFile } from 'fs/promises'
import type { EventStore, AuthStore, EventCache } from '@shared/storage'
import { SqliteStore } from './db/sqlite'
import { PgStore } from './db/pg'
import { InMemoryCache } from './db/cache-memory'
import { RedisCache } from './db/cache-redis'
import { AuthService } from './services/auth'
import { CalendarService } from './services/calendar-service'
import { EventService } from './services/event-service'
import { ICalService } from './services/ical-service'

const isDev = !!process.env.ELECTRON_RENDERER_URL

async function createWindow(): Promise<void> {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Calendar',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (isDev) {
    await win.loadURL(process.env.ELECTRON_RENDERER_URL!)
  } else {
    await win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

async function setupDatabase(): Promise<{ store: EventStore & AuthStore; cache: EventCache; using: string }> {
  const pgUrl = process.env.CALENDAR_PG_URL
  if (pgUrl) {
    try {
      const store = new PgStore(pgUrl)
      await store.migrate()
      return { store, cache: await setupCache(), using: 'postgresql' }
    } catch (err) {
      console.error('[db] PostgreSQL unavailable, falling back to SQLite:', err)
    }
  }
  const dataDir = app.getPath('userData')
  mkdirSync(dataDir, { recursive: true })
  const store = new SqliteStore(join(dataDir, 'calendar.db'))
  await store.migrate()
  return { store, cache: await setupCache(), using: 'sqlite' }
}

async function setupCache(): Promise<EventCache> {
  const redisUrl = process.env.CALENDAR_REDIS_URL
  if (redisUrl) {
    try {
      const cache = new RedisCache(redisUrl)
      if (await cache.ping()) return cache
      console.warn('[cache] Redis unreachable, using in-memory cache')
    } catch (err) {
      console.warn('[cache] Redis error, using in-memory cache:', err)
    }
  }
  return new InMemoryCache()
}

let auth: AuthService
let calendars: CalendarService
let events: EventService
let ical: ICalService
let store: EventStore & AuthStore
let reminderTimer: ReturnType<typeof setInterval> | null = null

function startReminderEngine(): void {
  if (reminderTimer) return
  const check = async (): Promise<void> => {
    const now = new Date().toISOString()
    const due = await store.listDueReminders(now, 5)
    for (const r of due) {
      const notif = new Notification({
        title: r.title,
        body: `Starting ${formatTime(new Date(r.startsAt!))} · ${r.calendarName}`,
        silent: false
      })
      notif.show()
      await store.markReminderSent(r.id, now)
    }
  }
  check().catch((err) => console.error('[reminders] check failed:', err))
  reminderTimer = setInterval(() => {
    check().catch((err) => console.error('[reminders] check failed:', err))
  }, 30_000)
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

async function bootstrap(): Promise<void> {
  const setup = await setupDatabase()
  store = setup.store
  auth = new AuthService(store)
  const perms = {
    assertCanRead: (userId: string, calendarId: string) => calendars.assertCanRead(userId, calendarId),
    assertCanWrite: (userId: string, calendarId: string) => calendars.assertCanWrite(userId, calendarId)
  }
  calendars = new CalendarService(store, setup.cache)
  events = new EventService(store, setup.cache, perms)
  ical = new ICalService(store, setup.cache, perms)
  startReminderEngine()
}

/** All IPC handlers require a valid session token; resolves to userId. */
async function withUser(token: string, fn: (userId: string) => unknown): Promise<unknown> {
  const user = await auth.validateSession(token)
  if (!user) throw new Error('Not authenticated')
  return fn(user.id)
}

function registerIpc(): void {
  // ---- auth ----
  ipcMain.handle('auth:register', (_e, payload: { email: string; name: string; password: string }) => auth.register(payload))
  ipcMain.handle('auth:login', (_e, payload: { email: string; password: string }) => auth.login(payload.email, payload.password))
  ipcMain.handle('auth:logout', (_e, payload: { token: string }) => auth.logout(payload.token))
  ipcMain.handle('auth:validate', (_e, payload: { token: string }) => auth.validateSession(payload.token))

  // ---- calendars ----
  ipcMain.handle('calendar:list', (_e, payload: { token: string }) => withUser(payload.token, (uid) => calendars.listCalendarsForUser(uid)))
  ipcMain.handle('calendar:create', (_e, payload: { token: string; input: unknown }) =>
    withUser(payload.token, (uid) => calendars.createCalendar(uid, payload.input as never)))
  ipcMain.handle('calendar:update', (_e, payload: { token: string; id: string; input: unknown }) =>
    withUser(payload.token, (uid) => calendars.updateCalendar(uid, payload.id, payload.input as never)))
  ipcMain.handle('calendar:delete', (_e, payload: { token: string; id: string }) =>
    withUser(payload.token, (uid) => calendars.deleteCalendar(uid, payload.id)))
  ipcMain.handle('calendar:share', (_e, payload: { token: string; calendarId: string; input: unknown }) =>
    withUser(payload.token, (uid) => auth.shareCalendar(payload.calendarId, uid, payload.input as never)))
  ipcMain.handle('calendar:unshare', (_e, payload: { token: string; calendarId: string; userId: string }) =>
    withUser(payload.token, (uid) => {
      void uid
      return auth.unshareCalendar(payload.calendarId, payload.userId)
    }))
  ipcMain.handle('calendar:shares', (_e, payload: { token: string; calendarId: string }) =>
    withUser(payload.token, (uid) => {
      void uid
      return auth.listShares(payload.calendarId)
    }))

  // ---- events ----
  ipcMain.handle('events:list', (_e, payload: { token: string; from: string; to: string; calendarIds?: string[] }) =>
    withUser(payload.token, (uid) => events.listEvents(uid, payload.from, payload.to, payload.calendarIds)))
  ipcMain.handle('events:get', (_e, payload: { token: string; id: string }) =>
    withUser(payload.token, (uid) => events.getEvent(uid, payload.id)))
  ipcMain.handle('events:create', (_e, payload: { token: string; input: unknown }) =>
    withUser(payload.token, (uid) => events.createEvent(uid, payload.input as never)))
  ipcMain.handle('events:update', (_e, payload: { token: string; id: string; input: unknown }) =>
    withUser(payload.token, (uid) => events.updateEvent(uid, payload.id, payload.input as never)))
  ipcMain.handle('events:delete', (_e, payload: { token: string; id: string }) =>
    withUser(payload.token, (uid) => events.deleteEvent(uid, payload.id)))
  ipcMain.handle('events:search', (_e, payload: { token: string; query: string; calendarIds?: string[]; limit?: number }) =>
    withUser(payload.token, (uid) => events.searchEvents(uid, payload.query, { calendarIds: payload.calendarIds, limit: payload.limit })))
  ipcMain.handle('events:listOccurrences', (_e, payload: { token: string; from: string; to: string; calendarIds?: string[] }) =>
    withUser(payload.token, (uid) => events.listOccurrencesForRange(uid, payload.from, payload.to, payload.calendarIds)))
  ipcMain.handle('events:occurrences', (_e, payload: { token: string; eventId: string; from: string; to: string }) =>
    withUser(payload.token, (uid) => events.listOccurrences(uid, payload.eventId, payload.from, payload.to)))
  ipcMain.handle('events:updateOccurrence', (_e, payload: { token: string; eventId: string; occurrence: string; input: unknown }) =>
    withUser(payload.token, (uid) => events.updateOccurrence(uid, payload.eventId, payload.occurrence, payload.input as never)))
  ipcMain.handle('events:deleteOccurrence', (_e, payload: { token: string; eventId: string; occurrence: string }) =>
    withUser(payload.token, (uid) => events.deleteOccurrence(uid, payload.eventId, payload.occurrence)))
  ipcMain.handle('events:splitSeries', (_e, payload: { token: string; eventId: string; occurrence: string; input: unknown }) =>
    withUser(payload.token, (uid) => events.splitSeries(uid, payload.eventId, payload.occurrence, payload.input as never)))

  // ---- reminders ----
  ipcMain.handle('reminders:create', (_e, payload: { token: string; eventId: string; minutes: number }) =>
    withUser(payload.token, (uid) => events.addReminder(uid, payload.eventId, payload.minutes)))
  ipcMain.handle('reminders:delete', (_e, payload: { token: string; id: string }) =>
    withUser(payload.token, (uid) => events.removeReminder(uid, payload.id)))

  // ---- iCal / backup ----
  ipcMain.handle('export:ical', async (_e, payload: { token: string; calendarIds?: string[] }) => {
    const uid = (await auth.validateSession(payload.token))?.id
    if (!uid) throw new Error('Not authenticated')
    const content = await ical.exportICal(uid, payload.calendarIds)
    const res = await dialog.showSaveDialog({ title: 'Export iCal', defaultPath: 'calendar.ics', filters: [{ name: 'iCalendar', extensions: ['ics'] }] })
    if (res.canceled || !res.filePath) return { canceled: true }
    await writeFile(res.filePath, content, 'utf8')
    return { canceled: false, filePath: res.filePath }
  })
  ipcMain.handle('import:ical', async (_e, payload: { token: string; calendarId: string }) => {
    const uid = (await auth.validateSession(payload.token))?.id
    if (!uid) throw new Error('Not authenticated')
    const res = await dialog.showOpenDialog({ title: 'Import iCal', filters: [{ name: 'iCalendar', extensions: ['ics'] }], properties: ['openFile'] })
    if (res.canceled || res.filePaths.length === 0) return { canceled: true }
    const content = await readFile(res.filePaths[0]!, 'utf8')
    const count = await ical.importICal(uid, payload.calendarId, content)
    return { canceled: false, count }
  })
  ipcMain.handle('export:json', async (_e, payload: { token: string }) => {
    const uid = (await auth.validateSession(payload.token))?.id
    if (!uid) throw new Error('Not authenticated')
    const content = await ical.exportJson(uid)
    const res = await dialog.showSaveDialog({ title: 'Export backup', defaultPath: 'calendar-backup.json', filters: [{ name: 'JSON', extensions: ['json'] }] })
    if (res.canceled || !res.filePath) return { canceled: true }
    await writeFile(res.filePath, content, 'utf8')
    return { canceled: false, filePath: res.filePath }
  })
  ipcMain.handle('import:json', async (_e, payload: { token: string }) => {
    const uid = (await auth.validateSession(payload.token))?.id
    if (!uid) throw new Error('Not authenticated')
    const res = await dialog.showOpenDialog({ title: 'Import backup', filters: [{ name: 'JSON', extensions: ['json'] }], properties: ['openFile'] })
    if (res.canceled || res.filePaths.length === 0) return { canceled: true }
    const content = await readFile(res.filePaths[0]!, 'utf8')
    const count = await ical.importJson(uid, content)
    return { canceled: false, count }
  })

  // ---- storage info ----
  ipcMain.handle('app:info', () => ({ using: process.env.CALENDAR_PG_URL ? 'postgresql' : 'sqlite' }))

  // ---- settings ----
  ipcMain.handle('settings:get', async (_e, payload: { token: string; key: string }) => {
    const user = await auth.validateSession(payload.token)
    if (!user) throw new Error('Not authenticated')
    return store.getSetting(`user:${user.id}:${payload.key}`)
  })
  ipcMain.handle('settings:set', async (_e, payload: { token: string; key: string; value: unknown }) => {
    const user = await auth.validateSession(payload.token)
    if (!user) throw new Error('Not authenticated')
    await store.setSetting(`user:${user.id}:${payload.key}`, payload.value)
  })
}

app.whenReady().then(async () => {
  await bootstrap()
  registerIpc()
  await createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
