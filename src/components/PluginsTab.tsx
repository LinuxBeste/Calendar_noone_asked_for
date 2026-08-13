import { useEffect, useState } from 'react'
import { PLUGIN_CATALOG, type PluginId } from '@shared/plugins'
import { usePlugins } from '../lib/plugins'
import { toast } from '../toasts'

interface PluginsTabProps {
  token: string | null
}

export default function PluginsTab({ token }: PluginsTabProps): React.JSX.Element {
  const enabled = usePlugins((s) => s.enabled)
  const setEnabled = usePlugins((s) => s.setEnabled)
  const loaded = usePlugins((s) => s.loaded)
  const [busy, setBusy] = useState<PluginId | null>(null)

  useEffect(() => {
    if (token && !loaded) void usePlugins.getState().load(token)
  }, [token, loaded])

  const toggle = async (id: PluginId, value: boolean): Promise<void> => {
    if (!token) return
    setBusy(id)
    try {
      await setEnabled(token, id, value)
    } catch {
      toast('Could not save plugin state', 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mb-5">
      <h3 className="text-base font-medium text-gray-900 dark:text-gray-100 mb-1">Plugins</h3>
      <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
        Plugins run on every client (desktop, web, mobile). Their state syncs through your server, so toggles follow you across
        devices.
      </p>
      <div className="space-y-2">
        {PLUGIN_CATALOG.map((def) => {
          const on = enabled.includes(def.id)
          return (
            <div key={def.id} className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40">
              <span className="text-xl leading-none mt-0.5">{def.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900 dark:text-gray-100 flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{def.name}</span>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">v{def.version}</span>
                  {on && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent/15 text-accent">Active</span>}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{def.description}</p>
              </div>
              <button
                role="switch"
                aria-checked={on}
                aria-label={`Toggle ${def.name}`}
                onClick={() => void toggle(def.id, !on)}
                disabled={busy === def.id || !token}
                className={`relative w-10 h-6 rounded-full transition-colors shrink-0 disabled:opacity-50 ${on ? 'bg-accent' : 'bg-gray-300 dark:bg-gray-600'}`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-[18px]' : 'translate-x-0.5'}`}
                />
              </button>
            </div>
          )
        })}
      </div>
      {!token && <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">Plugins are available after signing in.</p>}
    </div>
  )
}