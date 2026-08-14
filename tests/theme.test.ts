import { describe, it, expect } from 'vitest'
import { inDarkWindow, isDarkMode, resolveAccent, hexToTriplet, darkenHex } from '../src/utils/theme'

describe('inDarkWindow', () => {
  it('treats equal start and end as always dark', () => {
    expect(inDarkWindow(0, 22, 22)).toBe(true)
    expect(inDarkWindow(12, 22, 22)).toBe(true)
    expect(inDarkWindow(23, 22, 22)).toBe(true)
  })

  it('handles a non-wrapping window (9–17)', () => {
    expect(inDarkWindow(9, 9, 17)).toBe(true)
    expect(inDarkWindow(16, 9, 17)).toBe(true)
    expect(inDarkWindow(17, 9, 17)).toBe(false)
    expect(inDarkWindow(8, 9, 17)).toBe(false)
  })

  it('handles an overnight window (22–7)', () => {
    expect(inDarkWindow(22, 22, 7)).toBe(true)
    expect(inDarkWindow(3, 22, 7)).toBe(true)
    expect(inDarkWindow(6, 22, 7)).toBe(true)
    expect(inDarkWindow(7, 22, 7)).toBe(false)
    expect(inDarkWindow(12, 22, 7)).toBe(false)
  })
})

describe('isDarkMode', () => {
  it('respects light and dark', () => {
    expect(isDarkMode('light')).toBe(false)
    expect(isDarkMode('dark')).toBe(true)
  })

  it('treats unknown modes as light', () => {
    expect(isDarkMode('nope')).toBe(false)
  })

  it('falls back to the default window for scheduled mode without hours', () => {
    expect(isDarkMode('scheduled', null, null)).toBe(inDarkWindow(new Date().getHours(), 22, 7))
  })
})

describe('resolveAccent', () => {
  const calendars = [
    { id: 'a', color: '#16a34a' },
    { id: 'b', color: 'not-a-color' }
  ]

  it('uses the followed calendar color when it matches', () => {
    expect(resolveAccent({ accentColor: '#1a73e8', darkMode: 'light', accentFollowsCalendar: 'a' }, calendars)).toBe('#16a34a')
  })

  it('ignores invalid calendar colors', () => {
    expect(resolveAccent({ accentColor: '#1a73e8', darkMode: 'light', accentFollowsCalendar: 'b' }, calendars)).toBe('#1a73e8')
  })

  it('ignores unknown calendar ids', () => {
    expect(resolveAccent({ accentColor: '#1a73e8', darkMode: 'light', accentFollowsCalendar: 'zzz' }, calendars)).toBe('#1a73e8')
  })

  it('falls back to the fixed accent when following is off', () => {
    expect(resolveAccent({ accentColor: '#1a73e8', darkMode: 'light', accentFollowsCalendar: '' }, calendars)).toBe('#1a73e8')
  })
})

describe('hex helpers', () => {
  it('converts hex to an RGB triplet', () => {
    expect(hexToTriplet('#1a73e8')).toBe('26 115 232')
  })

  it('darkens a color', () => {
    expect(darkenHex('#1a73e8', 0.5)).toBe('#0d3a74')
  })
})
