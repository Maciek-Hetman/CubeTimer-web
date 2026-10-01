import { Component, type ReactNode } from 'react'

type Props = {
  /** What to show instead of the children once one of them throws; `retry` renders them again. */
  fallback: (error: unknown, retry: () => void) => ReactNode
  children: ReactNode
}

type State = { failed: boolean; error: unknown }

/**
 * Catches an error thrown while rendering below it. A failed `useLiveQuery` is one: it rethrows
 * its query's error during render, and without a boundary React unmounts the whole app.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false, error: null }

  static getDerivedStateFromError(error: unknown): State {
    return { failed: true, error }
  }

  retry = () => {
    this.setState({ failed: false, error: null })
  }

  render() {
    return this.state.failed ? this.props.fallback(this.state.error, this.retry) : this.props.children
  }
}
