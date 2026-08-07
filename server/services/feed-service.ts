import type { EventStore, AuthStore, EventCache } from '../db/storage'
import type { EventInput, ICalFeed } from '@shared/types'
import { randomUUID } from 'crypto'
import { parseICal, toEventInputs } from './ical'

const FEED_FETCH_TIMEOUT_MS = 15000

/**
 * External ICS feed subscriptions. Each feed is bound to a user-owned
 * calendar; synced events are stored read-only (events.feed_id marker).
 */
export class FeedService {
  constructor(
    private store: EventStore & AuthStore,
    private cache: EventCache,
    private permissions: { assertCanWrite(userId: string, calendarId: string): Promise<void> }
  ) {}

  async createFeed(userId: string, input: { calendarId: string; url: string }): Promise<ICalFeed> {
    await this.permissions.assertCanWrite(userId, input.calendarId)
    if (!/^https?:\/\//i.test(input.url)) throw new Error('Feed URL must start with http:// or https://')
    const feed: ICalFeed = {
      id: randomUUID(),
      calendarId: input.calendarId,
      url: input.url,
      ownerId: userId,
      createdAt: new Date().toISOString()
    }
    await this.store.createFeed(feed)
    return feed
  }

  listFeeds(userId: string): Promise<ICalFeed[]> {
    return this.store.listFeeds(userId)
  }

  async deleteFeed(userId: string, feedId: string): Promise<void> {
    const feed = await this.store.getFeed(feedId)
    if (!feed) throw new Error('Feed not found')
    if (feed.ownerId !== userId) throw new Error('Not your feed')
    await this.store.deleteFeed(feedId)
    await this.cache.invalidateAll()
    await this.cache.publish('events.changed', { type: 'deleted', userId, calendarId: feed.calendarId })
  }

  /** Fetches the feed URL and upserts all contained events (read-only). */
  async syncFeed(feedId: string): Promise<{ created: number; updated: number }> {
    const feed = await this.store.getFeed(feedId)
    if (!feed) return { created: 0, updated: 0 }
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), FEED_FETCH_TIMEOUT_MS)
      let res: Response
      try {
        res = await fetch(feed.url, { signal: controller.signal, headers: { Accept: 'text/calendar,text/plain' } })
      } finally {
        clearTimeout(timer)
      }
      if (!res.ok) throw new Error('HTTP ' + res.status)
      const parsed = parseICal(await res.text())
      const inputs = toEventInputs(parsed, feed.calendarId)
      let created = 0
      let updated = 0
      for (let i = 0; i < inputs.length; i++) {
        const input = inputs[i] as EventInput & { feedId?: string }
        const uid = parsed[i]?.uid ?? randomUUID()
        const feedEventId = `${feed.id}|${uid}`
        const existing = await this.store.findEventByFeedId(feedEventId)
        if (existing) {
          const patch: Partial<EventInput> & { feedId?: string } = { feedId: feedEventId }
          const keep = (a: string | undefined, b: string | undefined): string | undefined => (b ?? a)
          if (existing.title !== input.title) patch.title = input.title
          if (existing.description !== input.description) patch.description = input.description
          if (existing.location !== input.location) patch.location = input.location
          if (existing.allDay !== (input.allDay ?? existing.allDay)) patch.allDay = input.allDay ?? false
          if (existing.startsAt !== input.startsAt) patch.startsAt = keep(existing.startsAt, input.startsAt)
          if (existing.endsAt !== input.endsAt) patch.endsAt = keep(existing.endsAt, input.endsAt)
          if (existing.startDate !== input.startDate) patch.startDate = keep(existing.startDate, input.startDate)
          if (existing.endDate !== input.endDate) patch.endDate = keep(existing.endDate, input.endDate)
          if (existing.rrule !== input.rrule) patch.rrule = input.rrule
          if (Object.keys(patch).length > 1) {
            await this.store.updateEvent(existing.id, patch)
            updated++
          }
        } else {
          await this.store.createEvent({ ...input, feedId: feedEventId })
          created++
        }
      }
      await this.store.updateFeedState(feed.id, { lastFetchedAt: new Date().toISOString(), lastError: null })
      if (created > 0 || updated > 0) {
        await this.cache.invalidateAll()
        await this.cache.publish('events.changed', { type: 'updated', userId: feed.ownerId, calendarId: feed.calendarId })
      }
      return { created, updated }
    } catch (err) {
      await this.store.updateFeedState(feed.id, { lastFetchedAt: new Date().toISOString(), lastError: err instanceof Error ? err.message : String(err) })
      throw err
    }
  }

  /** Syncs all feeds. Used by the periodic scheduler. */
  async syncAll(): Promise<{ ok: number; failed: number }> {
    const users = await this.store.listUsers()
    let ok = 0
    let failed = 0
    for (const user of users) {
      for (const feed of await this.store.listFeeds(user.id)) {
        try {
          await this.syncFeed(feed.id)
          ok++
        } catch {
          failed++
        }
      }
    }
    return { ok, failed }
  }
}
