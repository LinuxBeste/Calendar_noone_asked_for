import { useEffect, useState } from 'react'
import { useAuth, useCalendar, DEFAULT_SETTINGS } from '../store'
import { HOLIDAY_COUNTRIES } from '../utils/holidays'
import { ACCENT_PRESETS, applyTheme, isDarkMode } from '../utils/theme'
import { SETTING_CATEGORIES, SETTING_DEFS, type SettingDef } from '@shared/settings'

const TIMEZONES: string[] = Intl.supportedValuesOf('timeZone')

const selectCls =
  'px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-accent w-full'
const inputCls =
  'px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-accent w-24 text-center'

export default function SettingsDialog({ onClose }: { onClose: () => void }): React.JSX.Element {
  const { token, user } = useAuth()
  const { settings, setSettings, refreshEvents, calendars } = useCalendar()
  const [tab, setTab] = useState(SETTING_CATEGORIES[0]!.id)
  const [search, setSearch] = useState('')
  const [draft, setDraft] = useState(settings)
  const [info, setInfo] = useState<{ using: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    void window.calendarApi.appInfo().then((i) => setInfo(i as { using: string })).catch(() => undefined)
  }, [token])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const save = async (): Promise<void> => {
    if (!token) return
    setSaving(true)
    setError(null)
    try {
      const keys = Object.keys(draft) as (keyof typeof DEFAULT_SETTINGS)[]
      for (const key of keys) {
        if (draft[key] !== settings[key]) {
          await window.calendarApi.settings.set(token, key, draft[key] as never)
        }
      }
      setSettings(draft)
      applyTheme(draft)
      onClose()
      void refreshEvents('0000-01-01T00:00:00.000Z', '9999-12-31T23:59:59.999Z').catch(() => undefined)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const isDark = (mode: string): boolean => isDarkMode(mode)

  const row = 'flex items-center justify-between gap-4 py-2.5'
  const label = 'text-sm text-gray-700 dark:text-gray-200'
  const hint = 'text-xs text-gray-400 dark:text-gray-500'

  const update = (key: string, value: string | number | boolean): void => {
    setDraft({ ...draft, [key]: value })
  }

  const optionsFor = (def: SettingDef): { value: string; label: string }[] => {
    if (def.options) return def.options
    if (def.dynamic === 'timezones') {
      const base = TIMEZONES.map((tz) => ({ value: tz, label: tz }))
      if (def.key === 'timezone') return base
      return [{ value: '', label: 'Off' }, ...base]
    }
    if (def.dynamic === 'holidays') return HOLIDAY_COUNTRIES.map((c) => ({ value: c.code, label: c.label }))
    if (def.dynamic === 'calendars') {
      return [{ value: '', label: 'First calendar' }, ...calendars.map((c) => ({ value: c.id, label: c.name }))]
    }
    return []
  }

  const q = search.trim().toLowerCase()
  const matches = (def: SettingDef): boolean =>
    q.length === 0 || def.label.toLowerCase().includes(q) || (def.hint ?? '').toLowerCase().includes(q) || def.key.toLowerCase().includes(q)
  const groups = q.length === 0
    ? [{ category: SETTING_CATEGORIES.find((c) => c.id === tab)!, defs: SETTING_DEFS.filter((d) => d.category === tab) }]
    : SETTING_CATEGORIES
        .map((c) => ({ category: c, defs: SETTING_DEFS.filter((d) => d.category === c.id && matches(d)) }))
        .filter((g) => g.defs.length > 0)

  const renderControl = (def: SettingDef): React.JSX.Element => {
    const value = draft[def.key as keyof typeof DEFAULT_SETTINGS]
    switch (def.type) {
      case 'boolean':
        return (
          <label className="flex items-center text-sm text-gray-700 dark:text-gray-200" title={def.label}>
            <input type="checkbox" checked={!!value} onChange={(e) => update(def.key, e.target.checked)} className="accent-accent" />
            <span className="sr-only">{def.label}</span>
          </label>
        )
      case 'number':
        return (
          <input
            type="number"
            min={def.min}
            max={def.max}
            step={def.step}
            value={Number(value)}
            onChange={(e) => update(def.key, Math.max(def.min ?? 0, Math.min(def.max ?? 1_000_000, Number(e.target.value) || (def.defaultValue as number))))}
            className={inputCls}
          />
        )
      case 'color':
        return (
          <div className="flex items-center gap-1.5">
            {ACCENT_PRESETS.map((p) => (
              <button
                key={p.value}
                onClick={() => update(def.key, p.value)}
                title={p.name}
                aria-label={`Accent ${p.name}`}
                className={`w-6 h-6 rounded-full transition-transform hover:scale-110 ${
                  String(value).toLowerCase() === p.value ? 'ring-2 ring-offset-2 ring-gray-400 dark:ring-gray-500' : ''
                }`}
                style={{ backgroundColor: p.value }}
              />
            ))}
            <label
              className="w-6 h-6 rounded-full cursor-pointer border border-gray-300 dark:border-gray-600 flex items-center justify-center text-[10px] text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
              title="Custom color"
            >
              +
              <input
                type="color"
                value={String(value)}
                onChange={(e) => update(def.key, e.target.value)}
                className="sr-only"
              />
            </label>
          </div>
        )
      case 'text':
        return (
          <input
            type="text"
            value={String(value)}
            onChange={(e) => update(def.key, e.target.value)}
            className={selectCls + ' w-44'}
          />
        )
      default:
        return (
          <select
            value={String(value)}
            onChange={(e) => {
              const v = e.target.value
              update(def.key, typeof def.defaultValue === 'number' ? Number(v) : v)
            }}
            className={selectCls + ' w-52'}
          >
            {optionsFor(def).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-[820px] max-w-[94vw] h-[600px] max-h-[90vh] flex flex-col md:flex-row overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <aside className="md:w-48 md:shrink-0 md:border-r border-b md:border-b-0 border-gray-200 dark:border-gray-700 p-3 flex md:flex-col gap-1 bg-gray-50 dark:bg-gray-900/40 overflow-x-auto md:overflow-y-auto">
          <h2 className="hidden md:block text-sm font-medium text-gray-900 dark:text-gray-100 px-3 py-2">Settings</h2>
          {SETTING_CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                setTab(c.id)
                setSearch('')
              }}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-left transition-colors whitespace-nowrap ${
                tab === c.id
                  ? 'bg-accent text-white font-medium'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {c.label}
              <span className={`ml-auto text-[10px] px-1.5 rounded-full ${tab === c.id ? 'bg-white/20' : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
                {SETTING_DEFS.filter((d) => d.category === c.id).length}
              </span>
            </button>
          ))}
          <div className="flex-1" />
          <p className="hidden md:block text-[10px] text-gray-400 dark:text-gray-500 px-3">Signed in as {user?.email}</p>
        </aside>

        <main className="flex-1 flex flex-col min-w-0">
          <div className="p-4 md:p-6 pb-0">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search settings…"
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
          <div className="flex-1 overflow-y-auto p-4 md:p-6">
            {error && <p className="text-sm text-red-600 dark:text-red-400 mb-3">{error}</p>}
            {groups.map((g) => (
              <div key={g.category.id} className="mb-5">
                {q.length > 0 && (
                  <h4 className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">{g.category.label}</h4>
                )}
                {q.length === 0 && (
                  <h3 className="text-base font-medium text-gray-900 dark:text-gray-100 mb-2">{g.category.label}</h3>
                )}
                <div className="space-y-1">
                  {g.defs.map((def) => (
                    <div key={def.key} className={row}>
                      <div>
                        <p className={label}>{def.label}</p>
                        {def.hint && <p className={hint}>{def.hint}</p>}
                      </div>
                      <div className="shrink-0">{renderControl(def)}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {q.length > 0 && groups.length === 0 && (
              <p className="text-sm text-gray-400 dark:text-gray-500">No settings match “{search.trim()}”.</p>
            )}
            {tab === 'appearance' && q.length === 0 && (
              <p className={`text-xs ${isDark(String(draft.darkMode)) ? 'text-gray-500 dark:text-gray-400' : 'text-gray-400'}`}>
                Preview: {isDark(String(draft.darkMode)) ? 'dark theme will be applied' : 'light theme will be applied'}
              </p>
            )}
            {tab === 'privacy' && q.length === 0 && <p className={hint + ' pt-3'}>Import/Export of your data is available in the sidebar under "Import / Export".</p>}
          </div>

          <div className="flex items-center justify-between gap-2 px-6 py-4 border-t border-gray-200 dark:border-gray-700 shrink-0">
            <span className="text-xs text-gray-400 dark:text-gray-500" title="Calendar version">v{__APP_VERSION__}</span>
            <div className="flex gap-2">
              <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200">
                Cancel
              </button>
              <button onClick={() => void save()} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-accent hover:bg-accent-hover text-white disabled:opacity-50">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
