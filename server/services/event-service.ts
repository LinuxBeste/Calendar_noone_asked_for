import type { EventStore, AuthStore, EventCache } from '../db/storage'
import type { Event, EventInput, EventDetail, EventOccurrence } from '@shared/types'
import { expandEvent, withDtstart } from './recurrence'
import { createRequire } from 'module'
const { RRule, datetime } = createRequire(import.meta.url)('rrule') as typeof import('rrule')

export class EventService {
  constructor(
    private store: EventStore & AuthStore,
    private cache: EventCache,
    private permissions: {
      assertCanRead(userId: string, calendarId: string): Promise<void>
      assertCanWrite(userId: string, calendarId: string): Promise<void>
      listCalendarsForUser(userId: string): Promise<{ id: string }[]>
      /** Resolves the requested calendar set; defaults to everything the user can access. */
      resolveCalendarIds(userId: string, requested?: string[]): Promise<string[]>
    }
  ) {}

  /** Feed-sourced events are read-only. */
  private async assertNotFeedEvent(id: string): Promise<void> {
    const detail = await this.store.getEvent(id)
    if (detail?.feedId) throw new Error('Events from external feeds are read-only')
  }

  /**
   * The client is never trusted to decide which calendars it may see. When no
   * explicit set is given (or an empty one is — e.g. all calendars hidden in
   * the UI), the user's own accessible calendars are used instead of the
   * whole database.
   */
  private async resolveCalendarIds(userId: string, requested?: string[]): Promise<string[]> {
    return this.permissions.resolveCalendarIds(userId, requested)
  }

  async listEvents(userId: string, from: string, to: string, calendarIds?: string[]): Promise<Event[]> {
    const ids = await this.resolveCalendarIds(userId, calendarIds)
    const rangeKey = `${from}|${to}|${[...ids].sort().join(',')}`
    const cached = await this.cache.getEvents(rangeKey)
    if (cached) return cached
    const events = await this.store.listEvents(from, to, ids)
    await this.cache.setEvents(rangeKey, events)
    return events
  }

  async createEvent(userId: string, input: EventInput): Promise<Event> {
    await this.permissions.assertCanWrite(userId, input.calendarId)
    const event = await this.store.createEvent(input)
    await this.invalidateForCalendar(input.calendarId)
    await this.cache.publish('events.changed', { type: 'created', eventId: event.id, userId, calendarId: input.calendarId })
    return event
  }

  async updateEvent(userId: string, id: string, input: Partial<EventInput>): Promise<Event> {
    const existing = await this.store.getEvent(id)
    if (!existing) throw new Error('Event not found')
    await this.assertNotFeedEvent(id)
    await this.permissions.assertCanWrite(userId, existing.calendarId)
    if (input.calendarId && input.calendarId !== existing.calendarId) {
      await this.permissions.assertCanWrite(userId, input.calendarId)
    }
    const event = await this.store.updateEvent(id, input)
    await this.invalidateForCalendar(existing.calendarId)
    if (input.calendarId && input.calendarId !== existing.calendarId) {
      await this.invalidateForCalendar(input.calendarId)
      await this.cache.publish('events.changed', { type: 'updated', eventId: event.id, userId, calendarId: input.calendarId })
    }
    await this.cache.publish('events.changed', { type: 'updated', eventId: event.id, userId, calendarId: existing.calendarId })
    return event
  }

  async deleteEvent(userId: string, id: string): Promise<void> {
    const existing = await this.store.getEvent(id)
    if (!existing) throw new Error('Event not found')
    await this.assertNotFeedEvent(id)
    await this.permissions.assertCanWrite(userId, existing.calendarId)
    await this.store.deleteEvent(id)
    await this.invalidateForCalendar(existing.calendarId)
    await this.cache.publish('events.changed', { type: 'deleted', eventId: id, userId, calendarId: existing.calendarId })
  }

  async restoreEvent(userId: string, id: string): Promise<void> {
    const event = (await this.store.listTrashedEvents()).find((e) => e.id === id)
    if (!event) throw new Error('Event not found')
    await this.permissions.assertCanWrite(userId, event.calendarId)
    await this.store.restoreEvent(id)
    await this.invalidateForCalendar(event.calendarId)
    await this.cache.publish('events.changed', { type: 'updated', eventId: id, userId, calendarId: event.calendarId })
  }

