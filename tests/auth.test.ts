import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { SqliteStore } from '../electron/db/sqlite'
import { AuthService, AuthError } from '../electron/services/auth'

function makeAuth(): { auth: AuthService; store: SqliteStore } {
  const dir = mkdtempSync(join(tmpdir(), 'cal-auth-'))
  const store = new SqliteStore(join(dir, 'auth.db'))
  return { auth: new AuthService(store), store }
}

describe('AuthService', () => {
  let auth: AuthService
  let store: SqliteStore

  beforeEach(async () => {
    ;({ auth, store } = makeAuth())
    await store.migrate()
  })

  it('registers a user and returns a session', async () => {
    const result = await auth.register({ email: 'jane@example.com', name: 'Jane', password: 'secret123' })
    expect(result.user.email).toBe('jane@example.com')
    expect(result.token).toBeTruthy()
    expect(result.user).not.toHaveProperty('passwordHash')
  })

  it('normalizes email to lowercase', async () => {
    const r1 = await auth.register({ email: 'JOHN@Example.com', name: 'John', password: 'secret123' })
    expect(r1.user.email).toBe('john@example.com')
  })

  it('rejects invalid email and short passwords', async () => {
    await expect(auth.register({ email: 'nope', name: 'X', password: 'secret123' })).rejects.toThrow(AuthError)
    await expect(auth.register({ email: 'a@b.co', name: 'X', password: 'short' })).rejects.toThrow(AuthError)
  })

  it('rejects duplicate registrations', async () => {
    await auth.register({ email: 'a@b.co', name: 'A', password: 'secret123' })
    await expect(auth.register({ email: 'a@b.co', name: 'A2', password: 'other123' })).rejects.toThrow('already exists')
  })

  it('logs in with correct password only', async () => {
    await auth.register({ email: 'a@b.co', name: 'A', password: 'correct-horse' })
    await expect(auth.login('a@b.co', 'wrong-password')).rejects.toThrow('Invalid email or password')
    const result = await auth.login('a@b.co', 'correct-horse')
    expect(result.token).toBeTruthy()
    expect(result.user.name).toBe('A')
  })

  it('validates sessions and rejects expired ones', async () => {
    const { user, token } = await auth.register({ email: 'a@b.co', name: 'A', password: 'secret123' })
    const validated = await auth.validateSession(token)
    expect(validated?.id).toBe(user.id)

    const session = await store.getSession(token)
    expect(session).toBeTruthy()
    await store.deleteSession(token)
    expect(await auth.validateSession(token)).toBeUndefined()
  })

  it('logout invalidates the session', async () => {
    await auth.register({ email: 'a@b.co', name: 'A', password: 'secret123' })
    const { token } = await auth.login('a@b.co', 'secret123')
    await auth.logout(token)
    expect(await auth.validateSession(token)).toBeUndefined()
  })

  it('stores password hashes (never plaintext)', async () => {
    await auth.register({ email: 'a@b.co', name: 'A', password: 'super-secret-42' })
    const user = await store.getUserByEmail('a@b.co')
    expect(user?.passwordHash).toMatch(/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/)
    expect(user?.passwordHash).not.toContain('super-secret-42')
  })

  it('shares calendars with other users and can unshare', async () => {
    const owner = await auth.register({ email: 'owner@x.co', name: 'Owner', password: 'secret123' })
    await auth.register({ email: 'guest@x.co', name: 'Guest', password: 'secret123' })
    const cal = await store.createCalendar({ name: 'Shared', color: '#188038', ownerId: owner.user.id })

    await auth.shareCalendar(cal.id, owner.user.id, { email: 'guest@x.co', role: 'editor' })
    const shares = await auth.listShares(cal.id)
    expect(shares).toHaveLength(1)
    expect(shares[0]).toMatchObject({ role: 'editor', email: 'guest@x.co' })

    await auth.unshareCalendar(cal.id, shares[0]!.userId)
    expect(await auth.listShares(cal.id)).toHaveLength(0)
  })

  it('refuses sharing with self or unknown users', async () => {
    const owner = await auth.register({ email: 'owner@x.co', name: 'Owner', password: 'secret123' })
    const cal = await store.createCalendar({ name: 'Mine', color: '#188038', ownerId: owner.user.id })
    await expect(auth.shareCalendar(cal.id, owner.user.id, { email: 'owner@x.co', role: 'viewer' })).rejects.toThrow('own')
    await expect(auth.shareCalendar(cal.id, owner.user.id, { email: 'ghost@x.co', role: 'viewer' })).rejects.toThrow('No user')
  })
})
