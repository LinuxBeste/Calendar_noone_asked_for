import type { EventStore, AuthStore, EventCache } from '../db/storage'
import type { Calendar, CalendarLink, EventOccurrence, PublicCalendarView } from '@shared/types'
import { randomBytes } from 'crypto'
import { expandEvent } from './recurrence'
import { serializeICal } from './ical'

/**
 * Public share links: anyone with the (unguessable) token can view the
 * calendar's events without an account (read-only), including an .ics feed.
 */
export class LinkService {
  constructor(
    private store: EventStore & AuthStore,
    private cache: EventCache,
    private permissions: {
      assertCanRead(userId: string, calendarId: string): Promise<void>
    }
  ) {}

  async createLink(userId: string, calendarId: string): Promise<CalendarLink> {
    await this.permissions.assertCanRead(userId, calendarId)
    const token = randomBytes(16).toString('base64url')
    const link = { token, calendarId, createdBy: userId, createdAt: new Date().toISOString() }
    await this.store.createLink(link)
    return link
  }

  async listLinks(userId: string, calendarId: string): Promise<CalendarLink[]> {
    await this.permissions.assertCanRead(userId, calendarId)
    return this.store.listLinks(calendarId)
  }

  async deleteLink(userId: string, token: string): Promise<void> {
    const link = await this.store.getLinkByToken(token)
    if (!link) throw new Error('Link not found')
    await this.permissions.assertCanRead(userId, link.calendarId)
    await this.store.deleteLink(token)
  }

  async getPublic(token: string): Promise<PublicCalendarView> {
    const link = await this.store.getLinkByToken(token)
    if (!link) throw new Error('Link not found or revoked')
    const cal = await this.store.getCalendar(link.calendarId)
    if (!cal) throw new Error('Calendar not found')
    const events = await this.store.listEvents('0000-01-01T00:00:00.000Z', '9999-12-31T23:59:59.999Z', [cal.id])
    return {
      calendar: { id: cal.id, name: cal.name, color: cal.color, description: cal.description },
      events
    }
  }

  async getPublicOccurrences(token: string, from: string, to: string): Promise<EventOccurrence[]> {
    const link = await this.store.getLinkByToken(token)
    if (!link) throw new Error('Link not found or revoked')
    const master = await this.store.listEvents(from, to, [link.calendarId])
    const out: EventOccurrence[] = []
    for (const ev of master) {
      const exceptions = ev.rrule ? await this.store.listExceptions(ev.id) : []
      for (const o of expandEvent(ev, exceptions, new Date(from), new Date(to))) {
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
    return out
  }

  async exportPublicICal(token: string): Promise<string> {
    const link = await this.store.getLinkByToken(token)
    if (!link) throw new Error('Link not found or revoked')
    const events = await this.store.listEvents('0000-01-01T00:00:00.000Z', '9999-12-31T23:59:59.999Z', [link.calendarId])
    const withReminders = await Promise.all(events.map(async (ev) => ({ ev, reminders: (await this.store.listReminders(ev.id)) as [] })))
    return serializeICal(withReminders)
  }
}
