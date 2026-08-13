/** Plugin catalog shared by the server (state API) and every client (registry). */

export type PluginId = 'smart-tags' | 'daily-quote'

export interface PluginDef {
  id: PluginId
  name: string
  description: string
  version: string
  icon: string
}

export interface PluginState {
  enabled: boolean
  data: Record<string, unknown>
}

export const PLUGIN_CATALOG: PluginDef[] = [
  {
    id: 'smart-tags',
    name: 'Smart Tags',
    description: 'Automatically decorates events with icons and accent colors based on title keywords (meetings, birthdays, travel, workouts…).',
    version: '1.0.0',
    icon: '⚡'
  },
  {
    id: 'daily-quote',
    name: 'Daily Quote',
    description: 'Shows an inspirational quote of the day as a sidebar widget. A tasteful placeholder for third-party plugin integrations.',
    version: '1.0.0',
    icon: '✨'
  }
]

export function isPluginId(id: string): id is PluginId {
  return PLUGIN_CATALOG.some((p) => p.id === id)
}

export function pluginById(id: string): PluginDef | undefined {
  return PLUGIN_CATALOG.find((p) => p.id === id)
}