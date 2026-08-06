import { useState } from 'react'
import { useAuth, useCalendar, DEFAULT_SETTINGS } from '../store'
import type { ViewType } from '@shared/types'

export default function SettingsDialog({ onClose }: { onClose: () => void }): React.JSX.Element {
  const { token } = useAuth()
  const { settings, setSettings, refreshEvents } = useCalendar()
  const [draft, setDraft] = useState(settings)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async (): Promise<void> => {
    if (!token) return
    setSaving(true)
    setError(null)
    try {
      const changed = (Object.keys(draft) as (keyof typeof DEFAULT_SETTINGS)[]).filter((k) => draft[k] !== settings[k])
      for (const key of changed) {
        await window.calendarApi.settings.set(token, key, draft[key] as never)
      }
      setSettings(draft)
      const dark = draft.darkMode === 'dark' || (draft.darkMode === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)
      document.documentElement.classList.toggle('dark', dark)
      onClose()
      void refreshEvents('0000-01-01T00:00:00.000Z', '9999-12-31T23:59:59.999Z').catch(() => undefined)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const row = 'flex items-center justify-between gap-4 py-2'
  const label = 'text-sm text-gray-700 dark:text-gray-200'
  const select = 'px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-[440px] max-w-[92vw] p-6 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">Settings</h2>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className={row}>
          <span className={label}>Week starts on</span>
          <select value={draft.firstDayOfWeek} onChange={(e) => setDraft({ ...draft, firstDayOfWeek: Number(e.target.value) as 0 | 1 })} className={select}>
            <option value={1}>Monday</option>
            <option value={0}>Sunday</option>
          </select>
        </div>

        <div className={row}>
          <span className={label}>Time format</span>
          <select value={draft.timeFormat} onChange={(e) => setDraft({ ...draft, timeFormat: e.target.value as '24h' | '12h' })} className={select}>
            <option value="24h">24-hour</option>
            <option value="12h">12-hour (am/pm)</option>
          </select>
        </div>

        <div className={row}>
          <span className={label}>Default view</span>
          <select value={draft.defaultView} onChange={(e) => setDraft({ ...draft, defaultView: e.target.value as ViewType })} className={select}>
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
            <option value="year">Year</option>
            <option value="agenda">Agenda</option>
          </select>
        </div>

        <div className={row}>
          <span className={label}>Working hours</span>
          <div className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-200">
            <input type="number" min={0} max={23} value={draft.workingHoursStart} onChange={(e) => setDraft({ ...draft, workingHoursStart: Math.max(0, Math.min(23, Number(e.target.value) || 0)) })} className="w-16 px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-center" />
            <span>–</span>
            <input type="number" min={1} max={24} value={draft.workingHoursEnd} onChange={(e) => setDraft({ ...draft, workingHoursEnd: Math.max(1, Math.min(24, Number(e.target.value) || 24)) })} className="w-16 px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-center" />
          </div>
        </div>

        <div className={row}>
          <span className={label}>Appearance</span>
          <select value={draft.darkMode} onChange={(e) => setDraft({ ...draft, darkMode: e.target.value as 'light' | 'dark' | 'auto' })} className={select}>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="auto">Auto</option>
          </select>
        </div>

        <div className={row}>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
            <input type="checkbox" checked={draft.showWeekNumbers} onChange={(e) => setDraft({ ...draft, showWeekNumbers: e.target.checked })} className="accent-blue-600" />
            Show week numbers
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-3">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200">
            Cancel
          </button>
          <button onClick={() => void save()} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
