import { useState } from 'react'
import { useAuth } from '../store'
import { toErrorMessage } from '../utils/errors'

export default function LoginScreen(): React.JSX.Element {
  const { login, register } = useAuth()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (mode === 'login') await login(email, password)
      else await register(email, name, password)
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="h-full flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="w-full max-w-sm bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 mx-4">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center text-white font-bold">
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <path d="M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 16H5V10h14v10z" />
            </svg>
          </div>
          <h1 className="text-xl font-medium text-gray-800 dark:text-gray-100">Calendar</h1>
        </div>

        <h2 className="text-lg font-medium mb-4 text-gray-800 dark:text-gray-100">
          {mode === 'login' ? 'Sign in' : 'Create account'}
        </h2>

        <form onSubmit={submit} className="space-y-3">
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-accent"
          />
          {mode === 'register' && (
            <input
              type="text"
              required
              placeholder="Display name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-accent"
            />
          )}
          <input
            type="password"
            required
            minLength={6}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-accent"
          />
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full py-2 rounded-lg bg-accent hover:bg-accent-hover disabled:opacity-50 text-white font-medium"
          >
            {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <button
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login')
            setError(null)
          }}
          className="mt-4 text-sm text-accent dark:text-accent hover:underline"
        >
          {mode === 'login' ? 'No account? Create one' : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>
  )
}
