import { useConnection } from '../offline'
import { checkConnectionNow, getApiUrl } from '../../web/api'

export default function OfflineBanner(): React.JSX.Element | null {
  const online = useConnection((s) => s.online)

  if (online || __DEMO__) return null

  return (
    <div className="fixed top-0 inset-x-0 z-[60] bg-amber-500 text-white text-sm flex items-center gap-2 px-3 py-2 shadow-lg pt-[env(safe-area-inset-top)]">
      <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" fill="currentColor">
        <path d="M3.27 1.44 2 2.72l4.86 4.86C4.17 8.16 1.9 9.9.68 12a10.8 10.8 0 0 0 4.22 3.78l1.5-1.5a8.7 8.7 0 0 1-3.04-2.28 8.9 8.9 0 0 1 3.34-2.6l2.43 2.43a3.74 3.74 0 0 0-1.13 1.63L5 17a10.8 10.8 0 0 0 2.65 1.72l1.5-1.5A8.7 8.7 0 0 1 7.7 16.8l2.65-2.65 7.87 7.87L20 20.4 3.27 1.44zM9.34 4.33l1.5-1.5A10.9 10.9 0 0 1 12 2.7c6.1 0 11 4.9 11 11a10.9 10.9 0 0 1-2.14 6.42l-1.5-1.5A8.9 8.9 0 0 0 21 13.7c0-4.9-4-8.9-8.9-8.9-.74 0-1.46.1-2.14.28l-1.62 1.5z" />
      </svg>
      <span className="flex-1 min-w-0 truncate">Offline — changes are saved on this device and sync when you're back online</span>
      <button
        onClick={() => void checkConnectionNow()}
        className="shrink-0 px-2 py-1 rounded-md bg-white/20 hover:bg-white/30 text-xs font-medium"
      >
        Retry
      </button>
      <span className="hidden sm:inline shrink-0 text-xs opacity-80" title="Current server address">{getApiUrl()}</span>
    </div>
  )
}