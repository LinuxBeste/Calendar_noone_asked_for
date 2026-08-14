import { useEffect, useState } from 'react'
import { useAuth, useCalendar, DEFAULT_SETTINGS } from '../store'
import { HOLIDAY_COUNTRIES } from '../utils/holidays'
import { toErrorMessage } from '../utils/errors'

const selectCls =
  'px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-accent'

export default function SetupDialog({ onClose }: { onClose: () => void }): React.JSX.Element {
  const { token } = useAuth()
  const { settings, setSettings, refreshEvents } = useCalendar()
  const [draft, setDraft] = useState({
    timezone: settings.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    firstDayOfWeek: settings.firstDayOfWeek,
    timeFormat: settings.timeFormat,
    darkMode: settings.darkMode,
    holidaysCountry: settings.holidaysCountry,
    defaultEventDuration: settings.defaultEventDuration,
    defaultReminderMinutes: settings.defaultReminderMinutes,
    showHolidays: settings.showHolidays
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const isDark = (mode: string): boolean => mode === 'dark' || (mode === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  const finish = (): void => {
    localStorage.setItem('calendar.setupDone', '1')
    onClose()
  }

  const save = async (): Promise<void> => {
    if (!token) return
    setSaving(true)
    setError(null)
    try {
      const patch = { ...draft } as Partial<typeof DEFAULT_SETTINGS>
      const keys = Object.keys(patch) as (keyof typeof DEFAULT_SETTINGS)[]
      for (const key of keys) {
        if (patch[key] !== settings[key]) {
          await window.calendarApi.settings.set(token, key, patch[key] as never)
        }
      }
      setSettings(patch)
      document.documentElement.classList.toggle('dark', isDark(patch.darkMode as string))
      finish()
      void refreshEvents('0000-01-01T00:00:00.000Z', '9999-12-31T23:59:59.999Z').catch(() => undefined)
    } catch (err) {
      setError(toErrorMessage(err))
      setSaving(false)
    }
  }

  const row = 'flex items-center justify-between gap-3 py-2'
  const label = 'text-sm text-gray-700 dark:text-gray-200'

  return (
    <div className="fixed inset-0 z-50 bg-black/40 animate-fade-in flex items-center justify-center p-4" onClick={() => undefined}>
      <div className="animate-dialog-in w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6">
        <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">Welcome! Let&apos;s set things up</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">These preferences are saved to your account. You can change them anytime in Settings.</p>

        <div className="space-y-1 max-h-[55vh] overflow-y-auto pr-1">
          <div className={row}>
            <span className={label}>Time zone</span>
            <select
              value={draft.timezone}
              onChange={(e) => setDraft({ ...draft, timezone: e.target.value })}
              className={selectCls + ' w-52'}
            >
              {Intl.supportedValuesOf('timeZone').map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </div>
          <div className={row}>
            <span className={label}>Week starts on</span>
            <select
              value={draft.firstDayOfWeek}
              onChange={(e) => setDraft({ ...draft, firstDayOfWeek: Number(e.target.value) as 0 | 1 })}
              className={selectCls + ' w-52'}
            >
              <option value={1}>Monday</option>
              <option value={0}>Sunday</option>
            </select>
          </div>
          <div className={row}>
            <span className={label}>Time format</span>
            <select
              value={draft.timeFormat}
              onChange={(e) => setDraft({ ...draft, timeFormat: e.target.value as '24h' | '12h' })}
              className={selectCls + ' w-52'}
            >
              <option value="24h">24-hour (18:30)</option>
              <option value="12h">12-hour (6:30 PM)</option>
            </select>
          </div>
          <div className={row}>
            <span className={label}>Appearance</span>
            <select
              value={draft.darkMode}
              onChange={(e) => setDraft({ ...draft, darkMode: e.target.value as 'light' | 'dark' | 'auto' })}
              className={selectCls + ' w-52'}
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="auto">Follow system</option>
            </select>
          </div>
          <div className={row}>
            <span className={label}>Holidays</span>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={draft.showHolidays}
                onChange={(e) => setDraft({ ...draft, showHolidays: e.target.checked })}
                className="accent-accent"
              />
              <select
                value={draft.holidaysCountry}
                onChange={(e) => setDraft({ ...draft, holidaysCountry: e.target.value as typeof draft.holidaysCountry })}
                className={selectCls + ' w-40'}
                disabled={!draft.showHolidays}
              >
                {HOLIDAY_COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.label}</option>
                ))}
              </select>
            </label>
          </div>
          <div className={row}>
            <span className={label}>Default event length</span>
            <select
              value={draft.defaultEventDuration}
              onChange={(e) => setDraft({ ...draft, defaultEventDuration: Number(e.target.value) })}
              className={selectCls + ' w-52'}
            >
              {[15, 30, 45, 60, 90, 120].map((m) => (
                <option key={m} value={m}>{m} minutes</option>
              ))}
            </select>
          </div>
          <div className={row}>
            <span className={label}>Default reminder</span>
            <select
              value={draft.defaultReminderMinutes ?? 0}
              onChange={(e) => setDraft({ ...draft, defaultReminderMinutes: Number(e.target.value) })}
              className={selectCls + ' w-52'}
            >
              <option value={0}>None</option>
              <option value={5}>5 minutes before</option>
              <option value={10}>10 minutes before</option>
              <option value={30}>30 minutes before</option>
              <option value={60}>1 hour before</option>
              <option value={1440}>1 day before</option>
            </select>
          </div>
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400 mt-3">{error}</p>}

        <div className="flex items-center justify-between mt-5">
          <button
            onClick={finish}
            className="text-sm text-gray-500 dark:text-gray-400 hover:underline"
          >
            Skip for now
          </button>
          <button
            onClick={() => void save()}
            disabled={saving}
            className="px-4 py-2 text-sm rounded-lg bg-accent hover:bg-accent-hover text-white font-medium disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Get started'}
          </button>
        </div>
      </div>
    </div>
  )
}
