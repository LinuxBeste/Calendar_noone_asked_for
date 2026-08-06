import 'dotenv/config'
import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import fastifyCors from '@fastify/cors'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
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
  await app.register(fastifyCors, { origin: true })
  await registerRoutes(app, { auth, calendars, events, ical, store, using: setup.using })

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
