import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'crypto'
import { promisify } from 'util'
import type { AuthStore } from '../db/storage'
import type { LoginResult, User, ShareInput } from '@shared/types'
import { logger } from '../logger'
import { AuthError } from '../errors'
export { AuthError }

const scrypt = promisify(scryptCb)
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

export class AuthService {
  constructor(private store: AuthStore) {}

  async register(input: { email: string; name: string; password: string }): Promise<LoginResult> {
    const email = input.email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AuthError('Invalid email address')
    if (input.password.length < 6) throw new AuthError('Password must be at least 6 characters')
    const existing = await this.store.getUserByEmail(email)
    if (existing) throw new AuthError('An account with this email already exists')
    const passwordHash = await this.hashPassword(input.password)
    const user = await this.store.createUser({ email, name: input.name.trim() || email.split('@')[0]!, passwordHash })
    await this.store.claimOwnerlessCalendars(user.id)
    const token = await this.createSession(user.id)
    logger.info({ event: 'auth.register', userId: user.id, email }, 'user registered')
    return { token, user }
  }

  async login(email: string, password: string): Promise<LoginResult> {
    const normalized = email.trim().toLowerCase()
    const user = await this.store.getUserByEmail(normalized)
    if (!user) {
      logger.warn({ event: 'auth.login_failed', email: normalized }, 'login failed')
      throw new AuthError('Invalid email or password')
    }
    const ok = await this.verifyPassword(password, user.passwordHash)
    if (!ok) {
      logger.warn({ event: 'auth.login_failed', email: normalized }, 'login failed')
      throw new AuthError('Invalid email or password')
    }
    await this.store.claimOwnerlessCalendars(user.id)
    const token = await this.createSession(user.id)
    logger.info({ event: 'auth.login', userId: user.id, email: normalized }, 'user logged in')
    const { passwordHash: _ph, ...safeUser } = user
    return { token, user: safeUser }
  }

  async logout(token: string): Promise<void> {
    await this.store.deleteSession(token)
    logger.info({ event: 'auth.logout' }, 'session closed')
  }

  /** Returns the user for a valid, non-expired session token. */
  async validateSession(token: string): Promise<User | undefined> {
    if (!token) return undefined
    const session = await this.store.getSession(token)
    if (!session) return undefined
    if (new Date(session.expiresAt).getTime() < Date.now()) {
      await this.store.deleteSession(token)
      return undefined
    }
    return this.store.getUser(session.userId)
  }

  async shareCalendar(calendarId: string, ownerId: string, input: ShareInput): Promise<{ userId: string; role: 'viewer' | 'editor' }> {
    const target = await this.store.getUserByEmail(input.email.trim().toLowerCase())
    if (!target) throw new AuthError('No user found with that email')
    if (target.id === ownerId) throw new AuthError('You already own this calendar')
    await this.store.upsertShare(calendarId, target.id, input.role)
    logger.info({ event: 'calendar.share', calendarId, byUserId: ownerId, userId: target.id, role: input.role, email: target.email }, 'calendar shared')
    return { userId: target.id, role: input.role }
  }

  async unshareCalendar(calendarId: string, userId: string): Promise<void> {
    await this.store.removeShare(calendarId, userId)
    logger.info({ event: 'calendar.unshare', calendarId, userId }, 'calendar unshared')
  }

  async listShares(calendarId: string): Promise<{ userId: string; role: 'viewer' | 'editor'; email?: string }[]> {
    const shares = await this.store.listShares(calendarId)
    return Promise.all(
      shares.map(async (s) => {
        const user = await this.store.getUser(s.userId)
        return { userId: s.userId, role: s.role, email: user?.email }
      })
    )
  }

  private async createSession(userId: string): Promise<string> {
    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString()
    await this.store.createSession(token, userId, expiresAt)
    return token
  }

  private async hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16).toString('hex')
    const derived = (await scrypt(password, salt, 64)) as Buffer
    return `scrypt:${salt}:${derived.toString('hex')}`
  }

  private async verifyPassword(password: string, stored: string): Promise<boolean> {
    const [scheme, salt, hash] = stored.split(':')
    if (scheme !== 'scrypt' || !salt || !hash) return false
    const derived = (await scrypt(password, salt, 64)) as Buffer
    const expected = Buffer.from(hash, 'hex')
    return derived.length === expected.length && timingSafeEqual(derived, expected)
  }
}
