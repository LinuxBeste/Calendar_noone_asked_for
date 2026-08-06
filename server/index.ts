import 'dotenv/config'
import Fastify from 'fastify'
import { join } from 'path'
import { mkdirSync } from 'fs'
import { tmpdir } from 'os'
import type { EventStore, AuthStore, EventCache } from '@shared/storage'
import { SqliteStore } from '../electron/db/sqlite'
import { PgStore } from '../electron/db/pg'
import { InMemoryCache } from '../electron/db/cache-memory'
import { RedisCache } from '../electron/db/cache-redis'
import { AuthService } from '../electron/services/auth'
import { CalendarService } from '../electron/services/calendar-service'
import { EventService } from '../electron/services/event-service'
import { ICalService } from '../electron/services/ical-service'
import { registerRoutes } from './routes'

export const PORT = Number(process.env.CALENDAR_API_PORT ?? 3001)
export const HOST = process.env.CALENDAR_API_HOST ?? '0.0.0.0'

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
  const dataDir = process.env.CALENDAR_DATA_DIR ?? join(tmpdir(), 'calendar-server')
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

async function bootstrap(): Promise<void> {
  const setup = await setupDatabase()
  const store = setup.store
  const auth = new AuthService(store)

  const calendars = new CalendarService(store, setup.cache)
  const perms = {
    assertCanRead: (userId: string, calendarId: string) => calendars.assertCanRead(userId, calendarId),
    assertCanWrite: (userId: string, calendarId: string) => calendars.assertCanWrite(userId, calendarId)
  }
  const events = new EventService(store, setup.cache, perms)
  const ical = new ICalService(store, setup.cache, perms)

  const app = Fastify({ logger: true })
  await registerRoutes(app, { auth, calendars, events, ical, store, using: setup.using })

  try {
    await app.listen({ port: PORT, host: HOST })
    console.log(`[server] listening on http://${HOST}:${PORT} (storage: ${setup.using})`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

void bootstrap()
