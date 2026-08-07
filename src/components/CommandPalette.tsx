import { useEffect, useMemo, useRef, useState } from 'react'
import { format } from 'date-fns'
import { useAuth, useCalendar } from '../store'
import { resolveDate } from '../utils/quickadd'

interface Command {
  id: string
  group: string
  label: string
  hint?: string
  keywords: string
  run: () => void
}

export default function CommandPalette({ onClose }: { onClose: () => void }): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const commands = useMemo<Command[]>(() => {
    const s = useCalendar.getState()
    const today = new Date()
    const cmds: Command[] = [
      {
        id: 'today',
        group: 'Navigate',
        label: 'Go to today',
        keywords: 'today now t',
        run: () => s.setDate(new Date())
      },
      {
        id: 'new-event',
        group: 'Navigate',
        label: 'New event',
        keywords: 'create add event new',
        run: () => window.dispatchEvent(new Event('calendar:new-event'))
      },
      {
        id: 'quick-add',
        group: 'Navigate',
        label: 'Quick add…',
        keywords: 'quick add fast',
        run: () => window.dispatchEvent(new Event('calendar:quick-add'))
      },
      {
        id: 'find-free',
        group: 'Navigate',
        label: 'Find free time',
        keywords: 'free slot availability schedule',
        run: () => window.dispatchEvent(new Event('calendar:find-free'))
      },
      {
        id: 'settings',
        group: 'Navigate',
        label: 'Open settings',
        keywords: 'settings preferences options',
        run: () => window.dispatchEvent(new Event('calendar:settings'))
      },
      {
        id: 'trash',
        group: 'Navigate',
        label: 'Open trash',
        keywords: 'trash deleted restore bin',
        run: () => window.dispatchEvent(new Event('calendar:trash'))
      },
      ...(['day', 'week', 'month', 'year', 'agenda'] as const).map((v) => ({
        id: `view-${v}`,
        group: 'View',
        label: `${v[0]!.toUpperCase()}${v.slice(1)} view`,
        keywords: `view ${v} switch`,
        run: () => s.setView(v)
      })),
      {
        id: 'toggle-weekends',
        group: 'View',
        label: s.settings.hideWeekends ? 'Show weekends' : 'Hide weekends',
        keywords: 'weekend 5 day week workdays',
        run: () => {
          s.setSettings({ hideWeekends: !s.settings.hideWeekends })
          const token = useAuth.getState().token
          if (token) void window.calendarApi.settings.set(token, 'hideWeekends', !s.settings.hideWeekends)
        }
      }
    ]
    return cmds
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return commands
    return commands.filter((c) => `${c.label} ${c.keywords}`.toLowerCase().includes(q))
  }, [commands, query])

  const dateJump = useMemo(() => {
    if (!query.trim()) return null
    const d = resolveDate(query, new Date())
    return d ? d : null
  }, [query])

  useEffect(() => {
    setActive(0)
  }, [query])

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [active])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActive((a) => Math.min(a + 1, filtered.length - 1))
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActive((a) => Math.max(a - 1, 0))
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        if (dateJump && filtered.length === 0) {
          useCalendar.getState().setDate(dateJump)
          onClose()
          return
        }
        filtered[active]?.run()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, active, filtered, dateJump])

  let groupOrder: string[] = []
  for (const c of filtered) if (!groupOrder.includes(c.group)) groupOrder.push(c.group)

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-start justify-center pt-[12vh] px-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <svg viewBox="0 0 24 24" className="w-4 h-4 text-gray-400 shrink-0" fill="currentColor">
            <path d="M9.5 3a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM2 9.5a7.5 7.5 0 1 1 13.31 4.91l5.64 5.64-1.41 1.41-5.64-5.64A7.5 7.5 0 0 1 2 9.5z" />
          </svg>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or a date (friday, 12/25, tomorrow)…"
            className="flex-1 bg-transparent outline-none text-sm text-gray-800 dark:text-gray-100 placeholder:text-gray-400"
          />
          <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">esc</kbd>
        </div>
        <div ref={listRef} className="max-h-80 overflow-y-auto py-1">
          {dateJump && filtered.length === 0 && (
            <button
              data-idx={0}
              onClick={() => {
                useCalendar.getState().setDate(dateJump)
                onClose()
              }}
              className="w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
            >
              <span className="text-gray-800 dark:text-gray-100">Jump to {format(dateJump, 'EEEE, MMMM d, yyyy')}</span>
              <span className="text-xs text-blue-600 dark:text-blue-400">Go ↵</span>
            </button>
          )}
          {filtered.length === 0 && !dateJump && <p className="px-4 py-6 text-sm text-gray-500 dark:text-gray-400 text-center">No commands match “{query}”</p>}
          {groupOrder.map((g) => (
            <div key={g}>
              <p className="px-4 pt-2 pb-1 text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">{g}</p>
              {filtered
                .filter((c) => c.group === g)
                .map((c) => {
                  const idx = filtered.indexOf(c)
                  return (
                    <button
                      key={c.id}
                      data-idx={idx}
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => {
                        c.run()
                        onClose()
                      }}
                      className={`w-full flex items-center justify-between px-4 py-2 text-sm text-left ${
                        idx === active ? 'bg-blue-50 dark:bg-blue-900/30' : ''
                      }`}
                    >
                      <span className="text-gray-800 dark:text-gray-100">{c.label}</span>
                      {c.hint && <span className="text-xs text-gray-400">{c.hint}</span>}
                    </button>
                  )
                })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
