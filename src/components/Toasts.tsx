import { useToasts } from '../toasts'

export default function Toasts(): React.JSX.Element {
  const toasts = useToasts((s) => s.toasts)
  const dismiss = useToasts((s) => s.dismiss)

  if (toasts.length === 0) return <></>

  return (
    <div className="fixed bottom-4 right-4 z-[70] flex flex-col gap-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={`text-left px-4 py-2.5 rounded-xl shadow-lg text-sm text-white max-w-xs break-words ${
            t.kind === 'error' ? 'bg-red-600' : t.kind === 'info' ? 'bg-gray-700' : 'bg-gray-900'
          }`}
        >
          {t.message}
        </button>
      ))}
    </div>
  )
}
