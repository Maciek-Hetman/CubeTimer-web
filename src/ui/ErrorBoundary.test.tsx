/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
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
})
