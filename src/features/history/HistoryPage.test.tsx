/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AppProviders } from '../../app/AppProviders'
import { ensureGuestOwner } from '../../app/profile'
import { db } from '../../data/db'
import { newSession, putSession } from '../../data/repositories/sessions'
import { newSolve, putSolve } from '../../data/repositories/solves'
import { HistoryPage } from './HistoryPage'

function renderHistory() {
  return render(
    <MemoryRouter>
      <AppProviders>
        <HistoryPage />
      </AppProviders>
    </MemoryRouter>,
  )
}

describe('HistoryPage', () => {
  beforeEach(async () => {
    cleanup()
    await db.delete()
    await db.open()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders empty state when there are no solves', async () => {
    renderHistory()
    expect(await screen.findByText('No solves yet')).toBeInTheDocument()
  })

  it('displays session solve count and average solve time in session history', async () => {
    const ownerId = await ensureGuestOwner()

    const session = newSession({
      ownerId,
      name: 'Afternoon Practice',
      event: '3x3',
      kind: 'manual',
    })
    await putSession(session, { enqueue: false, baseVersion: 0 })

    // Add solves: 10s (10000ms) and 14s (14000ms) -> avg = 12.00s
    await putSolve(
      newSolve({
        ownerId,
        sessionId: session.id,
        durationMs: 10000,
        penalty: 'none',
        scramble: 'R U R\' U\'',
        event: '3x3',
        solvedAt: '2026-01-01T12:00:00.000Z',
      }),
      { enqueue: false, baseVersion: 0 },
    )
    await putSolve(
      newSolve({
        ownerId,
        sessionId: session.id,
        durationMs: 14000,
        penalty: 'none',
        scramble: 'R U2 R\'',
        event: '3x3',
        solvedAt: '2026-01-01T12:01:00.000Z',
      }),
      { enqueue: false, baseVersion: 0 },
    )

    renderHistory()

    expect(await screen.findByText('Afternoon Practice')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText(/2 solves · Avg: 12\.00/)).toBeInTheDocument()
    })
  })

  it('displays DNF average when all solves in a session are DNF', async () => {
    const ownerId = await ensureGuestOwner()

    const session = newSession({
      ownerId,
      name: 'DNF Session',
      event: '3x3',
      kind: 'manual',
    })
    await putSession(session, { enqueue: false, baseVersion: 0 })

    await putSolve(
      newSolve({
        ownerId,
        sessionId: session.id,
        durationMs: 10000,
        penalty: 'dnf',
        scramble: 'R U',
        event: '3x3',
        solvedAt: '2026-01-01T12:00:00.000Z',
      }),
      { enqueue: false, baseVersion: 0 },
    )

    renderHistory()

    expect(await screen.findByText('DNF Session')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText(/1 solve · Avg: DNF/)).toBeInTheDocument()
    })
  })

  it('renames a session from history', async () => {
    const user = userEvent.setup()
    const ownerId = await ensureGuestOwner()

    const session = newSession({
      ownerId,
      name: 'Original Session Name',
      event: '3x3',
      kind: 'manual',
    })
    await putSession(session, { enqueue: false, baseVersion: 0 })

    await putSolve(
      newSolve({
        ownerId,
        sessionId: session.id,
        durationMs: 10000,
        penalty: 'none',
        scramble: 'R U R\' U\'',
        event: '3x3',
        solvedAt: '2026-01-01T12:00:00.000Z',
      }),
      { enqueue: false, baseVersion: 0 },
    )

    renderHistory()

    expect(await screen.findByText('Original Session Name')).toBeInTheDocument()

    const renameBtn = screen.getByRole('button', { name: 'Rename session Original Session Name' })
    await user.click(renameBtn)

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'Rename session' })).toBeInTheDocument()

    const input = within(dialog).getByLabelText('Session name')
    expect(input).toHaveValue('Original Session Name')

    await user.clear(input)
    await user.type(input, 'Renamed Session')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    expect(await screen.findByText('Renamed Session')).toBeInTheDocument()
    expect(screen.queryByText('Original Session Name')).not.toBeInTheDocument()

    const updatedSession = await db.sessions.get(session.id)
    expect(updatedSession?.name).toBe('Renamed Session')
  })

  it('renames a session by submitting form with enter key', async () => {
    const user = userEvent.setup()
    const ownerId = await ensureGuestOwner()

    const session = newSession({
      ownerId,
      name: 'Old Name',
      event: '3x3',
      kind: 'manual',
    })
    await putSession(session, { enqueue: false, baseVersion: 0 })

    await putSolve(
      newSolve({
        ownerId,
        sessionId: session.id,
        durationMs: 10000,
        penalty: 'none',
        scramble: 'R U R\' U\'',
        event: '3x3',
        solvedAt: '2026-01-01T12:00:00.000Z',
      }),
      { enqueue: false, baseVersion: 0 },
    )

    renderHistory()

    expect(await screen.findByText('Old Name')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Rename session Old Name' }))
    const dialog = screen.getByRole('dialog')
    const input = within(dialog).getByLabelText('Session name')

    await user.clear(input)
    await user.type(input, 'New Name{Enter}')

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    expect(await screen.findByText('New Name')).toBeInTheDocument()
    const updatedSession = await db.sessions.get(session.id)
    expect(updatedSession?.name).toBe('New Name')
  })
})
