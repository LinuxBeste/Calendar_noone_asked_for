import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { SqliteStore } from '../electron/db/sqlite'
import { InMemoryCache } from '../electron/db/cache-memory'
import type { EventStore, EventCache } from '../shared/storage'

function makeStore(): { store: EventStore; cache: EventCache } {
  const dir = mkdtempSync(join(tmpdir(), 'cal-test-'))
  const store = new SqliteStore(join(dir, 'test.db'))
  const cache = new InMemoryCache()
  return { store, cache }
}

describe('SqliteStore', () => {
  let store: EventStore
  let cache: EventCache

  beforeEach(async () => {
    ;({ store, cache } = makeStore())
    await store.migrate()
  })

  describe('calendars', () => {
    it('creates a default calendar on migrate', async () => {
      const cals = await store.listCalendars()
      expect(cals).toHaveLength(1)
      expect(cals[0]!.isDefault).toBe(true)
      expect(cals[0]!.visible).toBe(true)
    })

    it('creates, updates and deletes a calendar', async () => {
      const cal = await store.createCalendar({ name: 'Work', color: '#d93025' })
      expect(cal.name).toBe('Work')
      expect(cal.visible).toBe(true)

      const updated = await store.updateCalendar(cal.id, { name: 'Job', visible: false })
      expect(updated.name).toBe('Job')
      expect(updated.visible).toBe(false)

      await store.deleteCalendar(cal.id)
      expect(await store.getCalendar(cal.id)).toBeUndefined()
    })
  })

  describe('events', () => {
    it('creates and reads an event with details', async () => {
      const cals = await store.listCalendars()
      const ev = await store.createEvent({
        calendarId: cals[0]!.id,
        title: 'Standup',
        startsAt: '2026-08-06T08:00:00.000Z',
        endsAt: '2026-08-06T08:15:00.000Z'
      })
      expect(ev.title).toBe('Standup')
      expect(ev.allDay).toBe(false)

      const detail = await store.getEvent(ev.id)
      expect(detail?.title).toBe('Standup')
      expect(detail?.attendees).toEqual([])
      expect(detail?.reminders).toEqual([])
    })

    it('lists only events overlapping the range', async () => {
      const cals = await store.listCalendars()
      const calId = cals[0]!.id
      await store.createEvent({
        calendarId: calId,
        title: 'Inside',
        startsAt: '2026-08-06T10:00:00.000Z',
        endsAt: '2026-08-06T11:00:00.000Z'
      })
      await store.createEvent({
        calendarId: calId,
        title: 'Outside',
        startsAt: '2026-09-01T10:00:00.000Z',
        endsAt: '2026-09-01T11:00:00.000Z'
      })
      const events = await store.listEvents('2026-08-01T00:00:00.000Z', '2026-08-31T23:59:59.999Z')
      expect(events).toHaveLength(1)
      expect(events[0]!.title).toBe('Inside')
    })

    it('lists all-day events spanning the range', async () => {
      const cals = await store.listCalendars()
      await store.createEvent({
        calendarId: cals[0]!.id,
        title: 'Vacation',
        allDay: true,
        startDate: '2026-08-10',
        endDate: '2026-08-14'
      })
      const events = await store.listEvents('2026-08-12T00:00:00.000Z', '2026-08-13T00:00:00.000Z')
      expect(events).toHaveLength(1)
      expect(events[0]!.allDay).toBe(true)
    })

    it('filters by calendar ids', async () => {
      const cal = await store.createCalendar({ name: 'Second', color: '#188038' })
      const cals = await store.listCalendars()
      const def = cals.find((c) => c.isDefault)!
      await store.createEvent({
        calendarId: def.id,
        title: 'On default',
        startsAt: '2026-08-06T10:00:00.000Z',
        endsAt: '2026-08-06T11:00:00.000Z'
      })
      await store.createEvent({
        calendarId: cal.id,
        title: 'On second',
        startsAt: '2026-08-06T10:00:00.000Z',
        endsAt: '2026-08-06T11:00:00.000Z'
      })
      const events = await store.listEvents('2026-08-01T00:00:00.000Z', '2026-08-31T00:00:00.000Z', [cal.id])
      expect(events).toHaveLength(1)
      expect(events[0]!.title).toBe('On second')
    })

    it('updates and deletes events', async () => {
      const cals = await store.listCalendars()
      const ev = await store.createEvent({
        calendarId: cals[0]!.id,
        title: 'Old',
        startsAt: '2026-08-06T10:00:00.000Z',
        endsAt: '2026-08-06T11:00:00.000Z'
      })
      const updated = await store.updateEvent(ev.id, { title: 'New', color: '#f4511e' })
      expect(updated.title).toBe('New')
      expect(updated.color).toBe('#f4511e')

      await store.deleteEvent(ev.id)
      expect(await store.getEvent(ev.id)).toBeUndefined()
    })
  })

  describe('search', () => {
    it('finds events by title, description and location', async () => {
      const cals = await store.listCalendars()
      const calId = cals[0]!.id
      await store.createEvent({
        calendarId: calId,
        title: 'Dentist',
        startsAt: '2026-08-06T10:00:00.000Z',
        endsAt: '2026-08-06T11:00:00.000Z'
      })
      await store.createEvent({
        calendarId: calId,
        title: 'Lunch',
        description: 'with dentist',
        startsAt: '2026-08-07T12:00:00.000Z',
        endsAt: '2026-08-07T13:00:00.000Z'
      })
      await store.createEvent({
        calendarId: calId,
        title: 'Gym',
        location: 'Studio 42',
        startsAt: '2026-08-08T18:00:00.000Z',
        endsAt: '2026-08-08T19:00:00.000Z'
      })
      expect((await store.searchEvents('dentist')).map((e) => e.title).sort()).toEqual(['Dentist', 'Lunch'])
      expect((await store.searchEvents('studio')).map((e) => e.title)).toEqual(['Gym'])
    })
  })
})

describe('InMemoryCache', () => {
  it('stores, reads and expires events', async () => {
    const cache = new InMemoryCache()
    const ev = {
      id: '1',
      calendarId: 'c1',
      title: 'Test',
      allDay: false,
      busy: true,
      createdAt: '',
      updatedAt: ''
    }
    expect(await cache.getEvents('2026-08')).toBeUndefined()
    await cache.setEvents('2026-08', [ev], 1)
    expect(await cache.getEvents('2026-08')).toHaveLength(1)
    await cache.invalidate('2026-08')
    expect(await cache.getEvents('2026-08')).toBeUndefined()
  })

  it('publishes and subscribes', async () => {
    const cache = new InMemoryCache()
    const received: unknown[] = []
    const unsub = await cache.subscribe('events.changed', (p) => received.push(p))
    await cache.publish('events.changed', { id: 'x' })
    await cache.publish('other', { id: 'y' })
    expect(received).toEqual([{ id: 'x' }])
    unsub()
    await cache.publish('events.changed', { id: 'z' })
    expect(received).toHaveLength(1)
  })
})
