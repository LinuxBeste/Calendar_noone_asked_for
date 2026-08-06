import { useEffect } from 'react'
import { useAuth } from './store'
import LoginScreen from './components/LoginScreen'
import AppShell from './components/AppShell'

export default function App(): React.JSX.Element {
  const { booting, user, boot } = useAuth()

  useEffect(() => {
    void boot()
  }, [boot])

  if (booting) {
    return (
      <div className="flex h-full items-center justify-center text-gray-500">
        <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!user) return <LoginScreen />
  return <AppShell />
}
