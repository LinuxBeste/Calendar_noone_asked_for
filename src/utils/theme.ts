export const ACCENT_PRESETS = [
  { name: 'Blue', value: '#1a73e8' },
  { name: 'Ocean', value: '#0d9488' },
  { name: 'Forest', value: '#16a34a' },
  { name: 'Olive', value: '#65a30d' },
  { name: 'Sunset', value: '#ea580c' },
  { name: 'Rose', value: '#e11d48' },
  { name: 'Violet', value: '#7c3aed' },
  { name: 'Pink', value: '#db2777' },
  { name: 'Slate', value: '#475569' }
]

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

export function applyTheme(settings: { darkMode: 'light' | 'dark' | 'auto'; accentColor: string }): void {
  const root = document.documentElement
  const dark =
    settings.darkMode === 'dark' ||
    (settings.darkMode === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  root.classList.toggle('dark', dark)
  root.style.setProperty('--accent', hexToTriplet(settings.accentColor))
  root.style.setProperty('--accent-hover', hexToTriplet(darkenHex(settings.accentColor, 0.12)))
}

export function isDarkMode(mode: string): boolean {
  return mode === 'dark' || (mode === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)
}
