import type { EventStore, AuthStore, EventCache } from '@shared/storage'
import type { Event, EventInput } from '@shared/types'

export class EventService {
  constructor(
    private store: EventStore & AuthStore,
    private cache: EventCache,
    private permissions: {
      assertCanRead(userId: string, calendarId: string): Promise<void>
      assertCanWrite(userId: string, calendarId: string): Promise<void>
    }
  ) {}

  async listEvents(userId: string, from: string, to: string, calendarIds?: string[]): Promise<Event[]> {
    if (calendarIds && calendarIds.length > 0) {
      await Promise.all(calendarIds.map((id) => this.permissions.assertCanRead(userId, id)))
    }
    const rangeKey = `${from}|${to}|${(calendarIds ?? []).sort().join(',')}`
    const cached = await this.cache.getEvents(rangeKey)
    if (cached) return cached
    const events = await this.store.listEvents(from, to, calendarIds)
    await this.cache.setEvents(rangeKey, events)
    return events
  }

  async createEvent(userId: string, input: EventInput): Promise<Event> {
    await this.permissions.assertCanWrite(userId, input.calendarId)
    const event = await this.store.createEvent(input)
    await this.invalidateForCalendar(input.calendarId)
    await this.cache.publish('events.changed', { type: 'created', eventId: event.id })
    return event
  }

  async updateEvent(userId: string, id: string, input: Partial<EventInput>): Promise<Event> {
    const existing = await this.store.getEvent(id)
    if (!existing) throw new Error('Event not found')
    await this.permissions.assertCanWrite(userId, existing.calendarId)
    if (input.calendarId && input.calendarId !== existing.calendarId) {
      await this.permissions.assertCanWrite(userId, input.calendarId)
    }
    const event = await this.store.updateEvent(id, input)
    await this.invalidateForCalendar(existing.calendarId)
    if (input.calendarId && input.calendarId !== existing.calendarId) {
      await this.invalidateForCalendar(input.calendarId)
    }
    await this.cache.publish('events.changed', { type: 'updated', eventId: event.id })
    return event
  }

  async deleteEvent(userId: string, id: string): Promise<void> {
    const existing = await this.store.getEvent(id)
    if (!existing) throw new Error('Event not found')
    await this.permissions.assertCanWrite(userId, existing.calendarId)
    await this.store.deleteEvent(id)
    await this.invalidateForCalendar(existing.calendarId)
    await this.cache.publish('events.changed', { type: 'deleted', eventId: id })
  }

  async getEvent(userId: string, id: string) {
    const event = await this.store.getEvent(id)
    if (!event) throw new Error('Event not found')
    await this.permissions.assertCanRead(userId, event.calendarId)
    return event
  }

  async searchEvents(userId: string, query: string, opts?: { limit?: number; calendarIds?: string[] }) {
    if (opts?.calendarIds && opts.calendarIds.length > 0) {
      await Promise.all(opts.calendarIds.map((id) => this.permissions.assertCanRead(userId, id)))
    }
    return this.store.searchEvents(query, opts)
  }

  private async invalidateForCalendar(calendarId: string): Promise<void> {
    await this.cache.invalidateAll()
  }
}