  async purgeEvent(userId: string, id: string): Promise<void> {
    const event = (await this.store.listTrashedEvents()).find((e) => e.id === id)
    if (!event) throw new Error('Event not found')
    if (event.feedId) throw new Error('Events from external feeds are read-only')
    await this.permissions.assertCanWrite(userId, event.calendarId)
    await this.store.purgeEvent(id)
    await this.invalidateForCalendar(event.calendarId)
    await this.cache.publish('events.changed', { type: 'deleted', eventId: id, userId, calendarId: event.calendarId })
  }

  async listTrash(userId: string): Promise<Event[]> {
    const trash = await this.store.listTrashedEvents()
    const cals = await this.permissions.listCalendarsForUser(userId)
    const ids = new Set(cals.map((c) => c.id))
    return trash.filter((e) => ids.has(e.calendarId))
  }

  async purgeExpiredTrash(keepDays: number): Promise<number> {
    const cutoff = Date.now() - keepDays * 86400000
    let purged = 0
    for (const ev of await this.store.listTrashedEvents()) {
      if (ev.deletedAt && new Date(ev.deletedAt).getTime() < cutoff) {
        await this.store.purgeEvent(ev.id)
        purged++
      }
    }
    if (purged > 0) await this.cache.invalidateAll()
    return purged
  }

  async getEvent(userId: string, id: string): Promise<EventDetail> {
    const event = await this.store.getEvent(id)
    if (!event) throw new Error('Event not found')
    await this.permissions.assertCanRead(userId, event.calendarId)
    const [reminders, exceptions] = await Promise.all([
      this.store.listReminders(id),
      this.store.listExceptions(id)
    ])
    return { ...event, attendees: [], reminders, exceptions }
  }

  async searchEvents(userId: string, query: string, opts?: { limit?: number; calendarIds?: string[] }) {
    const ids = await this.resolveCalendarIds(userId, opts?.calendarIds)
    return this.store.searchEvents(query, { ...opts, calendarIds: ids })
  }

  async addReminder(userId: string, eventId: string, minutes: number) {
    const event = await this.getEvent(userId, eventId)
    await this.permissions.assertCanWrite(userId, event.calendarId)
    if (!event.startsAt) throw new Error('Cannot remind all-day or undated events')
    if (!(minutes > 0)) throw new Error('Reminder minutes must be positive')
    return this.store.createReminder(eventId, minutes)
  }

  async removeReminder(userId: string, reminderId: string) {
    const reminder = await this.store.getReminder(reminderId)
    if (!reminder) throw new Error('Reminder not found')
    const event = await this.getEvent(userId, reminder.eventId)
    await this.permissions.assertCanWrite(userId, event.calendarId)
    return this.store.deleteReminder(reminderId)
  }

  /** Expands series into concrete occurrences for the range (with exceptions applied). */
  async listOccurrences(userId: string, eventId: string, from: string, to: string): Promise<EventOccurrence[]> {
    const detail = await this.getEvent(userId, eventId)
    const exceptions = await this.store.listExceptions(eventId)
    return expandEvent(detail, exceptions, new Date(from), new Date(to)).map((o) => ({
      event: detail,
      exception: o.exception,
      start: o.start.toISOString(),
      end: o.end.toISOString(),
      allDay: o.exception?.allDay ?? detail.allDay,
      isException: o.isException
    }))
  }

  /** Lists all occurrences (expanded series) overlapping the range. What the views actually render. */
  async listOccurrencesForRange(userId: string, from: string, to: string, calendarIds?: string[]): Promise<EventOccurrence[]> {
    const ids = await this.resolveCalendarIds(userId, calendarIds)
    const cacheKey = `occ:${from}|${to}|${[...ids].sort().join(',')}`
    const cached = await this.cache.getEvents(cacheKey)
    if (cached) return cached as unknown as EventOccurrence[]
    const masterEvents = await this.store.listEvents(from, to, ids)
    const out: EventOccurrence[] = []
    for (const ev of masterEvents) {
      const exceptions = ev.rrule ? await this.store.listExceptions(ev.id) : []
      const occs = expandEvent(ev, exceptions, new Date(from), new Date(to))
      for (const o of occs) {
        out.push({
          event: ev,
          exception: o.exception,
          start: o.start.toISOString(),
          end: o.end.toISOString(),
          allDay: o.exception?.allDay ?? ev.allDay,
          isException: o.isException
        })
      }
    }
    out.sort((a, b) => a.start.localeCompare(b.start))
    await this.cache.setEvents(cacheKey, out as unknown as Event[], 120)
    return out
  }

