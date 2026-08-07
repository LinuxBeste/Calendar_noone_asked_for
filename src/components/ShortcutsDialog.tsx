import { useEffect } from 'react'

const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: 'n', action: 'New event' },
  { keys: 'q', action: 'Quick add event' },
  { keys: 't', action: 'Go to today' },
  { keys: 'd / w / m / y / a', action: 'Switch day / week / month / year / agenda' },
  { keys: '/', action: 'Search events' },
  { keys: '← / →', action: 'Navigate previous / next' },
  { keys: 'Ctrl+Z / Ctrl+Shift+Z', action: 'Undo / redo' },
  { keys: 'Esc', action: 'Close dialog' },
  { keys: '?', action: 'Show this help' }
]

export default function ShortcutsDialog({ onClose }: { onClose: () => void }): React.JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-[420px] max-w-full p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">Keyboard shortcuts</h2>
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          {SHORTCUTS.map((s) => (
            <div key={s.keys} className="flex items-center justify-between py-2">
              <span className="text-sm text-gray-600 dark:text-gray-300">{s.action}</span>
              <kbd className="px-2 py-0.5 text-xs rounded-md bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 font-mono">
                {s.keys}
              </kbd>
            </div>
          ))}
        </div>
        <div className="flex justify-end mt-5">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg bg-accent hover:bg-accent-hover text-white"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
