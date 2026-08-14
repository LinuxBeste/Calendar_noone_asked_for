import { useEffect, useState } from 'react'
import { useCalendar } from '../store'
import type { ViewType } from '@shared/types'

const MOBILE_QUERY = '(max-width: 767px)'

const TABS: { id: ViewType; label: string; icon: React.JSX.Element }[] = [
  {
    id: 'day',
    label: 'Day',
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <rect x="4" y="5" width="16" height="14" rx="2" />
        <path d="M12 5v14" />
      </svg>
    )
  },
  {
    id: 'week',
    label: 'Week',
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <rect x="4" y="5" width="16" height="14" rx="2" />
        <path d="M8 5v14M12 5v14M16 5v14" />
      </svg>
    )
  },
  {
    id: 'month',
    label: 'Month',
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M4 10h16M4 15h16M10 4v16M15 4v16" />
      </svg>
    )
  },
  {
    id: 'year',
    label: 'Year',
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <rect x="3" y="4" width="6" height="6" rx="1" />
        <rect x="15" y="4" width="6" height="6" rx="1" />
        <rect x="3" y="14" width="6" height="6" rx="1" />
        <rect x="15" y="14" width="6" height="6" rx="1" />
      </svg>
    )
  },
  {
    id: 'agenda',
    label: 'Agenda',
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M8 7h11M8 12h11M8 17h11" />
        <circle cx="4.5" cy="7" r="1" />
        <circle cx="4.5" cy="12" r="1" />
        <circle cx="4.5" cy="17" r="1" />
      </svg>
    )
  },
  {
    id: 'split',
    label: 'Month + Agenda',
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <rect x="3" y="4" width="18" height="9" rx="1.5" />
        <path d="M3 9h18M9 4v9M15 4v9" />
        <path d="M8 17h11" />
        <circle cx="4.5" cy="17" r="1" />
        <path d="M8 21h11" />
        <circle cx="4.5" cy="21" r="1" />
      </svg>
    )
  }
]

export default function MobileNav(): React.JSX.Element | null {
  const { view, setView } = useCalendar()
  const [show, setShow] = useState(() => window.matchMedia(MOBILE_QUERY).matches)

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY)
    const onChange = (e: MediaQueryListEvent): void => setShow(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  if (!show) return null

  return (
    <>
      <nav className="fixed bottom-0 inset-x-0 z-40 bg-white/95 dark:bg-gray-900/95 backdrop-blur border-t border-gray-200 dark:border-gray-700 pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-stretch">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setView(t.id)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 text-[10px] font-medium ${
                view === t.id
                  ? 'text-accent'
                  : 'text-gray-500 dark:text-gray-400 active:text-gray-800 dark:active:text-gray-200'
              }`}
              aria-label={`View ${t.label}`}
              aria-current={view === t.id ? 'page' : undefined}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </nav>
      <button
        onClick={() => window.dispatchEvent(new Event('calendar:new-event'))}
        className="fixed z-40 bottom-[calc(4rem+env(safe-area-inset-bottom))] right-4 w-14 h-14 rounded-full bg-accent hover:bg-accent-hover text-white shadow-xl flex items-center justify-center active:scale-95 transition-transform"
        title="New event"
        aria-label="New event"
      >
        <svg viewBox="0 0 24 24" className="w-7 h-7" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" /></svg>
      </button>
    </>
  )
}