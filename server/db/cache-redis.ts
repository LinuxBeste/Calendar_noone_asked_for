import Redis from 'ioredis'
import { logger } from '../logger'
import type { EventCache } from './storage'
import type { Event } from '@shared/types'

/**
 * Redis-backed cache + pub/sub. Requires a reachable Redis server.
 * All operations tolerate transient failures: cache misses fall back to
 * the store, so the app keeps working without Redis.
 */
export class RedisCache implements EventCache {
  private redis: Redis
  private static TTL_DEFAULT = 300

  constructor(url: string) {
    this.redis = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      retryStrategy: (times) => (times > 5 ? null : Math.min(times * 200, 2000))
    })
    // Without a listener, ioredis throws on 'error' when the retry strategy
    // gives up, which would crash the whole server.
    this.redis.on('error', (err) => console.error('[RedisCache] connection error:', err?.message ?? err))
  }

  async connect(): Promise<void> {
    await this.redis.connect()
  }

  async ping(): Promise<boolean> {
    try {
      return (await this.redis.ping()) === 'PONG'
    } catch {
      return false
    }
  }

  async getEvents(rangeKey: string): Promise<Event[] | undefined> {
    try {
      const raw = await this.redis.get(`events:${rangeKey}`)
      return raw ? (JSON.parse(raw) as Event[]) : undefined
    } catch {
      return undefined
    }
  }

  async setEvents(rangeKey: string, events: Event[], ttlSeconds = RedisCache.TTL_DEFAULT): Promise<void> {
    try {
      await this.redis.set(`events:${rangeKey}`, JSON.stringify(events), 'EX', ttlSeconds)
    } catch {
      // non-fatal
    }
  }

  async invalidate(rangeKey: string): Promise<void> {
    try {
      await this.redis.del(`events:${rangeKey}`)
    } catch {
      // non-fatal
    }
  }

  async invalidateAll(): Promise<void> {
    try {
      // SCAN instead of KEYS: KEYS blocks Redis and is O(N) across the key space.
      const keys: string[] = []
      let cursor = '0'
      do {
        const [next, batch] = await this.redis.scan(cursor, 'MATCH', 'events:*', 'COUNT', 200)
        cursor = next
        keys.push(...batch)
      } while (cursor !== '0')
      if (keys.length > 0) await this.redis.del(...keys)
    } catch {
      // non-fatal
    }
  }

  async publish(channel: string, payload: unknown): Promise<void> {
    try {
      await this.redis.publish(channel, JSON.stringify(payload))
    } catch {
      // non-fatal
    }
  }

  async subscribe(channel: string, handler: (payload: unknown) => void): Promise<() => void> {
    const subscriber = this.redis.duplicate({ lazyConnect: true })
    subscriber.on('error', (err) => console.error('[RedisCache] subscriber error:', err?.message ?? err))
    await subscriber.connect()
    subscriber.on('message', (_ch, message) => {
      try {
        handler(JSON.parse(message))
      } catch (err) {
        console.error('[RedisCache] bad message', err)
      }
    })
    await subscriber.subscribe(channel)
    return () => {
      subscriber.unsubscribe(channel).catch(() => undefined)
      subscriber.disconnect()
    }
  }

  async close(): Promise<void> {
    this.redis.disconnect()
  }
}
