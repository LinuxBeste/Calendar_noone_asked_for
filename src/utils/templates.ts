import type { EventInput } from '@shared/types'

export interface EventTemplate {
  name: string
  input: EventInput
}

const KEY = 'calendar.templates'

export function listTemplates(): EventTemplate[] {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(parsed) ? (parsed as EventTemplate[]) : []
  } catch {
    return []
  }
}

function persist(items: EventTemplate[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(0, 20)))
  } catch {
    // storage full/unavailable — ignore
  }
}

export function saveTemplate(input: EventInput): EventTemplate {
  const items = listTemplates().filter((t) => t.name !== input.title)
  const tpl: EventTemplate = { name: input.title, input }
  persist([tpl, ...items])
  return tpl
}

export function removeTemplate(name: string): void {
  persist(listTemplates().filter((t) => t.name !== name))
}
