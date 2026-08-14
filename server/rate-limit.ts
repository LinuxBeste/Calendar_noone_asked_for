/** Simple in-memory per-IP rate limiter for sensitive endpoints (auth). */

interface LimiterOptions {
  max: number
  windowMs: number
}

import { RateLimitError } from './errors'
export { RateLimitError }

export function createRateLimiter({ max, windowMs }: LimiterOptions): (ip: string) => void {
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

  return (ip: string) => {
    const now = Date.now()
    const times = (hits.get(ip) ?? []).filter((t) => now - t < windowMs)
    if (times.length >= max) {
      hits.set(ip, times)
      throw new RateLimitError('Too many attempts, try again later')
    }
    times.push(now)
    hits.set(ip, times)
  }
}
