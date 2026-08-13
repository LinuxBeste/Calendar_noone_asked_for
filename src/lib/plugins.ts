import { create } from 'zustand'
import type { ReactNode } from 'react'
import { PLUGIN_CATALOG, type PluginId } from '@shared/plugins'
import type { Event } from '@shared/types'

export interface EventDecoration {
  /** Small emoji shown next to the event title. */
  icon?: string
  /** Accent hint color used as a left border on week/day chips. */
  tint?: string
}

export interface CalendarPlugin {
  id: PluginId
  /** Decorate events across all views. Returns null when the event is untouched. */
  decorate?(event: Event): EventDecoration | null
  /** Sidebar widget. Return null to render nothing. */
  renderWidget?(): ReactNode
}

const registry = new Map<PluginId, CalendarPlugin>()

const CACHE_KEY = 'calendar.plugins.enabled.v1'

export function registerPlugin(plugin: CalendarPlugin): void {
  registry.set(plugin.id, plugin)
}

export function pluginEnabled(id: PluginId): boolean {
  return usePlugins.getState().enabled.includes(id)
}

/** Merged decoration from all enabled plugins (later plugins win per field). */
export function decorateEvent(ev: Event): EventDecoration {
  const out: EventDecoration = {}
  for (const id of usePlugins.getState().enabled) {
    const plugin = registry.get(id)
    const deco = plugin?.decorate?.(ev)
    if (deco) {
      if (deco.icon) out.icon = deco.icon
      if (deco.tint) out.tint = deco.tint
    }
  }
  return out
}

/** Sidebar widgets of all enabled plugins. */
export function enabledWidgets(): CalendarPlugin[] {
  const out: CalendarPlugin[] = []
  for (const id of usePlugins.getState().enabled) {
    const plugin = registry.get(id)
    if (plugin?.renderWidget) out.push(plugin)
  }
  return out
}

interface PluginsState {
  enabled: PluginId[]
  loaded: boolean
  load(token: string): Promise<void>
  setEnabled(token: string, id: PluginId, value: boolean): Promise<void>
}

function cacheEnabled(): PluginId[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed.filter((x) => typeof x === 'string') as PluginId[]) : []
  } catch {
    return []
  }
}

export const usePlugins = create<PluginsState>((set, get) => ({
  enabled: cacheEnabled(),
  loaded: false,
  async load(token) {
    if (!token) return
    const fresh: PluginId[] = []
    try {
      for (const def of PLUGIN_CATALOG) {
        const st = (await window.calendarApi.plugins.getState(token, def.id)) as { enabled?: boolean } | null
        if (st?.enabled) fresh.push(def.id)
      }
    } catch {
      // offline — keep the cached enabled list
      set({ loaded: true })
      return
    }
    set({ enabled: fresh, loaded: true })
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(fresh))
    } catch {
      // storage unavailable — ignore
    }
  },
  async setEnabled(token, id, value) {
    const next = value
      ? [...new Set([...get().enabled, id])]
      : get().enabled.filter((x) => x !== id)
    set({ enabled: next })
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(next))
    } catch {
      // ignore
    }
    try {
      await window.calendarApi.plugins.setState(token, id, { enabled: value })
    } catch {
      // offline — the toggle keeps working locally; server syncs on reconnect
    }
  }
}))