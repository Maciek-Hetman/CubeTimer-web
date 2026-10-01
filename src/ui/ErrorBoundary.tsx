import { Component, type ReactNode } from 'react'

type Props = {
  /** What to show instead of the children once one of them throws; `retry` renders them again. */
  fallback: (error: unknown, retry: () => void) => ReactNode
  /** Changing this while the fallback shows tries the children again, e.g. after navigating. */
  resetKey?: string
  children: ReactNode
}

type State = { failed: boolean; error: unknown }

/**
 * Catches an error thrown while rendering below it. A failed `useLiveQuery` is one: it rethrows
 * its query's error during render, and without a boundary React unmounts the whole app.
 * React logs every error a boundary catches itself (createRoot's default onCaughtError).
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false, error: null }

  static getDerivedStateFromError(error: unknown): State {
    return { failed: true, error }
  }

  componentDidUpdate(previous: Props) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) {
      this.retry()
    }
  }

  retry = () => {
    this.setState({ failed: false, error: null })
  }

  render() {
    return this.state.failed ? this.props.fallback(this.state.error, this.retry) : this.props.children
  }
}
