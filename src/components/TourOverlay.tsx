import { useEffect, useState } from 'react'

interface TourStep {
  title: string
  body: string
  selector: string
  position: 'top' | 'bottom' | 'left' | 'right'
}

const STEPS: TourStep[] = [
  {
    title: 'Welcome to the calendar demo',
    body: 'Everything you see is pre-filled sample data running right in your browser. Nothing is sent anywhere.',
    selector: '.fixed.inset-0',
    position: 'bottom'
  },
  {
    title: 'Create events',
    body: 'Drag across a day or time slot to create a new event, or click "+ New" in the toolbar.',
    selector: 'header, [class~="border-b"]',
    position: 'bottom'
  },
  {
    title: 'Switch views',
    body: 'Day, Week, Month, Year and Agenda views — bottom bar on phones, top bar on desktop. Try the Agenda for a clean list!',
    selector: '.bg-gray-100',
    position: 'bottom'
  },
  {
    title: 'Settings & account',
    body: 'Click the avatar to open settings, change the theme, or sign out and back in.',
    selector: '[title="Account menu"]',
    position: 'bottom'
  },
  {
    title: 'Search & shortcuts',
    body: 'Press "/" to search events, Ctrl+K for the command palette, "?" for all keyboard shortcuts. Have fun!',
    selector: '.fixed.inset-0',
    position: 'bottom'
  }
]

export default function TourOverlay({ onClose }: { onClose: () => void }): React.JSX.Element | null {
  const [step, setStep] = useState(0)
  const [box, setBox] = useState<DOMRect | null>(null)

  useEffect(() => {
    const el = document.querySelector(STEPS[step]!.selector)
    if (el) setBox(el.getBoundingClientRect())
    else setBox(null)
  }, [step])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' || e.key === 'Enter') setStep((s) => s + 1)
      if (e.key === 'ArrowRight') setStep((s) => s + 1)
      if (e.key === 'ArrowLeft') setStep((s) => Math.max(0, s - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!__DEMO__) return null
  const s = STEPS[step]
  if (!s) {
    onClose()
    return null
  }

  const positionStyle = (): React.CSSProperties => {
    const b = box ?? { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }
    const gap = 12
    const w = 320
    if (s.position === 'bottom') return { top: b.bottom + gap, left: Math.max(12, Math.min(b.left + b.width / 2 - w / 2, window.innerWidth - w - 12)), width: w }
    if (s.position === 'top') return { top: Math.max(12, b.top - gap - 140), left: Math.max(12, Math.min(b.left + b.width / 2 - w / 2, window.innerWidth - w - 12)), width: w }
    if (s.position === 'right') return { top: b.top, left: b.right + gap, width: w }
    return { top: b.top, left: Math.max(12, b.left - w - gap), width: w }
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 flex" onClick={() => setStep((x) => x + 1)}>
      <div
        className="absolute bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-5 text-gray-800 dark:text-gray-100"
        style={positionStyle()}
      >
        <p className="text-xs font-medium uppercase tracking-wide text-accent mb-1">
          Demo tour · {step + 1}/{STEPS.length}
        </p>
        <h3 className="font-semibold mb-1">{s.title}</h3>
        <p className="text-sm text-gray-600 dark:text-gray-300">{s.body}</p>
        <div className="mt-4 flex items-center justify-between">
          <button
            onClick={(e) => {
              e.stopPropagation()
              setStep((x) => Math.max(0, x - 1))
            }}
            disabled={step === 0}
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-40"
          >
            Back
          </button>
          <div className="flex gap-1">
            {STEPS.map((_, i) => (
              <span key={i} className={`w-1.5 h-1.5 rounded-full ${i === step ? 'bg-accent' : 'bg-gray-300 dark:bg-gray-600'}`} />
            ))}
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation()
              if (step === STEPS.length - 1) onClose()
              else setStep((x) => x + 1)
            }}
            className="px-3 py-1.5 text-sm rounded-lg bg-accent text-white"
          >
            {step === STEPS.length - 1 ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  )
}