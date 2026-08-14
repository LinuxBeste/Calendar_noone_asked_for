import type { EventStore, AuthStore, EventCache } from '../db/storage'
import type { Event, EventInput, Reminder } from '@shared/types'
import { serializeICal, parseICal, toEventInputs } from './ical'
import { validateEventInput } from '../validation'

export class ICalService {
  constructor(
    private store: EventStore & AuthStore,
    private cache: EventCache,
    private permissions: {
      assertCanRead(userId: string, calendarId: string): Promise<void>
      assertCanWrite(userId: string, calendarId: string): Promise<void>
      /** Resolves the requested calendar set; defaults to everything the user can access. */
      resolveCalendarIds(userId: string, requested?: string[]): Promise<string[]>
    }
  ) {}

  /** Exports events of the given calendars (or all visible to the user) as an .ics string. */
  async exportICal(userId: string, calendarIds?: string[]): Promise<string> {
    const ids = await this.permissions.resolveCalendarIds(userId, calendarIds)
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
    let parsed: { version?: number; calendars: Array<{ calendar: { name: string; color?: string }; events: EventInput[] }> }
    try {
      parsed = JSON.parse(content) as { version?: number; calendars: Array<{ calendar: { name: string; color?: string }; events: EventInput[] }> }
    } catch {
      throw new Error('Invalid backup file — not valid JSON')
    }
    if (!Array.isArray(parsed?.calendars)) throw new Error('Invalid backup file')
    let count = 0
    for (const { calendar, events } of parsed.calendars) {
      if (!calendar || typeof calendar.name !== 'string' || typeof events !== 'object' || events === null) {
        throw new Error('Invalid backup file — malformed calendar entry')
      }
      const created = await this.store.createCalendar({ name: calendar.name.slice(0, 100), color: typeof calendar.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(calendar.color) ? calendar.color : '#1a73e8', ownerId: userId })
      for (const input of events) {
        validateEventInput({ ...input, calendarId: created.id })
        await this.store.createEvent({ ...input, calendarId: created.id })
        count++
      }
    }
    if (count > 0) await this.cache.invalidateAll()
    return count
  }
}
