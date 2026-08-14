import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { useCalendar } from '../store'
import { parseContacts, BIRTHDAYS_COLOR, BIRTHDAYS_NAME, type Contact } from '../utils/birthdays'

const inputCls =
  'px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-accent w-full'

export default function ContactsDialog({ onClose }: { onClose: () => void }): React.JSX.Element {
  const settings = useCalendar((s) => s.settings)
  const setContacts = useCalendar((s) => s.setContacts)
  const [contacts, setLocal] = useState<Contact[]>(() => parseContacts(settings.contacts))
  const [name, setName] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const add = (): void => {
    const trimmed = name.trim()
    if (!trimmed || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
      setError('Enter a name and a birth date (yyyy-MM-dd)')
      return
    }
    setError(null)
    const next = [...contacts, { id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, name: trimmed, birthDate, note: note.trim() || undefined }]
    setLocal(next)
    void setContacts(next)
    setName('')
    setBirthDate('')
    setNote('')
  }

  const remove = (id: string): void => {
    setLocal((prev) => {
      const next = prev.filter((c) => c.id !== id)
      void setContacts(next)
      return next
    })
  }

  const birthdayThisYear = (c: Contact): string => {
    const now = new Date()
    const date = new Date(now.getFullYear(), Number(c.birthDate.slice(5, 7)) - 1, Number(c.birthDate.slice(8, 10)))
    return `${format(date, 'MMMM d')} (${c.birthDate.slice(0, 4)})`
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 animate-fade-in flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="animate-dialog-in bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:w-[440px] max-w-[94vw] max-h-[88dvh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 pb-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: BIRTHDAYS_COLOR }} />
            <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">{BIRTHDAYS_NAME}</h2>
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Birthdays appear as all-day events on the {BIRTHDAYS_NAME} calendar (every year).
          </p>
        </div>

        <div className="px-5 flex gap-2 items-center">
          <input type="text" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
          <input
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            className={inputCls + ' !w-40 shrink-0'}
            title="Birth date"
          />
          <button onClick={add} className="shrink-0 px-3 py-1.5 text-sm rounded-lg bg-accent hover:bg-accent-hover text-white">
            Add
          </button>
        </div>
        <input type="text" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} className={inputCls + ' px-5 mt-2 border-0 border-t border-gray-200 dark:border-gray-700 rounded-none bg-transparent'} />
        {error && <p className="px-5 text-xs text-red-500 mt-1">{error}</p>}

        <div className="flex-1 overflow-y-auto p-5 pt-3 space-y-1 min-h-[120px]">
          {contacts.length === 0 && (
            <p className="text-sm text-gray-400 dark:text-gray-500 py-6 text-center">No contacts yet — add the first one above.</p>
          )}
          {contacts.map((c) => (
            <div key={c.id} className="group flex items-center gap-2 px-1 py-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
              <span className="text-lg shrink-0" aria-hidden>🎂</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-800 dark:text-gray-100 truncate">{c.name}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
                  {birthdayThisYear(c)}
                  {c.note ? ` · ${c.note}` : ''}
                </p>
              </div>
              <button
                onClick={() => remove(c.id)}
                className="opacity-0 group-hover:opacity-100 text-xs text-gray-400 hover:text-red-500 shrink-0"
                title="Remove contact"
                aria-label={`Remove ${c.name}`}
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg bg-accent hover:bg-accent-hover text-white">Done</button>
        </div>
      </div>
    </div>
  )
}