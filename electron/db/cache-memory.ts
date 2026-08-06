import type { EventCache } from '@shared/storage'
import type { Event } from '@shared/types'

/**
 * Embedded fallback cache. Pure in-process Map — always available,
 * used when no Redis server is reachable and in tests.
 */
export class InMemoryCache implements EventCache {
  private store = new Map<string, { value: Event[]; expiresAt: number }>()
  private subscribers = new Map<string, Set<(payload: unknown) => void>>()

  async getEvents(rangeKey: string): Promise<Event[] | undefined> {
    const entry = this.store.get(rangeKey)
    if (!entry) return undefined
    if (entry.expiresAt < Date.now()) {
      this.store.delete(rangeKey)
      return undefined
    }
    return entry.value
  }

  async setEvents(rangeKey: string, events: Event[], ttlSeconds = 300): Promise<void> {
    this.store.set(rangeKey, { value: events, expiresAt: Date.now() + ttlSeconds * 1000 })
  }

  async invalidate(rangeKey: string): Promise<void> {
    this.store.delete(rangeKey)
  }

  async invalidateAll(): Promise<void> {
    this.store.clear()
  }

  async publish(channel: string, payload: unknown): Promise<void> {
    const subs = this.subscribers.get(channel)
    if (!subs) return
    for (const handler of subs) {
      try {
        handler(payload)
      } catch (err) {
        console.error('[InMemoryCache] subscriber error', err)
      }
    }
  }

  async subscribe(channel: string, handler: (payload: unknown) => void): Promise<() => void> {
    let subs = this.subscribers.get(channel)
    if (!subs) {
      subs = new Set()
      this.subscribers.set(channel, subs)
    }
    subs.add(handler)
    return () => {
      subs.delete(handler)
    }
  }

  keys(): string[] {
    return [...this.store.keys()]
  }
}
