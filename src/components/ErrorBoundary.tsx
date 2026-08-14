import { Component, type ReactNode } from 'react'
import { toErrorMessage } from '../utils/errors'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="h-full flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-6">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full p-6 text-center">
            <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">Something went wrong</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5 break-words">{toErrorMessage(this.state.error)}</p>
            <div className="flex justify-center gap-3">
              <button
                onClick={() => this.setState({ error: null })}
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Try again
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm"
              >
                Reload app
              </button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
