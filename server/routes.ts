import { createHash, timingSafeEqual } from 'crypto'
import type { FastifyInstance, FastifyRequest, RouteGenericInterface } from 'fastify'
import type { EventStore, AuthStore } from './db/storage'
import type { AuthService } from './services/auth'
import { AuthError } from './services/auth'
import type { CalendarService } from './services/calendar-service'
import type { EventService } from './services/event-service'
import type { ICalService } from './services/ical-service'
import {
  ValidationError,
  validateCalendarInput,
  validateCalendarPatch,
  validateEventInput,
  validateEventPatch,
  validateShareInput,
  validateSetting,
  validateSearchQuery,
  capLimit,
  capDueWindow,
  validateRange,
  validateImportContent,
  validateReminderMinutes,
  normalizeEmail,
  validatePassword,
  validateName,
  validateId,
  LIMITS
} from './validation'
import { RateLimitError, createRateLimiter } from './rate-limit'

export interface Services {
  auth: AuthService
  calendars: CalendarService
  events: EventService
  ical: ICalService
  store: EventStore & AuthStore
  using: string
  /** System API key for the reminder endpoints (set via CALENDAR_API_KEY). */
  apiKey?: string
}

type Body<T> = FastifyRequest<{ Body: T }>
type Params<T> = FastifyRequest<{ Params: T }>
type Query<T> = FastifyRequest<{ Querystring: T }>
type Req<G extends RouteGenericInterface = RouteGenericInterface> = FastifyRequest<G>

const authLimiter = createRateLimiter({ max: 10, windowMs: 5 * 60_000 })

/** Extracts the bearer token from the Authorization header; throws when missing. */
function bearer(request: FastifyRequest): string {
  const header = request.headers.authorization
  if (!header?.startsWith('Bearer ')) throw new AuthError('Not authenticated')
  return header.slice('Bearer '.length)
}

/** Validates the session and runs fn with the userId. */
async function withUser<T>(services: Services, request: FastifyRequest, fn: (userId: string) => Promise<T> | T): Promise<T> {
  const user = await services.auth.validateSession(bearer(request))
  if (!user) throw new AuthError('Not authenticated')
  return fn(user.id)
}

/** Requires the caller to own the calendar. */
async function asOwner<T>(services: Services, request: FastifyRequest, calendarId: string, fn: (userId: string) => Promise<T> | T): Promise<T> {
  return withUser(services, request, async (userId) => {
    const calendar = await services.store.getCalendar(calendarId)
    if (!calendar || calendar.ownerId !== userId) throw new AuthError('You do not own this calendar')
    return fn(userId)
  })
}

function splitCsv(value?: string): string[] | undefined {
  return value?.split(',').filter(Boolean)
}

function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest()
  const hb = createHash('sha256').update(b).digest()
  return timingSafeEqual(ha, hb)
}

/** System poller (API key) or an authenticated user. */
async function reminderAccess(
  services: Services,
  request: FastifyRequest
): Promise<{ scope: 'system' } | { scope: 'user'; userId: string }> {
  const key = request.headers['x-api-key']
  if (typeof key === 'string' && key.length > 0) {
    if (services.apiKey && safeEqual(key, services.apiKey)) return { scope: 'system' }
    throw new AuthError('Invalid API key')
  }
  const header = request.headers.authorization
  if (header?.startsWith('Bearer ')) {
    const user = await services.auth.validateSession(header.slice('Bearer '.length))
    if (user) return { scope: 'user', userId: user.id }
  }
  throw new AuthError('Not authenticated')
}

