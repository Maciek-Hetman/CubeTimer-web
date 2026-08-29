/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
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
})
