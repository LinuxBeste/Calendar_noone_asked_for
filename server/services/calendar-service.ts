import type { EventStore, AuthStore, EventCache } from '../db/storage'
import type { Calendar, CalendarInput } from '@shared/types'

export class PermissionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PermissionError'
  }
}

/**
 * User-scoped calendar access: resolves which calendars a user can see
 * (owned + shared) and enforces read/write permissions.
 */
export class CalendarService {
  constructor(
    private store: EventStore & AuthStore,
    private cache: EventCache
  ) {}

  async listCalendarsForUser(userId: string): Promise<Calendar[]> {
    const [owned, shares] = await Promise.all([
      this.store.listCalendars(),
      this.store.getUserShares(userId)
    ])
    const shareMap = new Map(shares.map((s) => [s.calendarId, s.role]))
    return owned
      .filter((c) => c.ownerId === userId || shareMap.has(c.id))
      .map((c) => {
        if (c.ownerId === userId) return { ...c, role: 'owner' as const }
        const role = shareMap.get(c.id)
        if (!role) return { ...c, role: 'viewer' as const }
        return { ...c, role }
      })
  }

  async createCalendar(userId: string, input: CalendarInput): Promise<Calendar> {
    const cal = await this.store.createCalendar({ ...input, ownerId: userId })
    await this.cache.invalidateAll()
    await this.cache.publish('calendars.changed', { type: 'created', calendarId: cal.id, userId })
    return cal
  }

  async updateCalendar(userId: string, id: string, input: Partial<CalendarInput>): Promise<Calendar> {
    await this.assertCanWrite(userId, id)
    const cal = await this.store.updateCalendar(id, input)
    await this.cache.invalidateAll()
    await this.cache.publish('calendars.changed', { type: 'updated', calendarId: id, userId })
    return cal
  }

  async deleteCalendar(userId: string, id: string): Promise<void> {
    const cal = await this.store.getCalendar(id)
    if (!cal || cal.ownerId !== userId) throw new PermissionError('Only the owner can delete this calendar')
    await this.store.deleteCalendar(id)
    await this.cache.invalidateAll()
    await this.cache.publish('calendars.changed', { type: 'deleted', calendarId: id, userId })
  }

  /** Checks the user can read this calendar. Throws otherwise. */
  async assertCanRead(userId: string, calendarId: string): Promise<void> {
    const cal = await this.store.getCalendar(calendarId)
    if (!cal) throw new PermissionError('Calendar not found')
    if (cal.ownerId === userId) return
    const shares = await this.store.getUserShares(userId)
    if (!shares.some((s) => s.calendarId === calendarId)) throw new PermissionError('You do not have access to this calendar')
  }

  /** Checks the user can modify events on this calendar. Throws otherwise. */
  async assertCanWrite(userId: string, calendarId: string): Promise<void> {
    const cal = await this.store.getCalendar(calendarId)
    if (!cal) throw new PermissionError('Calendar not found')
    if (cal.ownerId === userId) return
    const shares = await this.store.getUserShares(userId)
    const share = shares.find((s) => s.calendarId === calendarId)
    if (!share || share.role !== 'editor') throw new PermissionError('You only have read access to this calendar')
  }
}
