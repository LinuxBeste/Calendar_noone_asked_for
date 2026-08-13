import { create } from 'zustand'
import type { Calendar, Event, EventOccurrence } from '@shared/types'

interface ConnectionState {
  online: boolean
  setOnline(online: boolean): void
}

export const useConnection = create<ConnectionState>((set) => ({
  online: typeof navigator !== 'undefined' ? navigator.onLine : true,
  setOnline: (online) => set({ online })
}))

const CACHE_KEY = 'calendar.cache.v1'
const QUEUE_KEY = 'calendar.queue.v1'

export interface OfflineCache {
  savedAt: number
  calendars: Calendar[]
  events: EventOccurrence[]
  trash: Event[]
  settings: Record<string, unknown>
}

export function loadCache(): OfflineCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<OfflineCache>
    if (!parsed || typeof parsed.savedAt !== 'number') return null
    return {
      savedAt: parsed.savedAt,
      calendars: parsed.calendars ?? [],
      events: parsed.events ?? [],
      trash: parsed.trash ?? [],
      settings: parsed.settings ?? {}
    }
  } catch {
    return null
  }
}

export function saveCache(patch: Partial<OfflineCache>): void {
  try {
    const current = loadCache() ?? { savedAt: 0, calendars: [], events: [], trash: [], settings: {} }
    const merged: OfflineCache = { ...current, ...patch, savedAt: Date.now() }
    let serialized = JSON.stringify(merged)
    if (serialized.length > 3_000_000) {
      serialized = JSON.stringify({ ...merged, events: [] })
    }
    if (serialized.length > 4_500_000) {
      serialized = JSON.stringify({ savedAt: merged.savedAt, calendars: [], events: [], trash: [], settings: {} })
    }
    localStorage.setItem(CACHE_KEY, serialized)
  } catch {
    try {
      localStorage.removeItem(CACHE_KEY)
    } catch {
      // storage unavailable entirely — offline cache stays empty
    }
  }
}

export interface QueuedOp {
  id: number
  at: number
  op: string
  payload: unknown
}

export function loadQueue(): QueuedOp[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as QueuedOp[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function enqueueOp(op: string, payload: unknown): void {
  try {
    const queue = loadQueue()
    queue.push({ id: Date.now() + Math.random(), at: Date.now(), op, payload })
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-50)))
  } catch {
    // queue full or storage unavailable — drop, the refresh on reconnect reconciles
  }
}

export function clearQueue(): void {
  try {
    localStorage.removeItem(QUEUE_KEY)
  } catch {
    // ignore
  }
}