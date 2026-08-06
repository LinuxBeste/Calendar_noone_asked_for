import type { FastifyInstance, FastifyRequest, RouteGenericInterface } from 'fastify'
import type { EventStore, AuthStore } from './db/storage'
import type { AuthService } from './services/auth'
import type { CalendarService } from './services/calendar-service'
import type { EventService } from './services/event-service'
import type { ICalService } from './services/ical-service'

export interface Services {
  auth: AuthService
  calendars: CalendarService
  events: EventService
  ical: ICalService
  store: EventStore & AuthStore
  using: string
}

type Body<T> = FastifyRequest<{ Body: T }>
type Params<T> = FastifyRequest<{ Params: T }>
type Query<T> = FastifyRequest<{ Querystring: T }>
type Req<G extends RouteGenericInterface = RouteGenericInterface> = FastifyRequest<G>

/** Extracts the bearer token from the Authorization header; throws when missing. */
function bearer(request: FastifyRequest): string {
  const header = request.headers.authorization
  if (!header?.startsWith('Bearer ')) throw new Error('Not authenticated')
  return header.slice('Bearer '.length)
}

/** Validates the session and runs fn with the userId. */
async function withUser<T>(services: Services, request: FastifyRequest, fn: (userId: string) => Promise<T> | T): Promise<T> {
  const user = await services.auth.validateSession(bearer(request))
  if (!user) throw new Error('Not authenticated')
  return fn(user.id)
}

function splitCsv(value?: string): string[] | undefined {
  return value?.split(',').filter(Boolean)
}

export async function registerRoutes(app: FastifyInstance, services: Services): Promise<void> {
  const { auth, calendars, events, ical, store } = services

  app.addHook('onError', async (_request, reply, error) => {
    reply.status(400).send({ error: error instanceof Error ? error.message : 'Request failed' })
  })

  // ---- auth ----
  app.post('/auth/register', async (req: Body<{ email: string; name: string; password: string }>) => auth.register(req.body))
  app.post('/auth/login', async (req: Body<{ email: string; password: string }>) => auth.login(req.body.email, req.body.password))
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
    withUser(services, req, (uid) => calendars.createCalendar(uid, req.body as never)))
  app.put('/calendars/:id', async (req: Req<{ Body: unknown; Params: { id: string } }>) =>
    withUser(services, req, (uid) => calendars.updateCalendar(uid, req.params.id, req.body as never)))
  app.delete('/calendars/:id', async (req: Params<{ id: string }>) =>
    withUser(services, req, (uid) => calendars.deleteCalendar(uid, req.params.id)))
  app.post('/calendars/:id/share', async (req: Req<{ Body: unknown; Params: { id: string } }>) =>
    withUser(services, req, (uid) => auth.shareCalendar(req.params.id, uid, req.body as never)))
  app.delete('/calendars/:id/share/:userId', async (req: Params<{ id: string; userId: string }>) =>
    auth.unshareCalendar(req.params.id, req.params.userId))
  app.get('/calendars/:id/shares', async (req: Params<{ id: string }>) => auth.listShares(req.params.id))

  // ---- events ----
  app.get('/events', async (req: Query<{ from: string; to: string; calendarIds?: string }>) =>
    withUser(services, req, (uid) => events.listEvents(uid, req.query.from, req.query.to, splitCsv(req.query.calendarIds))))
  app.get('/events/search', async (req: Query<{ q: string; calendarIds?: string; limit?: string }>) =>
    withUser(services, req, (uid) =>
      events.searchEvents(uid, req.query.q, {
        calendarIds: splitCsv(req.query.calendarIds),
        limit: req.query.limit ? Number(req.query.limit) : undefined
      })))
  app.get('/events/occurrences', async (req: Query<{ from: string; to: string; calendarIds?: string }>) =>
    withUser(services, req, (uid) => events.listOccurrencesForRange(uid, req.query.from, req.query.to, splitCsv(req.query.calendarIds))))
  app.get('/events/:id', async (req: Params<{ id: string }>) =>
    withUser(services, req, (uid) => events.getEvent(uid, req.params.id)))
  app.post('/events', async (req: Body<unknown>) =>
    withUser(services, req, (uid) => events.createEvent(uid, req.body as never)))
  app.put('/events/:id', async (req: Req<{ Body: unknown; Params: { id: string } }>) =>
    withUser(services, req, (uid) => events.updateEvent(uid, req.params.id, req.body as never)))
  app.delete('/events/:id', async (req: Params<{ id: string }>) =>
    withUser(services, req, (uid) => events.deleteEvent(uid, req.params.id)))
  app.get('/events/:id/occurrences', async (req: Req<{ Params: { id: string }; Querystring: { from: string; to: string } }>) =>
    withUser(services, req, (uid) => events.listOccurrences(uid, req.params.id, req.query.from, req.query.to)))
  app.put('/events/:id/occurrences/:occurrence', async (req: Req<{ Body: unknown; Params: { id: string; occurrence: string } }>) =>
    withUser(services, req, (uid) => events.updateOccurrence(uid, req.params.id, req.params.occurrence, req.body as never)))
  app.delete('/events/:id/occurrences/:occurrence', async (req: Params<{ id: string; occurrence: string }>) =>
    withUser(services, req, (uid) => events.deleteOccurrence(uid, req.params.id, req.params.occurrence)))
  app.post('/events/:id/split/:occurrence', async (req: Req<{ Body: unknown; Params: { id: string; occurrence: string } }>) =>
    withUser(services, req, (uid) => events.splitSeries(uid, req.params.id, req.params.occurrence, req.body as never)))

  // ---- reminders ----
  app.post('/reminders', async (req: Body<{ eventId: string; minutes: number }>) =>
    withUser(services, req, (uid) => events.addReminder(uid, req.body.eventId, req.body.minutes)))
  app.delete('/reminders/:id', async (req: Params<{ id: string }>) =>
    withUser(services, req, (uid) => events.removeReminder(uid, req.params.id)))

  // ---- settings ----
  app.get('/settings/:key', async (req: Params<{ key: string }>) =>
    withUser(services, req, (uid) => store.getSetting(`user:${uid}:${req.params.key}`)))
  app.put('/settings/:key', async (req: Req<{ Body: { value: unknown }; Params: { key: string } }>) =>
    withUser(services, req, (uid) => store.setSetting(`user:${uid}:${req.params.key}`, req.body.value)))

  // ---- import / export ----
  app.get('/export/ical', async (req: Query<{ calendarIds?: string }>) => {
    const calendarIds = splitCsv(req.query.calendarIds)
    return withUser(services, req, (uid) => ical.exportICal(uid, calendarIds))
  })
  app.get('/export/json', async (req: FastifyRequest) => withUser(services, req, (uid) => ical.exportJson(uid)))
  app.post('/import/ical', async (req: Body<{ calendarId: string; content: string }>) =>
    withUser(services, req, (uid) => ical.importICal(uid, req.body.calendarId, req.body.content)))
  app.post('/import/json', async (req: Body<{ content: string }>) =>
    withUser(services, req, (uid) => ical.importJson(uid, req.body.content)))

  // ---- reminder engine support (local system) ----
  app.get('/reminders/due', async (req: Query<{ window?: string }>) =>
    store.listDueReminders(new Date().toISOString(), req.query.window ? Number(req.query.window) : 5))
  app.post('/reminders/:id/sent', async (req: Params<{ id: string }>) => {
    await store.markReminderSent(req.params.id, new Date().toISOString())
    return { ok: true }
  })

  // ---- info ----
  app.get('/info', async () => ({ using: services.using }))
}
