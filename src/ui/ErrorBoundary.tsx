import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Outlet, useLocation, useOutletContext } from 'react-router-dom'
import { Button } from './Button'
import { EmptyState } from './EmptyState'

interface ErrorBoundaryState {
  error: unknown
  hasError: boolean
}

// Render errors (e.g. a failed Dexie query rethrown by useLiveQuery) would otherwise unmount the whole root.
export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, hasError: false }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error, hasError: true }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('Render error caught by ErrorBoundary', error, info.componentStack)
  }

  render() {
    if (!this.state.hasError) return this.props.children
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
