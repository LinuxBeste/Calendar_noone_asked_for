export const ACCENT_PRESETS = [
  { name: 'Blue', value: '#1a73e8' },
  { name: 'Ocean', value: '#0d9488' },
  { name: 'Forest', value: '#16a34a' },
  { name: 'Olive', value: '#65a30d' },
  { name: 'Amber', value: '#d97706' },
  { name: 'Sunset', value: '#ea580c' },
  { name: 'Rose', value: '#e11d48' },
  { name: 'Fuchsia', value: '#c026d3' },
  { name: 'Violet', value: '#7c3aed' },
  { name: 'Indigo', value: '#4f46e5' },
  { name: 'Cyan', value: '#0891b2' },
  { name: 'Pink', value: '#db2777' },
  { name: 'Slate', value: '#475569' }
]

export interface ThemeSettings {
  darkMode: 'light' | 'dark' | 'auto' | 'scheduled' | string
  accentColor: string
  darkModeStart?: number | null
  darkModeEnd?: number | null
  accentFollowsCalendar?: string
}

export interface CalendarLike {
  id: string
  color: string
}

export function hexToTriplet(hex: string): string {
  const h = hex.replace('#', '')
  return `${parseInt(h.slice(0, 2), 16)} ${parseInt(h.slice(2, 4), 16)} ${parseInt(h.slice(4, 6), 16)}`
}

export function darkenHex(hex: string, amount: number): string {
  const h = hex.replace('#', '')
  const clamp = (v: number): number => Math.max(0, Math.min(255, Math.round(v)))
  const r = clamp(parseInt(h.slice(0, 2), 16) * (1 - amount))
  const g = clamp(parseInt(h.slice(2, 4), 16) * (1 - amount))
  const b = clamp(parseInt(h.slice(4, 6), 16) * (1 - amount))
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

const DEFAULT_DARK_START = 22
const DEFAULT_DARK_END = 7

/** True when `hour` falls inside the dark window [start, end), wrapping over midnight. */
export function inDarkWindow(hour: number, start: number, end: number): boolean {
  if (hour === start && start === end) return true
  return start < end ? hour >= start && hour < end : hour >= start || hour < end
}

export function isDarkMode(mode: string, start?: number | null, end?: number | null): boolean {
  if (mode === 'dark') return true
  if (mode === 'light') return false
  if (mode === 'auto') return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
  if (mode === 'scheduled') return inDarkWindow(new Date().getHours(), start ?? DEFAULT_DARK_START, end ?? DEFAULT_DARK_END)
  return false
}

/** Resolves the effective accent color (calendar-following wins over the fixed accent). */
export function resolveAccent(settings: ThemeSettings, calendars?: CalendarLike[]): string {
  const followed = settings.accentFollowsCalendar
  if (followed && calendars) {
    const cal = calendars.find((c) => c.id === followed)
    if (cal && /^#[0-9a-f]{6}$/i.test(cal.color)) return cal.color
  }
  return settings.accentColor
}

export function applyTheme(settings: ThemeSettings, calendars?: CalendarLike[]): void {
  const root = document.documentElement
  const dark = isDarkMode(settings.darkMode, settings.darkModeStart, settings.darkModeEnd)
  const accent = resolveAccent(settings, calendars)
  root.classList.toggle('dark', dark)
  root.style.setProperty('--accent', hexToTriplet(accent))
  root.style.setProperty('--accent-hover', hexToTriplet(darkenHex(accent, 0.12)))
}