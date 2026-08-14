import { useEffect, useRef, useState } from 'react'

export interface MenuItem {
  label: string
  danger?: boolean
  onClick: () => void
}

interface ContextMenuProps {
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}

export default function ContextMenu({ x, y, items, onClose }: ContextMenuProps): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    let nx = x
    let ny = y
    if (nx + rect.width > window.innerWidth) nx = window.innerWidth - rect.width - 8
    if (ny + rect.height > window.innerHeight) ny = window.innerHeight - rect.height - 8
    setPos({ x: nx, y: ny })
  }, [x, y])

  useEffect(() => {
    const close = (): void => onClose()
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', close)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', close)
      window.removeEventListener('blur', close)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      className="animate-pop-in fixed z-[60] min-w-44 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl py-1"
      style={{ left: pos.x, top: pos.y }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {items.map((item) => (
        <button
          key={item.label}
          onClick={() => {
            onClose()
            item.onClick()
          }}
          className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${
            item.danger ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-200'
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
