/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { useState } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from './ErrorBoundary'

describe('ErrorBoundary', () => {
  beforeEach(() => {
    // React reports every error a boundary catches.
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('renders its children while nothing throws', () => {
    render(
      <ErrorBoundary fallback={() => <p>Failed</p>}>
        <p>Loaded</p>
      </ErrorBoundary>,
    )
    expect(screen.getByText('Loaded')).toBeInTheDocument()
    expect(screen.queryByText('Failed')).not.toBeInTheDocument()
  })

  it('shows the fallback when a child throws, and the children again on retry', async () => {
    let fail = true
    function Child() {
      if (fail) throw new Error('IndexedDB is gone')
      return <p>Loaded</p>
    }
    render(
      <ErrorBoundary
        fallback={(error, retry) => (
          <button type="button" onClick={retry}>
            {error instanceof Error ? error.message : 'Unknown'}
          </button>
        )}
      >
        <Child />
      </ErrorBoundary>,
    )

    const retry = screen.getByRole('button', { name: 'IndexedDB is gone' })
    fail = false
    await userEvent.click(retry)
    expect(screen.getByText('Loaded')).toBeInTheDocument()
  })

  it('tries the children again when its reset key changes while the fallback shows', () => {
    let fail = true
    function Child() {
      if (fail) throw new Error('IndexedDB is gone')
      return <p>Loaded</p>
    }
    const fallback = () => <p>Failed</p>
    const { rerender } = render(
      <ErrorBoundary resetKey="all" fallback={fallback}>
        <Child />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Failed')).toBeInTheDocument()

    fail = false
    rerender(
      <ErrorBoundary resetKey="all" fallback={fallback}>
        <Child />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Failed')).toBeInTheDocument()
    rerender(
      <ErrorBoundary resetKey="3x3" fallback={fallback}>
        <Child />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Loaded')).toBeInTheDocument()
  })

  it('keeps its children mounted when the reset key changes without a failure', async () => {
    function Counter() {
      const [count, setCount] = useState(0)
      return (
        <button type="button" onClick={() => setCount(count + 1)}>
          {count}
        </button>
      )
    }
    const { rerender } = render(
      <ErrorBoundary resetKey="all" fallback={() => <p>Failed</p>}>
        <Counter />
      </ErrorBoundary>,
    )
    await userEvent.click(screen.getByRole('button', { name: '0' }))

    rerender(
      <ErrorBoundary resetKey="3x3" fallback={() => <p>Failed</p>}>
        <Counter />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('button', { name: '1' })).toBeInTheDocument()
  })
})
