import type { EventStore, AuthStore, EventCache } from '../db/storage'
import type { Event, EventInput, Reminder } from '@shared/types'
import { serializeICal, parseICal, toEventInputs } from './ical'

export class ICalService {
  constructor(
    private store: EventStore & AuthStore,
    private cache: EventCache,
    private permissions: {
      assertCanRead(userId: string, calendarId: string): Promise<void>
      assertCanWrite(userId: string, calendarId: string): Promise<void>
    }
  ) {}

  /** Exports events of the given calendars (or all visible to the user) as an .ics string. */
  async exportICal(userId: string, calendarIds?: string[]): Promise<string> {
    const ids = calendarIds?.length ? calendarIds : (await this.store.listCalendars()).filter((c) => c.ownerId === userId).map((c) => c.id)
    await Promise.all(ids.map((id) => this.permissions.assertCanRead(userId, id)))
    const events = await this.store.listEvents('0000-01-01T00:00:00.000Z', '9999-12-31T23:59:59.999Z', ids)
    const withReminders = await Promise.all(events.map(async (ev) => ({ ev, reminders: (await this.store.listReminders(ev.id)) as Reminder[] })))
    return serializeICal(withReminders)
  }

  /** Imports an .ics string into a calendar; returns the number of created events. */
  async importICal(userId: string, calendarId: string, content: string): Promise<number> {
    await this.permissions.assertCanWrite(userId, calendarId)
    const parsed = parseICal(content)
    const inputs = toEventInputs(parsed, calendarId)
    for (const input of inputs) {
      await this.store.createEvent(input)
    }
    if (inputs.length > 0) await this.cache.invalidateAll()
    return inputs.length
  }

  /** JSON backup of all user-owned calendars and their events. */
  async exportJson(userId: string): Promise<string> {
    const calendars = (await this.store.listCalendars()).filter((c) => c.ownerId === userId)
    const data = await Promise.all(
      calendars.map(async (cal) => ({
        calendar: cal,
        events: await this.store.listEvents('0000-01-01T00:00:00.000Z', '9999-12-31T23:59:59.999Z', [cal.id])
      }))
    )
    return JSON.stringify({ exportedAt: new Date().toISOString(), version: 1, calendars: data }, null, 2)
  }

  /** Restores a JSON backup (creates calendars and events as needed). */
  async importJson(userId: string, content: string): Promise<number> {
    const parsed = JSON.parse(content) as { version?: number; calendars: Array<{ calendar: { name: string; color?: string }; events: EventInput[] }> }
    if (!parsed.calendars) throw new Error('Invalid backup file')
    let count = 0
    for (const { calendar, events } of parsed.calendars) {
      const created = await this.store.createCalendar({ name: calendar.name, color: calendar.color ?? '#1a73e8', ownerId: userId })
      for (const input of events) {
        await this.store.createEvent({ ...input, calendarId: created.id })
        count++
      }
    }
    if (count > 0) await this.cache.invalidateAll()
    return count
  }
}
