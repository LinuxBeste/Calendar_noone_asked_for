import 'dotenv/config'
import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import fastifyCors from '@fastify/cors'
import fastifyWebsocket from '@fastify/websocket'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { readdir, unlink } from 'fs/promises'
import { tmpdir } from 'os'
import type { EventStore, AuthStore, EventCache } from './db/storage'
import { SqliteStore } from './db/sqlite'
import { PgStore } from './db/pg'
import { InMemoryCache } from './db/cache-memory'
import { RedisCache } from './db/cache-redis'
import { AuthService } from './services/auth'
import { CalendarService } from './services/calendar-service'
import { EventService } from './services/event-service'
import { ICalService } from './services/ical-service'
import { FeedService } from './services/feed-service'
import { LinkService } from './services/link-service'
import { WsHub } from './services/ws-hub'
import { registerRoutes } from './routes'

export const PORT = Number(process.env.CALENDAR_API_PORT ?? 3001)
export const HOST = process.env.CALENDAR_API_HOST ?? '0.0.0.0'
export const API_KEY = process.env.CALENDAR_API_KEY?.trim() || undefined

const DEFAULT_CORS_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173', 'https://localhost']

async function setupDatabase(): Promise<{ store: EventStore & AuthStore; cache: EventCache; using: string; dataDir: string }> {
  const pgUrl = process.env.CALENDAR_PG_URL
  if (pgUrl) {
    try {
      const store = new PgStore(pgUrl)
      await store.migrate()
      return { store, cache: await setupCache(), using: 'postgresql', dataDir: '' }
    } catch (err) {
      console.error('[db] PostgreSQL unavailable, falling back to SQLite:', err)
    }
  }
  const dataDir = process.env.CALENDAR_DATA_DIR ?? join(tmpdir(), 'calendar-server')
  mkdirSync(dataDir, { recursive: true })
  const store = new SqliteStore(join(dataDir, 'calendar.db'))
  await store.migrate()
  return { store, cache: await setupCache(), using: 'sqlite', dataDir }
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

async function bootstrap(): Promise<void> {
  const setup = await setupDatabase()
  const store = setup.store
  const auth = new AuthService(store)

  const calendars = new CalendarService(store, setup.cache)
  const perms = {
    assertCanRead: (userId: string, calendarId: string) => calendars.assertCanRead(userId, calendarId),
    assertCanWrite: (userId: string, calendarId: string) => calendars.assertCanWrite(userId, calendarId),
    listCalendarsForUser: (userId: string) => calendars.listCalendarsForUser(userId)
  }
  const events = new EventService(store, setup.cache, perms)
  const ical = new ICalService(store, setup.cache, perms)
  const feeds = new FeedService(store, setup.cache, { assertCanWrite: perms.assertCanWrite })
  const links = new LinkService(store, setup.cache, { assertCanRead: perms.assertCanRead })

  const app = Fastify({ logger: true })

  // CORS: only allow explicitly listed origins (browser clients). Same-origin
  // requests and non-browser clients (curl, Electron main) are unaffected.
  const corsOrigins = (process.env.CALENDAR_CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const allowed = corsOrigins.length > 0 ? corsOrigins : DEFAULT_CORS_ORIGINS
  await app.register(fastifyCors, {
    origin: (origin, cb) => {
      if (!origin || allowed.includes(origin)) cb(null, true)
      else cb(new Error('Origin not allowed'), false)
    }
  })
  await registerRoutes(app, { auth, calendars, events, ical, feeds, links, store, using: setup.using, apiKey: API_KEY })

  // ---- live updates (WebSocket) ----
  const hub = new WsHub(async (calendarId) => {
    const readers = new Set<string>()
    const cal = await store.getCalendar(calendarId)
    if (cal?.ownerId) readers.add(cal.ownerId)
    for (const share of await store.listShares(calendarId)) readers.add(share.userId)
    return [...readers]
  })
  await app.register(fastifyWebsocket)
  app.get('/ws', { websocket: true }, (connection, req) => {
    const token = String((req.query as { token?: string }).token ?? '')
    void auth
      .validateSession(token)
      .then((user) => {
        if (!user) {
          connection.close(4001, 'unauthorized')
          return
        }
        hub.add(connection, user.id)
      })
      .catch(() => connection.close(4001, 'unauthorized'))
  })
  await setup.cache.subscribe('events.changed', (payload) => void hub.broadcast(payload as { type: string; userId?: string; calendarId?: string }))
  await setup.cache.subscribe('calendars.changed', (payload) => void hub.broadcast(payload as { type: string; userId?: string; calendarId?: string }))
  console.log('[server] live updates enabled (ws://' + HOST + ':' + PORT + '/ws)')
  // ---- maintenance: trash purge + database backups ----
  const trashKeepDays = Math.max(1, Number(process.env.CALENDAR_TRASH_DAYS ?? 30))
  const trashSweep = setInterval(() => {
    events.purgeExpiredTrash(trashKeepDays).then((n) => {
      if (n > 0) console.log(`[maintenance] purged ${n} trashed event(s) older than ${trashKeepDays} day(s)`)
    }).catch((err) => console.error('[maintenance] trash purge failed:', err))
  }, 6 * 3600000)
  trashSweep.unref()

  // ---- ICS feed sync scheduler ----
  const feedIntervalMin = Math.max(5, Number(process.env.CALENDAR_FEED_INTERVAL_MIN ?? 15))
  const feedSync = setInterval(() => {
    feeds.syncAll().then(({ ok, failed }) => {
      console.log(`[feeds] synced ${ok} feed(s)${failed > 0 ? `, ${failed} failed` : ''}`)
    }).catch((err) => console.error('[feeds] sync run failed:', err))
  }, feedIntervalMin * 60000)
  feedSync.unref()

  let backupInterval: NodeJS.Timeout | null = null
  if (setup.using === 'sqlite' && store instanceof SqliteStore) {
    const backupDir = process.env.CALENDAR_BACKUPS_DIR ?? join(setup.dataDir, 'backups')
    mkdirSync(backupDir, { recursive: true })
    const backupKeep = Math.max(1, Number(process.env.CALENDAR_BACKUP_KEEP ?? 14))
    const stamp = (d: Date): string => {
      const p = (n: number): string => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
    }
    const runBackup = async (): Promise<void> => {
      try {
        const dest = join(backupDir, `calendar-${stamp(new Date())}.db`)
        await store.backupTo(dest)
        const files = (await readdir(backupDir)).filter((f) => f.endsWith('.db')).sort()
        for (const f of files.slice(0, -backupKeep)) {
          await unlink(join(backupDir, f)).catch(() => undefined)
        }
        console.log(`[maintenance] database backup written to ${dest} (keeping last ${backupKeep})`)
      } catch (err) {
        console.error('[maintenance] backup failed:', err)
      }
    }
    backupInterval = setInterval(() => void runBackup(), 86400000)
    backupInterval.unref()
    void runBackup()
  }

  if (!API_KEY) {
    app.log.warn('CALENDAR_API_KEY not set — reminder endpoints require an authenticated user session (dev mode)')
  }

  // Serve the built web client (SPA) when available
  const webDir = process.env.CALENDAR_WEB_DIR ?? join(process.cwd(), 'web', 'dist')
  if (existsSync(join(webDir, 'index.html'))) {
    await app.register(fastifyStatic, { root: webDir, wildcard: false })
    app.setNotFoundHandler((request, reply) => {
      const accept = request.headers.accept ?? ''
      if (request.method === 'GET' && (accept.includes('text/html') || accept === '*/*' || accept === '')) {
        return reply.type('text/html').sendFile('index.html')
      }
      reply.code(404).send({ error: 'Not found' })
    })
    console.log(`[server] serving web client from ${webDir}`)
  }

  try {
    await app.listen({ port: PORT, host: HOST })
    console.log(`[server] listening on http://${HOST}:${PORT} (storage: ${setup.using})`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

void bootstrap()
