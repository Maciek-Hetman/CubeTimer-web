/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AppProviders } from '../../app/AppProviders'
import { ensureGuestOwner } from '../../app/profile'
import { db, getOrCreateSettings } from '../../data/db'
import { newSession, putSession } from '../../data/repositories/sessions'
import { newSolve, putSolve } from '../../data/repositories/solves'
import { computeSolveStats } from '../../data/repositories/solveStats'
import { adoptGuestData } from '../../sync/guestMerge'
import { TimerPage } from '../../features/timer/TimerPage'
import { HistoryPage } from '../../features/history/HistoryPage'

async function resetDb() {
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
}

function renderWithApp(ui: React.ReactElement) {
  return render(
    <MemoryRouter>
      <AppProviders>{ui}</AppProviders>
    </MemoryRouter>,
  )
}

describe('Tier 3: Cross-Feature Interactions E2E Tests', () => {
  beforeEach(async () => {
    cleanup()
    await resetDb()
  })

  afterEach(() => {
    cleanup()
  })

  describe('1. Session Switching & Scramble / Solve Isolation', () => {
    it('associates new solve with switched session and maintains scramble validity', async () => {
      const user = userEvent.setup()
      const ownerId = await ensureGuestOwner()
      const sessionA = newSession({ ownerId, name: 'Warmup', event: '3x3', kind: 'manual' })
      const sessionB = newSession({ ownerId, name: 'Comp Practice', event: '3x3', kind: 'manual' })
      await putSession(sessionA, { enqueue: false, baseVersion: 0 })
      await putSession(sessionB, { enqueue: false, baseVersion: 0 })

      const settings = await getOrCreateSettings(ownerId)
      await db.settings.put({
        ...settings,
        sessionMode: 'manual',
        currentSessionIds: { '3x3': sessionA.id },
      })

      renderWithApp(<TimerPage variant="mobile" />)
      await screen.findByRole('button', { name: 'Timer' })

      // Open SessionManager and switch to sessionB
      await user.click(await screen.findByRole('button', { name: /sessions/i }))
      const dialog = await screen.findByRole('dialog', { name: /sessions/i })
      await user.click(within(dialog).getByRole('button', { name: 'Comp Practice' }))

      // Complete a solve
      fireEvent.keyDown(window, { code: 'Space', key: ' ' })
      await waitFor(() => {
        expect(document.querySelector('.timer-hint')).toHaveTextContent(/Release to start/i)
      }, { timeout: 4000 })
      fireEvent.keyUp(window, { code: 'Space', key: ' ' })
      await waitFor(() => {
        expect(document.querySelector('.timer-hint')).toHaveTextContent(/Tap or press Space to stop/i)
      })
      fireEvent.keyDown(window, { code: 'Space', key: ' ' })
      expect(await screen.findByText(/Saved /i)).toBeInTheDocument()

      await waitFor(async () => {
        const solves = await db.solves.where('ownerId').equals(ownerId).toArray()
        expect(solves.length).toBe(1)
        expect(solves[0].sessionId).toBe(sessionB.id)
      })
    })

    it('isolates solve counts and statistics between separate sessions', async () => {
      const ownerId = await ensureGuestOwner()
      const sessionA = newSession({ ownerId, name: 'Morning', event: '3x3', kind: 'manual' })
      const sessionB = newSession({ ownerId, name: 'Evening', event: '3x3', kind: 'manual' })
      await putSession(sessionA, { enqueue: false, baseVersion: 0 })
      await putSession(sessionB, { enqueue: false, baseVersion: 0 })

      // Add 3 solves to Session A
      for (const time of [10000, 11000, 12000]) {
        await putSolve(
          newSolve({ ownerId, sessionId: sessionA.id, durationMs: time, penalty: 'none', scramble: '', event: '3x3' }),
          { enqueue: false, baseVersion: 0 },
        )
      }

      // Add 2 solves to Session B
      for (const time of [15000, 16000]) {
        await putSolve(
          newSolve({ ownerId, sessionId: sessionB.id, durationMs: time, penalty: 'none', scramble: '', event: '3x3' }),
          { enqueue: false, baseVersion: 0 },
        )
      }

      const statsA = await computeSolveStats(ownerId, '3x3', sessionA.id)
      const statsB = await computeSolveStats(ownerId, '3x3', sessionB.id)
      const allStats = await computeSolveStats(ownerId, '3x3')

      expect(statsA.count).toBe(3)
      expect(statsA.mean).toBe(11000)
      expect(statsB.count).toBe(2)
      expect(statsB.mean).toBe(15500)
      expect(allStats.count).toBe(5)
    })
  })

  describe('2. Penalty Modification Live Reactive Propagation', () => {
    it('recalculates Ao5 immediately when a solve in History is penalized with +2', async () => {
      const user = userEvent.setup()
      const ownerId = await ensureGuestOwner()
      const session = newSession({ ownerId, name: 'Live Ao5 Session', event: '3x3', kind: 'manual' })
      await putSession(session, { enqueue: false, baseVersion: 0 })

      // 5 solves: 10s, 10s, 10s, 10s, 10s -> Ao5 = 10.00s
      const solveIds: string[] = []
      for (let i = 0; i < 5; i++) {
        const s = newSolve({
          ownerId,
          sessionId: session.id,
          durationMs: 10000,
          penalty: 'none',
          scramble: "R U R' U'",
          event: '3x3',
          solvedAt: new Date(2026, 0, 1, 12, i).toISOString(),
        })
        await putSolve(s, { enqueue: false, baseVersion: 0 })
        solveIds.push(s.id)
      }

      renderWithApp(<HistoryPage />)
      await user.click(await screen.findByText('Live Ao5 Session'))
      await waitFor(() => {
        expect(screen.getByText(/5 solves · Avg: 10\.00/)).toBeInTheDocument()
      })

      // Add +2 to the first and second solves
      const buttons1 = await screen.findAllByRole('button', { name: '+2' })
      await user.click(buttons1[0])
      await waitFor(async () => {
        expect((await db.solves.get(solveIds[4]))?.penalty).toBe('plus_two')
      })

      const buttons2 = await screen.findAllByRole('button', { name: '+2' })
      await user.click(buttons2[1])
      await waitFor(async () => {
        expect((await db.solves.get(solveIds[3]))?.penalty).toBe('plus_two')
      })

      await waitFor(() => {
        expect(screen.getByText(/5 solves · Avg: 10\.80/)).toBeInTheDocument()
      })

      const stats = await computeSolveStats(ownerId, '3x3', session.id)
      expect(stats.ao5).toBeCloseTo(10666.67, 1)
    })

    it('updates Best Single personal best when fastest solve is marked DNF', async () => {
      const user = userEvent.setup()
      const ownerId = await ensureGuestOwner()
      const session = newSession({ ownerId, name: 'PB Invalidation', event: '3x3', kind: 'manual' })
      await putSession(session, { enqueue: false, baseVersion: 0 })

      // Fastest solve = 7.50s, other solves = 12.00s, 13.00s
      const fastestSolve = newSolve({
        ownerId,
        sessionId: session.id,
        durationMs: 7500,
        penalty: 'none',
        scramble: '',
        event: '3x3',
        solvedAt: '2026-01-01T10:00:00Z',
      })
      const solve2 = newSolve({
        ownerId,
        sessionId: session.id,
        durationMs: 12000,
        penalty: 'none',
        scramble: '',
        event: '3x3',
        solvedAt: '2026-01-01T10:01:00Z',
      })
      await putSolve(fastestSolve, { enqueue: false, baseVersion: 0 })
      await putSolve(solve2, { enqueue: false, baseVersion: 0 })

      renderWithApp(<HistoryPage />)
      await user.click(await screen.findByText('PB Invalidation'))

      // Fastest solve is second in list (older timestamp)
      const dnfButtons = await screen.findAllByRole('button', { name: 'DNF' })
      await user.click(dnfButtons[1])

      await waitFor(async () => {
        const stats = await computeSolveStats(ownerId, '3x3')
        expect(stats.best).toBe(12000)
      })
    })
  })

  describe('3. Event Switching & Scramble Isolation', () => {
    it('switches cube event and updates scramble, sessions, and solve statistics cleanly', async () => {
      const user = userEvent.setup()
      const ownerId = await ensureGuestOwner()

      // Create a 3x3 session with 3x3 solves
      const s333 = newSession({ ownerId, name: '3x3 Session', event: '3x3', kind: 'manual' })
      await putSession(s333, { enqueue: false, baseVersion: 0 })
      await putSolve(
        newSolve({ ownerId, sessionId: s333.id, durationMs: 10500, penalty: 'none', scramble: "R U R' U'", event: '3x3' }),
        { enqueue: false, baseVersion: 0 },
      )

      // Create a 2x2 session with 2x2 solves
      const s222 = newSession({ ownerId, name: '2x2 Session', event: '2x2', kind: 'manual' })
      await putSession(s222, { enqueue: false, baseVersion: 0 })
      await putSolve(
        newSolve({ ownerId, sessionId: s222.id, durationMs: 3200, penalty: 'none', scramble: "R U R'", event: '2x2' }),
        { enqueue: false, baseVersion: 0 },
      )

      const settings = await getOrCreateSettings(ownerId)
      await db.settings.put({
        ...settings,
        event: '3x3',
        sessionMode: 'manual',
        currentSessionIds: { '3x3': s333.id, '2x2': s222.id },
      })

      renderWithApp(<TimerPage variant="mobile" />)
      await screen.findByRole('button', { name: 'Timer' })

      // Switch select event to 2x2
      const eventSelect = screen.getByLabelText('Event')
      await user.selectOptions(eventSelect, '2x2')

      await waitFor(async () => {
        const updated = await db.settings.get(ownerId)
        expect(updated?.event).toBe('2x2')
      })
    })
  })

  describe('4. Offline Mutation Queueing & Sync Conflict Handling', () => {
    it('enqueues mutations into db.outbox when solves are saved under authenticated session', async () => {
      const ownerId = 'user-123'
      const session = newSession({ ownerId, name: 'Online Session', event: '3x3', kind: 'manual' })
      await putSession(session, { enqueue: true, baseVersion: 0 })

      const solve = newSolve({
        ownerId,
        sessionId: session.id,
        durationMs: 9100,
        penalty: 'none',
        scramble: "R U R' U'",
        event: '3x3',
      })
      await putSolve(solve, { enqueue: true, baseVersion: 0 })

      const outbox = await db.outbox.where('ownerId').equals(ownerId).toArray()
      expect(outbox.length).toBe(2)
      expect(outbox.some((m) => m.entity === 'session' && m.entityId === session.id)).toBe(true)
      expect(outbox.some((m) => m.entity === 'solve' && m.entityId === solve.id)).toBe(true)
    })

    it('adopts guest data and migrates solves/sessions when user logs in', async () => {
      const guestId = 'guest-abc'
      const userId = 'auth-user-xyz'

      const guestSession = newSession({ ownerId: guestId, name: 'Guest Session', event: '3x3', kind: 'manual' })
      await putSession(guestSession, { enqueue: false, baseVersion: 0 })

      const guestSolve = newSolve({
        ownerId: guestId,
        sessionId: guestSession.id,
        durationMs: 14000,
        penalty: 'none',
        scramble: '',
        event: '3x3',
      })
      await putSolve(guestSolve, { enqueue: false, baseVersion: 0 })

      // Adopt guest data into authenticated user
      await adoptGuestData(guestId, userId)

      const migratedSessions = await db.sessions.where('ownerId').equals(userId).toArray()
      const migratedSolves = await db.solves.where('ownerId').equals(userId).toArray()

      expect(migratedSessions.length).toBe(1)
      expect(migratedSessions[0].ownerId).toBe(userId)
      expect(migratedSolves.length).toBe(1)
      expect(migratedSolves[0].ownerId).toBe(userId)
    })
  })

  describe('5. Cascade Operations & Active Session Lifecycle', () => {
    it('deleting active session in HistoryPage clears it from active session settings', async () => {
      const user = userEvent.setup()
      const ownerId = await ensureGuestOwner()
      const session = newSession({ ownerId, name: 'Active Session To Delete', event: '3x3', kind: 'manual' })
      await putSession(session, { enqueue: false, baseVersion: 0 })
      await putSolve(
        newSolve({ ownerId, sessionId: session.id, durationMs: 11500, penalty: 'none', scramble: '', event: '3x3' }),
        { enqueue: false, baseVersion: 0 },
      )

      const settings = await getOrCreateSettings(ownerId)
      await db.settings.put({
        ...settings,
        sessionMode: 'manual',
        currentSessionIds: { '3x3': session.id },
      })

      renderWithApp(<HistoryPage />)
      expect(await screen.findByText('Active Session To Delete')).toBeInTheDocument()

      const deleteBtn = screen.getByRole('button', { name: 'Delete session Active Session To Delete' })
      await user.click(deleteBtn)

      const dialog = screen.getByRole('dialog')
      await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

      await waitFor(async () => {
        const updatedSettings = await db.settings.get(ownerId)
        expect(updatedSettings?.currentSessionIds['3x3']).toBeUndefined()
      })
    })
  })
})
