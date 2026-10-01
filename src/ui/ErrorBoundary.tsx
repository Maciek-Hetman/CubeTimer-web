import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Outlet, useLocation, useOutletContext } from 'react-router-dom'
import { Button } from './Button'
import { EmptyState } from './EmptyState'

interface ErrorBoundaryProps {
  children: ReactNode
  /** Replaces the default "Something went wrong" screen; `retry` renders the children again. */
  fallback?: (error: unknown, retry: () => void) => ReactNode
  /** Changing this while the fallback shows tries the children again, e.g. after picking another tab. */
  resetKey?: string
}

interface ErrorBoundaryState {
  error: unknown
  hasError: boolean
}

// Render errors (e.g. a failed Dexie query rethrown by useLiveQuery) would otherwise unmount the whole root.
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, hasError: false }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error, hasError: true }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('Render error caught by ErrorBoundary', error, info.componentStack)
  }

  componentDidUpdate(previous: ErrorBoundaryProps) {
    if (this.state.hasError && previous.resetKey !== this.props.resetKey) {
      this.retry()
    }
  }

  retry = () => {
    this.setState({ error: null, hasError: false })
  }

  render() {
    if (!this.state.hasError) return this.props.children
    if (this.props.fallback) return this.props.fallback(this.state.error, this.retry)
    return (
      <div role="alert">
        <EmptyState
          title="Something went wrong"
          description="An unexpected error occurred. Reloading the page usually fixes this."
          action={
            <Button type="button" variant="primary" onClick={() => location.reload()}>
              Reload
            </Button>
          }
        />
      </div>
    )
  }
}

// Layout route for page content: keyed by full pathname so any navigation clears a caught error
// (a failure in one /admin/* tab must not block the others), and it forwards the shell's outlet context to the pages below it.
export function PageErrorBoundary() {
  const { pathname } = useLocation()
  const context = useOutletContext()
  return (
    <ErrorBoundary key={pathname}>
      <Outlet context={context} />
    </ErrorBoundary>
  )
}
