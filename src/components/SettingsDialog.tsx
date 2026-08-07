import { useEffect, useState } from 'react'
import { useAuth, useCalendar, DEFAULT_SETTINGS } from '../store'
import { HOLIDAY_COUNTRIES, type HolidayCountry } from '../utils/holidays'
import type { ViewType } from '@shared/types'

type Tab = 'general' | 'appearance' | 'hours' | 'defaults' | 'data'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'general', label: 'General', icon: 'M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm-2 10H7v-2h10v2zm0 4H7v-2h10v2z' },
  { id: 'appearance', label: 'Appearance', icon: 'M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.39 5.39 0 0 1-4.4 2.26 5.4 5.4 0 0 1-3.14-9.8c-.44-.06-.9-.1-1.36-.1z' },
  { id: 'hours', label: 'Working hours', icon: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm4.2 14.2L11 13V7h1.5v5.2l4.5 2.7-.8 1.3z' },
  { id: 'defaults', label: 'Defaults', icon: 'M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 16H5V10h14v10z' },
  { id: 'data', label: 'Data & Account', icon: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z' }
]

const TIMEZONES: string[] = Intl.supportedValuesOf('timeZone')

const selectCls =
  'px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full'
const inputCls =
  'px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 w-20 text-center'

export default function SettingsDialog({ onClose }: { onClose: () => void }): React.JSX.Element {
  const { token, user } = useAuth()
  const { settings, setSettings, refreshEvents, calendars } = useCalendar()
  const [tab, setTab] = useState<Tab>('general')
  const [draft, setDraft] = useState(settings)
  const [info, setInfo] = useState<{ using: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    void window.calendarApi.appInfo().then((i) => setInfo(i as { using: string })).catch(() => undefined)
  }, [token])

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
      document.documentElement.classList.toggle('dark', isDark(draft.darkMode))
      onClose()
      void refreshEvents('0000-01-01T00:00:00.000Z', '9999-12-31T23:59:59.999Z').catch(() => undefined)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const isDark = (mode: string): boolean => mode === 'dark' || (mode === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  const row = 'flex items-center justify-between gap-4 py-2.5'
  const label = 'text-sm text-gray-700 dark:text-gray-200'
  const hint = 'text-xs text-gray-400 dark:text-gray-500'

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-[760px] max-w-[94vw] h-[560px] max-h-[88vh] flex overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <aside className="w-48 shrink-0 border-r border-gray-200 dark:border-gray-700 p-3 flex flex-col gap-1 bg-gray-50 dark:bg-gray-900/40">
          <h2 className="text-sm font-medium text-gray-900 dark:text-gray-100 px-3 py-2">Settings</h2>
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-left transition-colors ${
                tab === t.id
                  ? 'bg-blue-600 text-white font-medium'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" fill="currentColor"><path d={t.icon} /></svg>
              {t.label}
            </button>
          ))}
          <div className="flex-1" />
          <p className="text-[10px] text-gray-400 dark:text-gray-500 px-3">Signed in as {user?.email}</p>
        </aside>

        <main className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 overflow-y-auto p-6">
            {error && <p className="text-sm text-red-600 dark:text-red-400 mb-3">{error}</p>}

            {tab === 'general' && (
              <div className="space-y-1">
                <h3 className="text-base font-medium text-gray-900 dark:text-gray-100 mb-2">General</h3>
                <div className={row}>
                  <div>
                    <p className={label}>Week starts on</p>
                    <p className={hint}>First day of the week in all views</p>
                  </div>
                  <select value={draft.firstDayOfWeek} onChange={(e) => setDraft({ ...draft, firstDayOfWeek: Number(e.target.value) as 0 | 1 })} className={selectCls + ' w-40'}>
                    <option value={1}>Monday</option>
                    <option value={0}>Sunday</option>
                  </select>
                </div>
                <div className={row}>
                  <div>
                    <p className={label}>Time format</p>
                    <p className={hint}>How times are displayed in views and dialogs</p>
                  </div>
                  <select value={draft.timeFormat} onChange={(e) => setDraft({ ...draft, timeFormat: e.target.value as '24h' | '12h' })} className={selectCls + ' w-40'}>
                    <option value="24h">24-hour</option>
                    <option value="12h">12-hour (am/pm)</option>
                  </select>
                </div>
                <div className={row}>
                  <div>
                    <p className={label}>Timezone</p>
                    <p className={hint}>Used to interpret event times</p>
                  </div>
                  <select value={draft.timezone} onChange={(e) => setDraft({ ...draft, timezone: e.target.value })} className={selectCls + ' w-56'}>
                    {TIMEZONES.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </select>
                </div>
                <div className={row}>
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                    <input type="checkbox" checked={draft.showWeekNumbers} onChange={(e) => setDraft({ ...draft, showWeekNumbers: e.target.checked })} className="accent-blue-600" />
                    Show week numbers
                    <span className={hint}>in Month view</span>
                  </label>
                </div>
              </div>
            )}

            {tab === 'appearance' && (
              <div className="space-y-1">
                <h3 className="text-base font-medium text-gray-900 dark:text-gray-100 mb-2">Appearance</h3>
                <div className={row}>
                  <div>
                    <p className={label}>Theme</p>
                    <p className={hint}>Auto follows your operating system</p>
                  </div>
                  <select value={draft.darkMode} onChange={(e) => setDraft({ ...draft, darkMode: e.target.value as 'light' | 'dark' | 'auto' })} className={selectCls + ' w-40'}>
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                    <option value="auto">Auto</option>
                  </select>
                </div>
                <p className={`text-xs ${isDark(draft.darkMode) ? 'text-gray-500 dark:text-gray-400' : 'text-gray-400'}`}>
                  Preview: {isDark(draft.darkMode) ? 'dark theme will be applied' : 'light theme will be applied'}
                </p>
                <div className={row}>
                  <div>
                    <p className={label}>Secondary timezone</p>
                    <p className={hint}>Shown next to event times (empty = off)</p>
                  </div>
                  <select value={draft.secondaryTimezone} onChange={(e) => setDraft({ ...draft, secondaryTimezone: e.target.value })} className={selectCls + ' w-56'}>
                    <option value="">Off</option>
                    {TIMEZONES.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {tab === 'hours' && (
              <div className="space-y-1">
                <h3 className="text-base font-medium text-gray-900 dark:text-gray-100 mb-2">Working hours</h3>
                <div className={row}>
                  <div>
                    <p className={label}>Start / end</p>
                    <p className={hint}>Your typical working window</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input type="number" min={0} max={23} value={draft.workingHoursStart} onChange={(e) => setDraft({ ...draft, workingHoursStart: Math.max(0, Math.min(23, Number(e.target.value) || 0)) })} className={inputCls} />
                    <span className="text-sm text-gray-500">–</span>
                    <input type="number" min={1} max={24} value={draft.workingHoursEnd} onChange={(e) => setDraft({ ...draft, workingHoursEnd: Math.max(1, Math.min(24, Number(e.target.value) || 24)) })} className={inputCls} />
                  </div>
                </div>
                <div className={row}>
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                    <input type="checkbox" checked={draft.hideWeekends} onChange={(e) => setDraft({ ...draft, hideWeekends: e.target.checked })} className="accent-blue-600" />
                    Hide weekends
                    <span className={hint}>Show a 5-day week in Week view</span>
                  </label>
                </div>
                <div className={row}>
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                    <input type="checkbox" checked={draft.showHolidays} onChange={(e) => setDraft({ ...draft, showHolidays: e.target.checked })} className="accent-blue-600" />
                    Show holidays
                    <span className={hint}>Public holidays in week and month view</span>
                  </label>
                </div>
                <div className={row}>
                  <label className="flex items-center justify-between gap-2 text-sm text-gray-700 dark:text-gray-200">
                    Holiday region
                    <select
                      value={draft.holidaysCountry}
                      onChange={(e) => setDraft({ ...draft, holidaysCountry: e.target.value as HolidayCountry })}
                      className={selectCls + ' w-44'}
                      disabled={!draft.showHolidays}
                    >
                      {HOLIDAY_COUNTRIES.map((c) => (
                        <option key={c.code} value={c.code}>{c.label}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            )}

            {tab === 'defaults' && (
              <div className="space-y-1">
                <h3 className="text-base font-medium text-gray-900 dark:text-gray-100 mb-2">Defaults for new events</h3>
                <div className={row}>
                  <div>
                    <p className={label}>Default view</p>
                    <p className={hint}>Shown when the app starts and on "Today"</p>
                  </div>
                  <select value={draft.defaultView} onChange={(e) => setDraft({ ...draft, defaultView: e.target.value as ViewType })} className={selectCls + ' w-40'}>
                    <option value="day">Day</option>
                    <option value="week">Week</option>
                    <option value="month">Month</option>
                    <option value="year">Year</option>
                    <option value="agenda">Agenda</option>
                  </select>
                </div>
                <div className={row}>
                  <div>
                    <p className={label}>Event duration</p>
                    <p className={hint}>Pre-fills the end time of new events (minutes)</p>
                  </div>
                  <input type="number" min={5} step={5} value={draft.defaultEventDuration} onChange={(e) => setDraft({ ...draft, defaultEventDuration: Math.max(5, Number(e.target.value) || 30) })} className={inputCls} />
                </div>
                <div className={row}>
                  <div>
                    <p className={label}>Default reminder</p>
                    <p className={hint}>Pre-selects the reminder for new events</p>
                  </div>
                  <select value={draft.defaultReminderMinutes ?? 0} onChange={(e) => setDraft({ ...draft, defaultReminderMinutes: Number(e.target.value) })} className={selectCls + ' w-44'}>
                    <option value={0}>No reminder</option>
                    <option value={5}>5 minutes before</option>
                    <option value={10}>10 minutes before</option>
                    <option value={30}>30 minutes before</option>
                    <option value={60}>1 hour before</option>
                    <option value={1440}>1 day before</option>
                  </select>
                </div>
                <div className={row}>
                  <div>
                    <p className={label}>Default calendar</p>
                    <p className={hint}>Where new events are created</p>
                  </div>
                  <select value={draft.defaultCalendarId} onChange={(e) => setDraft({ ...draft, defaultCalendarId: e.target.value })} className={selectCls + ' w-44'}>
                    <option value="">First calendar</option>
                    {calendars.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {tab === 'data' && (
              <div className="space-y-1">
                <h3 className="text-base font-medium text-gray-900 dark:text-gray-100 mb-2">Data & Account</h3>
                <div className={row}>
                  <p className={label}>Account</p>
                  <p className="text-sm text-gray-600 dark:text-gray-300">{user?.email}</p>
                </div>
                <div className={row}>
                  <p className={label}>Storage backend</p>
                  <p className="text-sm text-gray-600 dark:text-gray-300 capitalize">{info?.using ?? '…'}</p>
                </div>
                <p className={hint + ' pt-2'}>Import/Export of your data is available in the sidebar under "Import / Export".</p>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-200 dark:border-gray-700 shrink-0">
            <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200">
              Cancel
            </button>
            <button onClick={() => void save()} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </main>
      </div>
    </div>
  )
}
