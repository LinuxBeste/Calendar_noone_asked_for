import { describe, it, expect, beforeEach } from 'vitest'
import { parseQuickAdd } from '../src/utils/quickadd'
import { listTemplates, saveTemplate, removeTemplate } from '../src/utils/templates'

class MemoryStorage implements Storage {
  private map = new Map<string, string>()
  get length(): number {
    return this.map.size
  }
  clear(): void {
    this.map.clear()
  }
  getItem(key: string): string | null {
    return this.map.get(key) ?? null
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null
  }
  removeItem(key: string): void {
    this.map.delete(key)
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value)
  }
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true })
})

describe('parseQuickAdd', () => {
  // 2026-08-07 is a Friday
  const base = new Date('2026-08-07T10:00:00')

  it('treats a bare title as an all-day event', () => {
    const r = parseQuickAdd('Lunch', base, 60)
    expect(r?.title).toBe('Lunch')
    expect(r?.allDay).toBe(true)
    expect(r?.startDate).toBe('2026-08-07')
  })

  it('parses a time and an explicit duration', () => {
    const r = parseQuickAdd('Standup at 9:30 for 15min', base, 60)
    expect(r?.title).toBe('Standup')
    expect(r?.allDay).toBe(false)
    expect(r?.startsAt).toContain('09:30:00.000')
    expect(r?.endsAt).toContain('09:45:00.000')
  })

  it('parses hours as duration', () => {
    const r = parseQuickAdd('Workshop tomorrow 14:00 for 2h', base, 60)
    expect(r?.startsAt).toContain('2026-08-08T14:00:00.000')
    expect(r?.endsAt).toContain('2026-08-08T16:00:00.000')
  })

  it('applies the default duration when none is given', () => {
    const r = parseQuickAdd('Demo at 11:00', base, 30)
    expect(r?.endsAt).toContain('11:30:00.000')
  })

  it('parses an explicit weekday (today stays today)', () => {
    const r = parseQuickAdd('Holiday on friday', base, 60)
    expect(r?.allDay).toBe(true)
    expect(r?.startDate).toBe('2026-08-07')
  })

  it('parses "next" weekdays', () => {
    const r = parseQuickAdd('Planning next monday', base, 60)
    expect(r?.startDate).toBe('2026-08-10')
  })

  it('still returns a result for unusual input (never null on non-empty)', () => {
    expect(parseQuickAdd('!§$%&', base, 60)).not.toBeNull()
  })
})

describe('event templates (localStorage)', () => {
  it('saves (newest first), lists and removes templates', () => {
    expect(listTemplates()).toHaveLength(0)
    saveTemplate({ calendarId: 'c1', title: 'Weekly sync', allDay: false, busy: true, startsAt: '2026-08-07T10:00:00.000', endsAt: '2026-08-07T11:00:00.000' })
    saveTemplate({ calendarId: 'c1', title: 'Lunch', allDay: false, busy: true })
    expect(listTemplates().map((t) => t.name)).toEqual(['Lunch', 'Weekly sync'])
    removeTemplate('Lunch')
    expect(listTemplates().map((t) => t.name)).toEqual(['Weekly sync'])
  })

  it('replaces a template with the same name', () => {
    saveTemplate({ calendarId: 'c1', title: 'Sync', allDay: false, busy: true })
    saveTemplate({ calendarId: 'c2', title: 'Sync', allDay: false, busy: true, color: '#ff0000' })
    const list = listTemplates()
    expect(list).toHaveLength(1)
    expect(list[0]?.input.calendarId).toBe('c2')
  })
})
