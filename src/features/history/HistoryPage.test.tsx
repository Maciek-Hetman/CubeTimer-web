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
    await Promise.all([
      db.solves.clear(),
      db.sessions.clear(),
      db.settings.clear(),
      db.outbox.clear(),
      db.conflicts.clear(),
      db.rejections.clear(),
      db.widgetLayouts.clear(),
      db.meta.clear(),
    ])
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
      expect(screen.getByLabelText('2 solves, mean 12.00')).toBeInTheDocument()
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
      expect(screen.getByLabelText('1 solve, mean DNF')).toBeInTheDocument()
    })
  })

  it('shows the timing device for each solve', async () => {
    const user = userEvent.setup()
    const ownerId = await ensureGuestOwner()

    const session = newSession({
      ownerId,
      name: 'Device Session',
      event: '3x3',
      kind: 'manual',
    })
    await putSession(session, { enqueue: false, baseVersion: 0 })

    await putSolve(
      newSolve({
        ownerId,
        sessionId: session.id,
        durationMs: 9000,
        penalty: 'none',
        scramble: 'R U',
        event: '3x3',
        solvedAt: '2026-01-01T12:00:00.000Z',
        timingDevice: 'external_timer',
      }),
      { enqueue: false, baseVersion: 0 },
    )
    await putSolve(
      newSolve({
        ownerId,
        sessionId: session.id,
        durationMs: 11000,
        penalty: 'none',
        scramble: 'R U2',
        event: '3x3',
        solvedAt: '2026-01-01T12:01:00.000Z',
        timingDevice: 'keyboard',
      }),
      { enqueue: false, baseVersion: 0 },
    )

    renderHistory()

    const heading = await screen.findByRole('heading', { name: 'Device Session' })
    const group = heading.closest('section') as HTMLElement
    await waitFor(() => {
      expect(within(group).getByTitle('Timed with a Bluetooth or wired timer')).toBeInTheDocument()
      expect(within(group).getByTitle('Timed with keyboard or touch')).toBeInTheDocument()
    })

    await user.click(within(group).getByRole('button', { name: 'Expand session' }))

    const list = await within(group).findByRole('list')
    await waitFor(() => {
      expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    })
    const [newest, oldest] = within(list).getAllByRole('listitem')
    expect(newest).toHaveTextContent('11.00')
    expect(newest).toHaveTextContent('Keyboard')
    expect(oldest).toHaveTextContent('9.00')
    expect(oldest).toHaveTextContent('Timer')
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

  describe('event filter', () => {
    async function seedEvents() {
      const ownerId = await ensureGuestOwner()
      const cube3 = newSession({
        ownerId,
        name: 'Three Session',
        event: '3x3',
        kind: 'automatic',
        startedAt: '2026-01-01T12:00:00.000Z',
      })
      const cube5 = newSession({
        ownerId,
        name: 'Five Session',
        event: '5x5',
        kind: 'automatic',
        startedAt: '2026-01-01T12:01:00.000Z',
      })
      await putSession(cube3, { enqueue: false, baseVersion: 0 })
      await putSession(cube5, { enqueue: false, baseVersion: 0 })
      const solves = [
        { sessionId: cube3.id, event: '3x3', durationMs: 10000 },
        { sessionId: cube5.id, event: '5x5', durationMs: 60000 },
        { sessionId: cube5.id, event: '5x5', durationMs: 70000 },
        { sessionId: null, event: '2x2', durationMs: 4000 },
      ] as const
      for (const [i, solve] of solves.entries()) {
        await putSolve(
          newSolve({ ownerId, ...solve, penalty: 'none', scramble: 'R U', solvedAt: `2026-01-01T12:0${i}:00.000Z` }),
          { enqueue: false, baseVersion: 0 },
        )
      }
    }

    function sessionTitles() {
      return screen.queryAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)
    }

    it("defaults to the timer's event and lists only its sessions", async () => {
      await seedEvents()
      renderHistory()

      expect(await screen.findByText('Three Session')).toBeInTheDocument()
      expect(sessionTitles()).toEqual(['Three Session'])
      expect(screen.getByRole('combobox', { name: 'Filter by event' })).toHaveValue('3x3')
      expect(screen.getByText('1 session · 1 solve')).toBeInTheDocument()
    })

    it('switches between one event and all events', async () => {
      const user = userEvent.setup()
      await seedEvents()
      renderHistory()
      const filter = await screen.findByRole('combobox', { name: 'Filter by event' })
      await screen.findByText('Three Session')

      await user.selectOptions(filter, '5x5')
      expect(await screen.findByText('Five Session')).toBeInTheDocument()
      expect(sessionTitles()).toEqual(['Five Session'])
      expect(screen.getByLabelText('2 solves, mean 1:05.00')).toBeInTheDocument()
      expect(screen.getByText('1 session · 2 solves')).toBeInTheDocument()

      await user.selectOptions(filter, 'all')
      await waitFor(() => {
        expect(sessionTitles()).toEqual(['Five Session', 'Three Session', 'Uncategorized Solves'])
      })
      expect(screen.getByText('2x2 · No session')).toBeInTheDocument()
      expect(screen.getByText('3 sessions · 4 solves')).toBeInTheDocument()
    })

    it('shows per-event solve counts in the filter', async () => {
      await seedEvents()
      renderHistory()
      const filter = await screen.findByRole('combobox', { name: 'Filter by event' })

      await waitFor(() => {
        expect(within(filter).getByRole('option', { name: 'All events (4)' })).toBeInTheDocument()
      })
      expect(within(filter).getByRole('option', { name: '5x5 (2)' })).toBeInTheDocument()
      expect(within(filter).getByRole('option', { name: '4x4 (0)' })).toBeInTheDocument()
    })

    it('offers to show all events when the filtered event has no solves', async () => {
      const user = userEvent.setup()
      await seedEvents()
      renderHistory()
      const filter = await screen.findByRole('combobox', { name: 'Filter by event' })
      await screen.findByText('Three Session')

      await user.selectOptions(filter, '4x4')
      expect(await screen.findByText('No 4x4 solves yet')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Show all events' }))
      await waitFor(() => {
        expect(sessionTitles()).toHaveLength(3)
      })
      expect(filter).toHaveValue('all')
    })
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
