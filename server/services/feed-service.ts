import type { EventStore, AuthStore, EventCache } from '../db/storage'
import { ValidationError, PermissionError, NotFoundError, BadGatewayError } from '../errors'
import type { EventInput, ICalFeed } from '@shared/types'
import { randomUUID } from 'crypto'
import { lookup } from 'dns/promises'
import { parseICal, toEventInputs } from './ical'
import { logger, redactUrl } from '../logger'

const FEED_FETCH_TIMEOUT_MS = 15000
const FEED_MAX_BYTES = 2 * 1024 * 1024
const FEED_MAX_REDIRECTS = 5

/** True for loopback, private, link-local, CGNAT, multicast and reserved ranges. */
function isPrivateAddress(ip: string): boolean {
  if (ip.includes(':')) {
    const v6 = ip.toLowerCase()
    if (v6 === '::1' || v6 === '::' || v6 === '0:0:0:0:0:0:0:1') return true
    if (v6.startsWith('fe80') || v6.startsWith('fe8') || v6.startsWith('fe9') || v6.startsWith('fea') || v6.startsWith('feb')) return true
    if (v6.startsWith('fc') || v6.startsWith('fd')) return true
    if (v6.startsWith('ff')) return true
    return false
  }
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4) return true
  const [a, b] = parts as [number, number, number, number]
  if (a === 0 || a === 10 || a === 127 || a >= 224) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  return false
}

/**
 * Guards against SSRF: the host must be public, resolve to a non-private
 * address and only ever redirect to other public hosts.
 */
async function assertSafeFeedUrl(url: string): Promise<void> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new ValidationError('Invalid feed URL')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ValidationError('Feed URL must use http or https')
  }
  let addresses: string[]
  try {
    addresses = (await lookup(parsed.hostname, { all: true })).map((r) => r.address)
  } catch {
    throw new ValidationError('Feed host does not resolve')
  }
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    throw new ValidationError('Feed URL must point to a public host')
  }
}

/** Fetches the feed body with redirect validation and a response size cap. */
async function fetchFeedText(startUrl: string, signal: AbortSignal): Promise<string> {
  let url = startUrl
  for (let hop = 0; hop < FEED_MAX_REDIRECTS; hop++) {
    await assertSafeFeedUrl(url)
    const res = await fetch(url, {
      signal,
      redirect: 'manual',
      headers: { Accept: 'text/calendar,text/plain' }
    })
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = new URL(res.headers.get('location')!, url).toString()
      continue
    }
    if (!res.ok) throw new BadGatewayError('Feed responded with HTTP ' + res.status)
    const declared = Number(res.headers.get('content-length') ?? 0)
    if (declared > FEED_MAX_BYTES) throw new BadGatewayError('Feed too large')
    if (!res.body) return res.text()
    const reader = res.body.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > FEED_MAX_BYTES) throw new BadGatewayError('Feed too large')
      chunks.push(value)
    }
    return Buffer.concat(chunks).toString('utf8')
  }
  throw new BadGatewayError('Feed redirected too many times')
}

/**
 * External ICS feed subscriptions. Each feed is bound to a user-owned
 * calendar; synced events are stored read-only (events.feed_id marker).
 */
export class FeedService {
  private syncing = new Set<string>()

  constructor(
    private store: EventStore & AuthStore,
    private cache: EventCache,
    private permissions: { assertCanWrite(userId: string, calendarId: string): Promise<void> }
  ) {}

  async createFeed(userId: string, input: { calendarId: string; url: string }): Promise<ICalFeed> {
    await this.permissions.assertCanWrite(userId, input.calendarId)
    await assertSafeFeedUrl(input.url)
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
    if (!feed) throw new NotFoundError('Feed not found')
    if (feed.ownerId !== userId) throw new PermissionError('Not your feed')
    await this.store.deleteFeed(feedId)
    await this.cache.invalidateAll()
    await this.cache.publish('events.changed', { type: 'deleted', userId, calendarId: feed.calendarId })
  }

  /** Fetches the feed URL and upserts all contained events (read-only). */
  async syncFeed(feedId: string): Promise<{ created: number; updated: number }> {
    if (this.syncing.has(feedId)) return { created: 0, updated: 0 }
    const feed = await this.store.getFeed(feedId)
    if (!feed) return { created: 0, updated: 0 }
    this.syncing.add(feedId)
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), FEED_FETCH_TIMEOUT_MS)
      let body: string
      try {
        body = await fetchFeedText(feed.url, controller.signal)
      } finally {
        clearTimeout(timer)
      }
      const parsed = parseICal(body)
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
      logger.warn({ err, feedId: feed.id, calendarId: feed.calendarId, url: redactUrl(feed.url) }, '[feeds] sync failed')
      throw err
    } finally {
      this.syncing.delete(feedId)
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