  /** Edits a single occurrence of a series by creating/updating an exception. */
  async updateOccurrence(userId: string, eventId: string, occurrence: string, input: Partial<EventInput>): Promise<void> {
    const detail = await this.getEvent(userId, eventId)
    if (detail.feedId) throw new Error('Events from external feeds are read-only')
    if (!detail.rrule) {
      await this.updateEvent(userId, eventId, input)
      return
    }
    await this.permissions.assertCanWrite(userId, detail.calendarId)
    await this.store.upsertException(eventId, {
      occurrence,
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
      deleted: false
    })
    await this.invalidateForCalendar(detail.calendarId)
    await this.cache.publish('events.changed', { type: 'updated', eventId, userId, calendarId: detail.calendarId })
  }

  /** Deletes a single occurrence of a series (exception marked deleted). */
  async deleteOccurrence(userId: string, eventId: string, occurrence: string): Promise<void> {
    const detail = await this.getEvent(userId, eventId)
    if (detail.feedId) throw new Error('Events from external feeds are read-only')
    if (!detail.rrule) {
      await this.deleteEvent(userId, eventId)
      return
    }
    await this.permissions.assertCanWrite(userId, detail.calendarId)
    await this.store.upsertException(eventId, { occurrence, deleted: true })
    await this.invalidateForCalendar(detail.calendarId)
    await this.cache.publish('events.changed', { type: 'updated', eventId, userId, calendarId: detail.calendarId })
  }

  /** Splits the series at an occurrence: old series ends before it, a new series starts there. */
  async splitSeries(userId: string, eventId: string, occurrence: string, input: Partial<EventInput>): Promise<Event> {
    const detail = await this.getEvent(userId, eventId)
    if (detail.feedId) throw new Error('Events from external feeds are read-only')
    if (!detail.rrule) {
      await this.updateEvent(userId, eventId, input)
      return (await this.getEvent(userId, eventId))!
    }
    await this.permissions.assertCanWrite(userId, detail.calendarId)

    const occDate = new Date(occurrence + 'T00:00:00Z')
    const thisOcc = expandEvent(
      detail,
      [],
      new Date(detail.allDay ? detail.startDate! + 'T00:00:00' : detail.startsAt!),
      new Date(occDate.getTime() + 86400000)
    ).find((o) => o.start.toISOString().slice(0, 10) === occurrence)
    if (!thisOcc) throw new Error('Could not find the occurrence to split at')

    const rule = RRule.fromString(detail.rrule.startsWith('DTSTART') ? detail.rrule : withDtstart(detail.rrule, new Date(detail.startsAt ?? detail.startDate! + 'T00:00:00')))
    const options = rule.options
    const freq = options.freq as 0 | 1 | 2 | 3
    const interval = options.interval
    const byweekday = options.byweekday?.length ? options.byweekday[0] : undefined

    const until = new Date(occDate.getTime() - 86400000)
    const oldRule = new RRule({
      freq: freq as never,
      interval,
      ...(byweekday !== undefined ? { byweekday: [byweekday] } : {}),
      until: datetime(until.getFullYear(), until.getMonth() + 1, until.getDate())
    }).toString()
    await this.store.updateEvent(eventId, { rrule: withDtstart(oldRule, new Date(detail.allDay ? detail.startDate! + 'T00:00:00' : detail.startsAt!)) })

    const newRule = new RRule({
      freq: freq as never,
      interval,
      ...(byweekday !== undefined ? { byweekday: [byweekday] } : {})
    }).toString()
    const anchor = detail.allDay ? new Date(occurrence + 'T00:00:00') : occDate
    const created = await this.store.createEvent({
      calendarId: detail.calendarId,
      title: input.title ?? detail.title,
      description: input.description ?? detail.description,
      location: input.location ?? detail.location,
      allDay: input.allDay ?? detail.allDay,
      startsAt: input.startsAt ?? thisOcc.start.toISOString(),
      endsAt: input.endsAt ?? new Date(thisOcc.end.getTime()).toISOString(),
      startDate: input.startDate ?? occurrence,
      endDate: input.endDate ?? occurrence,
      timezone: detail.timezone,
      color: input.color ?? detail.color,
      busy: input.busy ?? detail.busy,
      rrule: withDtstart(newRule, anchor)
    })
    await this.invalidateForCalendar(detail.calendarId)
    await this.cache.publish('events.changed', { type: 'created', eventId: created.id, userId, calendarId: detail.calendarId })
    return created
  }

  private async invalidateForCalendar(calendarId: string): Promise<void> {
    await this.cache.invalidateAll()
  }
}