export async function registerRoutes(app: FastifyInstance, services: Services): Promise<void> {
  const { auth, calendars, events, ical, store } = services

  app.addHook('onError', async (_request, reply, error) => {
    const status =
      error instanceof RateLimitError
        ? 429
        : error instanceof ValidationError
          ? 400
          : (error as Error).name === 'AuthError'
            ? 401
            : 400
    reply.status(status).send({ error: error instanceof Error ? error.message : 'Request failed' })
  })

  // ---- auth ----
  app.post('/auth/register', async (req: Body<{ email: string; name: string; password: string }>) => {
    authLimiter(req.ip)
    const email = normalizeEmail(req.body.email)
    validatePassword(req.body.password)
    const name = validateName(req.body.name)
    const result = await auth.register({ email, name, password: req.body.password })
    const existing = await calendars.listCalendarsForUser(result.user.id)
    if (existing.length === 0) {
      await calendars.createCalendar(result.user.id, { name: 'My calendar', color: '#1a73e8' })
    }
    return result
  })
  app.post('/auth/login', async (req: Body<{ email: string; password: string }>) => {
    authLimiter(req.ip)
    normalizeEmail(req.body.email)
    if (typeof req.body.password !== 'string' || req.body.password.length === 0) throw new ValidationError('Password is required')
    return auth.login(req.body.email, req.body.password)
  })
  app.post('/auth/logout', async (req: FastifyRequest) => {
    await auth.logout(bearer(req))
    return { ok: true }
  })
  app.get('/auth/validate', async (req: FastifyRequest) => {
    try {
      return await auth.validateSession(bearer(req))
    } catch {
      return null
    }
  })

  // ---- calendars ----
  app.get('/calendars', async (req: FastifyRequest) => withUser(services, req, (uid) => calendars.listCalendarsForUser(uid)))
  app.post('/calendars', async (req: Body<unknown>) =>
    withUser(services, req, (uid) => calendars.createCalendar(uid, validateCalendarInput(req.body))))
  app.put('/calendars/:id', async (req: Req<{ Body: unknown; Params: { id: string } }>) =>
    withUser(services, req, (uid) => calendars.updateCalendar(uid, req.params.id, validateCalendarPatch(req.body))))
  app.delete('/calendars/:id', async (req: Params<{ id: string }>) =>
    withUser(services, req, (uid) => calendars.deleteCalendar(uid, req.params.id)))
  app.post('/calendars/:id/share', async (req: Req<{ Body: unknown; Params: { id: string } }>) =>
    asOwner(services, req, req.params.id, (uid) => auth.shareCalendar(req.params.id, uid, validateShareInput(req.body))))
  app.delete('/calendars/:id/share/:userId', async (req: Params<{ id: string; userId: string }>) =>
    asOwner(services, req, req.params.id, () => auth.unshareCalendar(req.params.id, req.params.userId)))
  app.get('/calendars/:id/shares', async (req: Params<{ id: string }>) =>
    asOwner(services, req, req.params.id, () => auth.listShares(req.params.id)))

  // ---- events ----
  app.get('/events', async (req: Query<{ from: string; to: string; calendarIds?: string }>) => {
    validateRange(req.query.from, req.query.to)
    return withUser(services, req, (uid) => events.listEvents(uid, req.query.from, req.query.to, splitCsv(req.query.calendarIds)))
  })
  app.get('/events/search', async (req: Query<{ q: string; calendarIds?: string; limit?: string }>) => {
    const q = validateSearchQuery(req.query.q)
    const limit = capLimit(req.query.limit)
    return withUser(services, req, (uid) =>
      events.searchEvents(uid, q, { calendarIds: splitCsv(req.query.calendarIds), limit }))
  })
  app.get('/events/occurrences', async (req: Query<{ from: string; to: string; calendarIds?: string }>) => {
    validateRange(req.query.from, req.query.to)
    return withUser(services, req, (uid) =>
      events.listOccurrencesForRange(uid, req.query.from, req.query.to, splitCsv(req.query.calendarIds)))
  })
  app.get('/events/trash', async (req: FastifyRequest) =>
    withUser(services, req, (uid) => events.listTrash(uid)))
  app.get('/events/:id', async (req: Params<{ id: string }>) =>
    withUser(services, req, (uid) => events.getEvent(uid, req.params.id)))
  app.post('/events', async (req: Body<unknown>) =>
    withUser(services, req, (uid) => events.createEvent(uid, validateEventInput(req.body))))
  app.put('/events/:id', async (req: Req<{ Body: unknown; Params: { id: string } }>) =>
    withUser(services, req, (uid) => events.updateEvent(uid, req.params.id, validateEventPatch(req.body))))
  app.delete('/events/:id', async (req: Params<{ id: string }>) =>
    withUser(services, req, (uid) => events.deleteEvent(uid, req.params.id)))
  app.post('/events/:id/restore', async (req: Params<{ id: string }>) =>
    withUser(services, req, (uid) => events.restoreEvent(uid, req.params.id)))
  app.delete('/events/:id/forever', async (req: Params<{ id: string }>) =>
    withUser(services, req, (uid) => events.purgeEvent(uid, req.params.id)))
  app.get('/events/:id/occurrences', async (req: Req<{ Params: { id: string }; Querystring: { from: string; to: string } }>) => {
    validateRange(req.query.from, req.query.to)
    return withUser(services, req, (uid) => events.listOccurrences(uid, req.params.id, req.query.from, req.query.to))
  })
  app.put('/events/:id/occurrences/:occurrence', async (req: Req<{ Body: unknown; Params: { id: string; occurrence: string } }>) =>
    withUser(services, req, (uid) =>
      events.updateOccurrence(uid, req.params.id, req.params.occurrence, validateEventPatch(req.body))))
  app.delete('/events/:id/occurrences/:occurrence', async (req: Params<{ id: string; occurrence: string }>) =>
    withUser(services, req, (uid) => events.deleteOccurrence(uid, req.params.id, req.params.occurrence)))
  app.post('/events/:id/split/:occurrence', async (req: Req<{ Body: unknown; Params: { id: string; occurrence: string } }>) =>
    withUser(services, req, (uid) =>
      events.splitSeries(uid, req.params.id, req.params.occurrence, validateEventPatch(req.body))))

  // ---- reminders ----
  app.post('/reminders', async (req: Body<{ eventId: string; minutes: number }>) => {
    validateId(req.body.eventId, 'event id')
    const minutes = validateReminderMinutes(req.body.minutes)
    return withUser(services, req, (uid) => events.addReminder(uid, req.body.eventId, minutes))
  })
  app.delete('/reminders/:id', async (req: Params<{ id: string }>) =>
    withUser(services, req, (uid) => events.removeReminder(uid, req.params.id)))

  // ---- settings (whitelisted keys) ----
  app.get('/settings/:key', async (req: Params<{ key: string }>) =>
    withUser(services, req, (uid) => store.getSetting(`user:${uid}:${req.params.key}`)))
  app.put('/settings/:key', async (req: Req<{ Body: { value: unknown }; Params: { key: string } }>) =>
    withUser(services, req, (uid) => {
      const validated = validateSetting(req.params.key, req.body.value)
      return store.setSetting(`user:${uid}:${validated.key}`, validated.value)
    }))

  // ---- import / export ----
  app.get('/export/ical', async (req: Query<{ calendarIds?: string }>) => {
    const calendarIds = splitCsv(req.query.calendarIds)
    return withUser(services, req, (uid) => ical.exportICal(uid, calendarIds))
  })
  app.get('/export/json', async (req: FastifyRequest) => withUser(services, req, (uid) => ical.exportJson(uid)))
  app.post('/import/ical', { bodyLimit: LIMITS.icalMaxBytes + 4096 }, async (req: Body<{ calendarId: string; content: string }>) => {
    validateId(req.body.calendarId, 'calendar id')
    const content = validateImportContent(req.body.content, LIMITS.icalMaxBytes, 'iCal')
    return withUser(services, req, (uid) => ical.importICal(uid, req.body.calendarId, content))
  })
  app.post('/import/json', { bodyLimit: LIMITS.jsonMaxBytes + 4096 }, async (req: Body<{ content: string }>) => {
    const content = validateImportContent(req.body.content, LIMITS.jsonMaxBytes, 'backup')
    return withUser(services, req, (uid) => ical.importJson(uid, content))
  })

  // ---- reminder engine support (API key or authenticated user) ----
  app.get('/reminders/due', async (req: Query<{ window?: string }>) => {
    const windowMinutes = capDueWindow(req.query.window)
    const access = await reminderAccess(services, req)
    const now = new Date().toISOString()
    return access.scope === 'system'
      ? store.listDueReminders(now, windowMinutes)
      : store.listDueRemindersForUser(now, windowMinutes, access.userId)
  })
  app.post('/reminders/:id/sent', async (req: Params<{ id: string }>) => {
    validateId(req.params.id, 'reminder id')
    const access = await reminderAccess(services, req)
    if (access.scope === 'user') {
      const due = await store.listDueRemindersForUser(new Date().toISOString(), LIMITS.dueWindowMax, access.userId)
      if (!due.some((r) => r.id === req.params.id)) throw new AuthError('Not allowed')
    }
    await store.markReminderSent(req.params.id, new Date().toISOString())
    return { ok: true }
  })

  // ---- info ----
  app.get('/info', async () => ({ using: services.using }))
}
