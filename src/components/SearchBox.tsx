import { useEffect, useRef, useState } from 'react'
import { format } from 'date-fns'
import { useAuth, useCalendar } from '../store'
import type { Event } from '@shared/types'

export default function SearchBox(): React.JSX.Element {
  const { token } = useAuth()
  const { setDate, setView } = useCalendar()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Event[]>([])
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if ((e.key === '/' || (e.key === 'k' && (e.ctrlKey || e.metaKey))) && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault()
        const input = boxRef.current?.querySelector('input') as HTMLInputElement | null
        input?.focus()
        input?.select()
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    const outside = (e: MouseEvent): void => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', outside)
    return () => window.removeEventListener('mousedown', outside)
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!query.trim() || !token) {
      setResults([])
      setOpen(false)
      return
    }
    debounceRef.current = setTimeout(() => {
      void window.calendarApi.events.search(token, query.trim()).then((r) => {
        setResults(r as Event[])
        setOpen(true)
      })
    }, 200)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, token])

  const jump = (ev: Event): void => {
    setDate(new Date(ev.startsAt ?? ev.startDate + 'T00:00:00'))
    setView('day')
    setOpen(false)
    setQuery('')
  }

  return (
    <div ref={boxRef} className="relative w-72">
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus-within:ring-2 focus-within:ring-blue-500">
        <svg viewBox="0 0 24 24" className="w-4 h-4 text-gray-400 shrink-0" fill="currentColor">
          <path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
        </svg>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search events ( / )"
          className="flex-1 bg-transparent outline-none text-sm text-gray-800 dark:text-gray-100 placeholder:text-gray-400"
        />
        {open && results.length > 0 && (
          <span className="text-[10px] text-gray-400">{results.length}</span>
        )}
      </div>

      {open && (
        <div className="absolute top-11 left-0 right-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl max-h-80 overflow-y-auto z-50">
          {results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">No results for “{query}”</p>
          ) : (
            results.map((ev) => (
              <button
                key={ev.id}
                onClick={() => jump(ev)}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
              >
                <span className="w-1.5 h-8 rounded-full shrink-0" style={{ backgroundColor: ev.color ?? '#1a73e8' }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 dark:text-gray-100 truncate">{ev.title}</p>
                  {ev.location && <p className="text-xs text-gray-400 truncate">{ev.location}</p>}
                </div>
                <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">
                  {ev.allDay ? (ev.startDate ?? '') : format(new Date(ev.startsAt ?? ''), 'MMM d, HH:mm')}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
