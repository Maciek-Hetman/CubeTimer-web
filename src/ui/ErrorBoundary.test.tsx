/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { useState } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, Outlet, Route, Routes, useOutletContext } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ErrorBoundary, PageErrorBoundary } from './ErrorBoundary'

function Boom(): never {
  throw new Error('IndexedDB is closed')
}

function Shell() {
  return (
    <div>
      <nav>
        <Link to="/broken">Broken</Link>
        <Link to="/fine">Fine</Link>
      </nav>
      <Outlet context={{ shellValue: 'from shell' }} />
    </div>
  )
}

function FinePage() {
  const { shellValue } = useOutletContext<{ shellValue: string }>()
  return <p>Fine page: {shellValue}</p>
}

function renderRoutes(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route element={<Shell />}>
          <Route element={<PageErrorBoundary />}>
            <Route path="/broken" element={<Boom />} />
            <Route path="/fine" element={<FinePage />} />
          </Route>
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('ErrorBoundary', () => {
  let consoleError: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    cleanup()
    consoleError.mockRestore()
    vi.unstubAllGlobals()
  })

  it('renders children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <p>All good</p>
      </ErrorBoundary>,
    )
    expect(screen.getByText('All good')).toBeInTheDocument()
  })

  it('renders the fallback and logs when a child throws', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument()
    expect(screen.getByText(/an unexpected error occurred\. reloading the page usually fixes this\./i)).toBeInTheDocument()
    expect(consoleError).toHaveBeenCalledWith(
      'Render error caught by ErrorBoundary',
      expect.objectContaining({ message: 'IndexedDB is closed' }),
      expect.anything(),
    )
  })

  it('reloads the page from the fallback', async () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }))
    expect(reload).toHaveBeenCalledOnce()
  })
})

describe('PageErrorBoundary', () => {
  let consoleError: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    cleanup()
    consoleError.mockRestore()
  })

  it('keeps the shell usable and resets when navigating away', async () => {
    renderRoutes('/broken')

    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Fine' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('link', { name: 'Fine' }))

    expect(screen.queryByRole('heading', { name: 'Something went wrong' })).not.toBeInTheDocument()
    expect(screen.getByText('Fine page: from shell')).toBeInTheDocument()
  })

  it('shows the fallback again on returning to the failing page', async () => {
    renderRoutes('/fine')
    expect(screen.getByText('Fine page: from shell')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('link', { name: 'Broken' }))
    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument()
  })
})

describe('ErrorBoundary with a custom fallback', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
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
