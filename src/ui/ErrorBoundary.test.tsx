/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
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
    expect(screen.getByText(/couldn't load your local data/i)).toBeInTheDocument()
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
