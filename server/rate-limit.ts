/** Simple in-memory per-IP rate limiter for sensitive endpoints (auth). */

import { RateLimitError } from './errors'
import { logger } from './logger'
export { RateLimitError }

interface LimiterOptions {
  max: number
  windowMs: number
}

export function createRateLimiter({ max, windowMs }: LimiterOptions): (ip: string, route?: string) => void {
  const hits = new Map<string, number[]>()
  const cleanup = setInterval(() => {
    const cutoff = Date.now() - windowMs
    for (const [ip, times] of hits) {
      const kept = times.filter((t) => t >= cutoff)
      if (kept.length === 0) hits.delete(ip)
      else hits.set(ip, kept)
    }
  }, Math.max(windowMs, 60_000))
  cleanup.unref()

  return (ip: string, route?: string) => {
    const now = Date.now()
    const times = (hits.get(ip) ?? []).filter((t) => now - t < windowMs)
    if (times.length >= max) {
      hits.set(ip, times)
      logger.warn({ ip, route, limit: max, windowSec: Math.round(windowMs / 1000) }, 'rate limit exceeded')
      throw new RateLimitError('Too many attempts, try again later')
    }
    times.push(now)
    hits.set(ip, times)
  }
}