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
import { effectiveTimeMs } from '../../domain/models'
import { averageOfN, bestSingle, meanOfSolves, standardDeviation, worstSingle } from '../../domain/stats/averages'
import { formatAverage, formatSolveTime } from '../../domain/stats/formatTime'
import { generateScramble } from '../../features/scramble/scrambleService'
import { createTimerEngine } from '../../features/timer/timerMachine'
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

function timerHint() {
  return document.querySelector('.timer-hint')
}

describe('Tier 1: Core Feature Isolation E2E Tests', () => {
  beforeEach(async () => {
    cleanup()
    await resetDb()
  })

  afterEach(() => {
    cleanup()
  })

  describe('1. Timer Operations & Timing Cycle', () => {
    it('transitions through idle -> holding -> ready when Space is held for the required delay', async () => {
      renderWithApp(<TimerPage variant="mobile" />)
      await screen.findByRole('button', { name: 'Timer' })
      await waitFor(() => {
        expect(timerHint()).toHaveTextContent(/Hold Space or tap and hold to start/i)
      })

      fireEvent.keyDown(window, { code: 'Space', key: ' ' })
      await waitFor(
        () => {
          expect(timerHint()).toHaveTextContent(/Release to start/i)
        },
        { timeout: 4000 },
      )
      fireEvent.keyUp(window, { code: 'Space', key: ' ' })
    })

    it('starts timing upon Space key release after reaching ready state', async () => {
      renderWithApp(<TimerPage variant="mobile" />)
      await waitFor(() => {
        expect(timerHint()).toHaveTextContent(/Hold Space or tap and hold to start/i)
      })

      fireEvent.keyDown(window, { code: 'Space', key: ' ' })
      await waitFor(
        () => {
          expect(timerHint()).toHaveTextContent(/Release to start/i)
        },
        { timeout: 4000 },
      )

      fireEvent.keyUp(window, { code: 'Space', key: ' ' })
      await waitFor(() => {
        expect(timerHint()).toHaveTextContent(/Tap or press Space to stop/i)
      })
    })

    it('stops running timer when Space is pressed during active solve and records duration', async () => {
      renderWithApp(<TimerPage variant="mobile" />)
      await waitFor(() => {
        expect(timerHint()).toHaveTextContent(/Hold Space or tap and hold to start/i)
      })

      fireEvent.keyDown(window, { code: 'Space', key: ' ' })
      await waitFor(
        () => {
          expect(timerHint()).toHaveTextContent(/Release to start/i)
        },
        { timeout: 4000 },
      )
      fireEvent.keyUp(window, { code: 'Space', key: ' ' })
      await waitFor(() => {
        expect(timerHint()).toHaveTextContent(/Tap or press Space to stop/i)
      })

      fireEvent.keyDown(window, { code: 'Space', key: ' ' })
      expect(await screen.findByText(/Saved /i)).toBeInTheDocument()
      await waitFor(() => {
        expect(timerHint()).toHaveTextContent(/Hold Space or tap and hold to start/i)
      })
    })

    it('automatically saves finished solve to IndexedDB with duration and scramble', async () => {
      renderWithApp(<TimerPage variant="mobile" />)
      await waitFor(() => {
        expect(timerHint()).toHaveTextContent(/Hold Space or tap and hold to start/i)
      })

      fireEvent.keyDown(window, { code: 'Space', key: ' ' })
      await waitFor(
        () => {
          expect(timerHint()).toHaveTextContent(/Release to start/i)
        },
        { timeout: 4000 },
      )
      fireEvent.keyUp(window, { code: 'Space', key: ' ' })
      await waitFor(() => {
        expect(timerHint()).toHaveTextContent(/Tap or press Space to stop/i)
      })
      fireEvent.keyDown(window, { code: 'Space', key: ' ' })

      await waitFor(async () => {
        const solves = await db.solves.toArray()
        expect(solves.length).toBe(1)
        expect(solves[0].durationMs).toBeGreaterThanOrEqual(0)
        expect(solves[0].penalty).toBe('none')
        expect(solves[0].event).toBe('3x3')
      })
    })

    it('ignores system modifier keys (Control, Alt, Meta, Shift) without triggering hold state', async () => {
      renderWithApp(<TimerPage variant="desktop" />)
      await waitFor(() => {
        expect(timerHint()).toHaveTextContent(/Hold any key to start/i)
      })

      fireEvent.keyDown(window, { code: 'MetaLeft', key: 'Meta', metaKey: true })
      fireEvent.keyDown(window, { code: 'ControlLeft', key: 'Control', ctrlKey: true })
      fireEvent.keyDown(window, { code: 'AltLeft', key: 'Alt', altKey: true })
      fireEvent.keyDown(window, { code: 'ShiftLeft', key: 'Shift', shiftKey: true })

      expect(timerHint()).toHaveTextContent(/Hold any key to start/i)
    })

    it('supports pointer touch / click hold-and-release to operate the timer', async () => {
      renderWithApp(<TimerPage variant="mobile" />)
      await waitFor(() => {
        expect(timerHint()).toHaveTextContent(/Hold Space or tap and hold to start/i)
      })

      const timerBtn = screen.getByRole('button', { name: 'Timer' })
      fireEvent.pointerDown(timerBtn, { button: 0, pointerId: 1 })
      await waitFor(() => {
        expect(timerHint()).toHaveTextContent(/Hold…/i)
      })

      await waitFor(
        () => {
          expect(timerHint()).toHaveTextContent(/Release to start/i)
        },
        { timeout: 4000 },
      )

      fireEvent.pointerUp(timerBtn, { button: 0, pointerId: 1 })
      await waitFor(() => {
        expect(timerHint()).toHaveTextContent(/Tap or press Space to stop/i)
      })

      fireEvent.pointerDown(timerBtn, { button: 0, pointerId: 2 })
      expect(await screen.findByText(/Saved /i)).toBeInTheDocument()
    })
  })

  describe('2. Inspection & Hold Preparation Phases', () => {
    it('cancels hold and returns to idle when key is released prematurely', async () => {
      renderWithApp(<TimerPage variant="mobile" />)
      await waitFor(() => {
        expect(timerHint()).toHaveTextContent(/Hold Space or tap and hold to start/i)
      })

      fireEvent.keyDown(window, { code: 'Space', key: ' ' })
      await waitFor(() => {
        expect(timerHint()).toHaveTextContent(/Hold…/i)
      })

      fireEvent.keyUp(window, { code: 'Space', key: ' ' })
      await waitFor(() => {
        expect(timerHint()).toHaveTextContent(/Hold Space or tap and hold to start/i)
      })
    })

    it('cancels hold on pointercancel or lost pointer capture', async () => {
      renderWithApp(<TimerPage variant="mobile" />)
      await waitFor(() => {
        expect(timerHint()).toHaveTextContent(/Hold Space or tap and hold to start/i)
      })

      const timerBtn = screen.getByRole('button', { name: 'Timer' })
      fireEvent.pointerDown(timerBtn, { button: 0, pointerId: 1 })
      await waitFor(() => {
        expect(timerHint()).toHaveTextContent(/Hold…/i)
      })

      fireEvent.pointerCancel(timerBtn, { pointerId: 1 })
      await waitFor(() => {
        expect(timerHint()).toHaveTextContent(/Hold Space or tap and hold to start/i)
      })
    })

    it('respects configured timerStartDelayMs in timer engine mechanics', () => {
      const engine = createTimerEngine(() => 200)
      engine.press(1000)
      expect(engine.getSnapshot().phase).toBe('holding')
      engine.tick(1100)
      expect(engine.getSnapshot().phase).toBe('holding')
      expect(engine.getSnapshot().holdProgress).toBeCloseTo(0.5, 1)
      engine.tick(1200)
      expect(engine.getSnapshot().phase).toBe('ready')
      expect(engine.getSnapshot().holdProgress).toBe(1)
      engine.release(1205)
      expect(engine.getSnapshot().phase).toBe('running')
    })

    it('renders timer display with correct formatting and mode options', async () => {
      const ownerId = await ensureGuestOwner()
      const settings = await getOrCreateSettings(ownerId)
      await db.settings.put({ ...settings, timerDisplayMode: 'show' })

      renderWithApp(<TimerPage variant="mobile" />)
      const timerBtn = await screen.findByRole('button', { name: 'Timer' })
      expect(timerBtn).toHaveTextContent('0.00')
    })

    it('hides timer hints when showTimerHints is disabled', async () => {
      const ownerId = await ensureGuestOwner()
      const settings = await getOrCreateSettings(ownerId)
      await db.settings.put({ ...settings, showTimerHints: false })

      renderWithApp(<TimerPage variant="mobile" />)
      await screen.findByRole('button', { name: 'Timer' })
      await waitFor(() => {
        expect(timerHint()).toBeNull()
      })
    })
  })

  describe('3. Penalty Management (+2 / DNF / None)', () => {
    it('calculates effectiveTimeMs correctly: +2 adds 2000ms, DNF returns null', () => {
      expect(effectiveTimeMs({ durationMs: 10000, penalty: 'none' })).toBe(10000)
      expect(effectiveTimeMs({ durationMs: 10000, penalty: 'plus_two' })).toBe(12000)
      expect(effectiveTimeMs({ durationMs: 10000, penalty: 'dnf' })).toBeNull()
    })

    it('formats solve times accurately with penalties (+2 with +, DNF with DNF)', () => {
      expect(formatSolveTime({ durationMs: 10540, penalty: 'none' })).toBe('10.54')
      expect(formatSolveTime({ durationMs: 10540, penalty: 'plus_two' })).toBe('12.54+')
      expect(formatSolveTime({ durationMs: 10540, penalty: 'dnf' })).toBe('DNF')
    })

    it('toggles +2 penalty in History and updates database', async () => {
      const user = userEvent.setup()
      const ownerId = await ensureGuestOwner()
      const session = newSession({ ownerId, name: 'Penalty Test', event: '3x3', kind: 'manual' })
      await putSession(session, { enqueue: false, baseVersion: 0 })

      const solve = newSolve({
        ownerId,
        sessionId: session.id,
        durationMs: 8500,
        penalty: 'none',
        scramble: "R U R' U'",
        event: '3x3',
      })
      await putSolve(solve, { enqueue: false, baseVersion: 0 })

      renderWithApp(<HistoryPage />)
      expect(await screen.findByText('Penalty Test')).toBeInTheDocument()

      await user.click(screen.getByText('Penalty Test'))
      expect(await screen.findByText('8.50')).toBeInTheDocument()

      const plusTwoBtn = screen.getByRole('button', { name: '+2' })
      await user.click(plusTwoBtn)

      await waitFor(async () => {
        const updated = await db.solves.get(solve.id)
        expect(updated?.penalty).toBe('plus_two')
      })
      expect(await screen.findByText('10.50+')).toBeInTheDocument()
    })

    it('toggles DNF penalty in History and updates database', async () => {
      const user = userEvent.setup()
      const ownerId = await ensureGuestOwner()
      const session = newSession({ ownerId, name: 'DNF Toggle Test', event: '3x3', kind: 'manual' })
      await putSession(session, { enqueue: false, baseVersion: 0 })

      const solve = newSolve({
        ownerId,
        sessionId: session.id,
        durationMs: 9200,
        penalty: 'none',
        scramble: "R U R' U'",
        event: '3x3',
      })
      await putSolve(solve, { enqueue: false, baseVersion: 0 })

      renderWithApp(<HistoryPage />)
      expect(await screen.findByText('DNF Toggle Test')).toBeInTheDocument()

      await user.click(screen.getByText('DNF Toggle Test'))
      expect(await screen.findByText('9.20')).toBeInTheDocument()

      const dnfBtn = screen.getByRole('button', { name: 'DNF' })
      await user.click(dnfBtn)

      await waitFor(async () => {
        const updated = await db.solves.get(solve.id)
        expect(updated?.penalty).toBe('dnf')
      })
      const dnfChips = await screen.findAllByText('DNF')
      expect(dnfChips.length).toBeGreaterThan(0)
    })

    it('reverts penalty back to none when clicking active penalty button again', async () => {
      const user = userEvent.setup()
      const ownerId = await ensureGuestOwner()
      const session = newSession({ ownerId, name: 'Revert Penalty Test', event: '3x3', kind: 'manual' })
      await putSession(session, { enqueue: false, baseVersion: 0 })

      const solve = newSolve({
        ownerId,
        sessionId: session.id,
        durationMs: 7400,
        penalty: 'plus_two',
        scramble: "R U R' U'",
        event: '3x3',
      })
      await putSolve(solve, { enqueue: false, baseVersion: 0 })

      renderWithApp(<HistoryPage />)
      await user.click(await screen.findByText('Revert Penalty Test'))
      expect(await screen.findByText('9.40+')).toBeInTheDocument()

      const plusTwoBtn = screen.getByRole('button', { name: '+2' })
      await user.click(plusTwoBtn)

      await waitFor(async () => {
        const updated = await db.solves.get(solve.id)
        expect(updated?.penalty).toBe('none')
      })
      expect(await screen.findByText('7.40')).toBeInTheDocument()
    })
  })

  describe('4. Scramble Generation & Event Validation', () => {
    it('generates valid 3x3 scramble with standard moves', async () => {
      const scramble = await generateScramble('3x3')
      expect(scramble).toBeTypeOf('string')
      expect(scramble.length).toBeGreaterThan(15)
      const moves = scramble.split(/\s+/)
      expect(moves.length).toBeGreaterThanOrEqual(18)
      moves.forEach((move) => {
        expect(move).toMatch(/^[UDLRFB]['2]?$/)
      })
    })

    it('generates valid 2x2 scramble with standard moves', async () => {
      const scramble = await generateScramble('2x2')
      expect(scramble).toBeTypeOf('string')
      const moves = scramble.split(/\s+/)
      expect(moves.length).toBeGreaterThanOrEqual(7)
      moves.forEach((move) => {
        expect(move).toMatch(/^[UDLRFB]['2]?$/)
      })
    })

    it('generates valid 4x4 scramble containing wide moves', async () => {
      const scramble = await generateScramble('4x4')
      expect(scramble).toBeTypeOf('string')
      const moves = scramble.split(/\s+/)
      expect(moves.length).toBeGreaterThanOrEqual(35)
      const hasWide = moves.some((m) => m.includes('w'))
      expect(hasWide).toBe(true)
    })

    it('generates valid Megaminx and Pyraminx scrambles', async () => {
      const minx = await generateScramble('megaminx')
      expect(minx).toBeTypeOf('string')
      expect(minx.includes('R++') || minx.includes('D++') || minx.includes('U')).toBe(true)

      const pyram = await generateScramble('pyraminx')
      expect(pyram).toBeTypeOf('string')
      expect(pyram.length).toBeGreaterThan(5)
    })

    it('generates new scramble on refresh button click in TimerPage', async () => {
      const user = userEvent.setup()
      renderWithApp(<TimerPage variant="mobile" />)
      const refreshBtn = await screen.findByRole('button', { name: /new scramble/i })
      expect(refreshBtn).toBeInTheDocument()

      await user.click(refreshBtn)

      await waitFor(() => {
        const nextScramble = document.querySelector('.scramble')?.textContent
        expect(nextScramble).toBeDefined()
      })
    })
  })

  describe('5. Session Management (Creation, Switching, Renaming, Deleting)', () => {
    it('creates a new manual session and sets it as active in SessionManager', async () => {
      const user = userEvent.setup()
      const ownerId = await ensureGuestOwner()
      const settings = await getOrCreateSettings(ownerId)
      await db.settings.put({ ...settings, sessionMode: 'manual' })

      renderWithApp(<TimerPage variant="mobile" />)
      const sessionBtn = await screen.findByRole('button', { name: /sessions/i })
      await user.click(sessionBtn)

      const dialog = await screen.findByRole('dialog', { name: /sessions/i })
      const input = within(dialog).getByLabelText('New session name')
      await user.type(input, 'Morning Practice')
      await user.click(within(dialog).getByRole('button', { name: 'Create' }))

      await waitFor(async () => {
        const sessions = await db.sessions.where('ownerId').equals(ownerId).toArray()
        const created = sessions.find((s) => s.name === 'Morning Practice')
        expect(created).toBeDefined()
        expect(created?.kind).toBe('manual')
      })
    })

    it('switches active session when user selects a session', async () => {
      const user = userEvent.setup()
      const ownerId = await ensureGuestOwner()
      const sessionA = newSession({ ownerId, name: 'Session A', event: '3x3', kind: 'manual' })
      const sessionB = newSession({ ownerId, name: 'Session B', event: '3x3', kind: 'manual' })
      await putSession(sessionA, { enqueue: false, baseVersion: 0 })
      await putSession(sessionB, { enqueue: false, baseVersion: 0 })

      const settings = await getOrCreateSettings(ownerId)
      await db.settings.put({
        ...settings,
        sessionMode: 'manual',
        currentSessionIds: { '3x3': sessionA.id },
      })

      renderWithApp(<TimerPage variant="mobile" />)
      await user.click(await screen.findByRole('button', { name: /sessions/i }))

      const dialog = await screen.findByRole('dialog', { name: /sessions/i })
      const sessionBButton = within(dialog).getByRole('button', { name: 'Session B' })
      await user.click(sessionBButton)

      await waitFor(async () => {
        const updated = await db.settings.get(ownerId)
        expect(updated?.currentSessionIds['3x3']).toBe(sessionB.id)
      })
    })

    it('renames a session from HistoryPage dialog', async () => {
      const user = userEvent.setup()
      const ownerId = await ensureGuestOwner()
      const session = newSession({ ownerId, name: 'Initial Title', event: '3x3', kind: 'manual' })
      await putSession(session, { enqueue: false, baseVersion: 0 })
      await putSolve(
        newSolve({ ownerId, sessionId: session.id, durationMs: 12000, penalty: 'none', scramble: "R U R' U'", event: '3x3' }),
        { enqueue: false, baseVersion: 0 },
      )

      renderWithApp(<HistoryPage />)
      expect(await screen.findByText('Initial Title')).toBeInTheDocument()

      const renameBtn = screen.getByRole('button', { name: 'Rename session Initial Title' })
      await user.click(renameBtn)

      const dialog = screen.getByRole('dialog')
      const input = within(dialog).getByLabelText('Session name')
      await user.clear(input)
      await user.type(input, 'Updated Title')
      await user.click(within(dialog).getByRole('button', { name: 'Save' }))

      await waitFor(async () => {
        const s = await db.sessions.get(session.id)
        expect(s?.name).toBe('Updated Title')
      })
      expect(await screen.findByText('Updated Title')).toBeInTheDocument()
    })

    it('deletes session and cascade deletes associated solves', async () => {
      const user = userEvent.setup()
      const ownerId = await ensureGuestOwner()
      const session = newSession({ ownerId, name: 'Session to Delete', event: '3x3', kind: 'manual' })
      await putSession(session, { enqueue: false, baseVersion: 0 })
      const solve = newSolve({
        ownerId,
        sessionId: session.id,
        durationMs: 11000,
        penalty: 'none',
        scramble: "R U R' U'",
        event: '3x3',
      })
      await putSolve(solve, { enqueue: false, baseVersion: 0 })

      renderWithApp(<HistoryPage />)
      expect(await screen.findByText('Session to Delete')).toBeInTheDocument()

      const deleteBtn = screen.getByRole('button', { name: 'Delete session Session to Delete' })
      await user.click(deleteBtn)

      const dialog = screen.getByRole('dialog')
      await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

      await waitFor(async () => {
        const s = await db.sessions.get(session.id)
        expect(s?.deletedAt).toBeDefined()
        const sol = await db.solves.get(solve.id)
        expect(sol?.deletedAt).toBeDefined()
      })
    })
  })

  describe('6. WCA Statistics & Averages Computation', () => {
    it('computes Best Single, Worst Single, and Mean correctly', () => {
      const solves = [
        newSolve({ ownerId: '1', sessionId: null, durationMs: 12000, penalty: 'none', scramble: '', event: '3x3' }),
        newSolve({ ownerId: '1', sessionId: null, durationMs: 8000, penalty: 'none', scramble: '', event: '3x3' }),
        newSolve({ ownerId: '1', sessionId: null, durationMs: 10000, penalty: 'plus_two', scramble: '', event: '3x3' }),
        newSolve({ ownerId: '1', sessionId: null, durationMs: 9000, penalty: 'dnf', scramble: '', event: '3x3' }),
      ]

      expect(bestSingle(solves)).toBe(8000)
      expect(worstSingle(solves)).toBe(12000)
      expect(meanOfSolves(solves)).toBeCloseTo(10666.67, 1)
    })

    it('computes Ao5 by trimming fastest and slowest from 5 solves according to WCA rules', () => {
      const solves = [
        newSolve({ ownerId: '1', sessionId: null, durationMs: 10000, penalty: 'none', scramble: '', event: '3x3' }),
        newSolve({ ownerId: '1', sessionId: null, durationMs: 12000, penalty: 'none', scramble: '', event: '3x3' }),
        newSolve({ ownerId: '1', sessionId: null, durationMs: 8000, penalty: 'none', scramble: '', event: '3x3' }),
        newSolve({ ownerId: '1', sessionId: null, durationMs: 14000, penalty: 'none', scramble: '', event: '3x3' }),
        newSolve({ ownerId: '1', sessionId: null, durationMs: 11000, penalty: 'none', scramble: '', event: '3x3' }),
      ]

      expect(averageOfN(solves, 5)).toBe(11000)
    })

    it('computes Ao5 with 1 DNF by trimming DNF as worst and fastest time', () => {
      const solves = [
        newSolve({ ownerId: '1', sessionId: null, durationMs: 9000, penalty: 'none', scramble: '', event: '3x3' }),
        newSolve({ ownerId: '1', sessionId: null, durationMs: 15000, penalty: 'dnf', scramble: '', event: '3x3' }),
        newSolve({ ownerId: '1', sessionId: null, durationMs: 10000, penalty: 'none', scramble: '', event: '3x3' }),
        newSolve({ ownerId: '1', sessionId: null, durationMs: 8000, penalty: 'none', scramble: '', event: '3x3' }),
        newSolve({ ownerId: '1', sessionId: null, durationMs: 11000, penalty: 'none', scramble: '', event: '3x3' }),
      ]

      expect(averageOfN(solves, 5)).toBe(10000)
    })

    it('evaluates Ao5 as DNF when 2 or more solves are DNF', () => {
      const solves = [
        newSolve({ ownerId: '1', sessionId: null, durationMs: 9000, penalty: 'none', scramble: '', event: '3x3' }),
        newSolve({ ownerId: '1', sessionId: null, durationMs: 15000, penalty: 'dnf', scramble: '', event: '3x3' }),
        newSolve({ ownerId: '1', sessionId: null, durationMs: 10000, penalty: 'none', scramble: '', event: '3x3' }),
        newSolve({ ownerId: '1', sessionId: null, durationMs: 8000, penalty: 'dnf', scramble: '', event: '3x3' }),
        newSolve({ ownerId: '1', sessionId: null, durationMs: 11000, penalty: 'none', scramble: '', event: '3x3' }),
      ]

      expect(averageOfN(solves, 5)).toBeNull()
      expect(formatAverage(averageOfN(solves, 5))).toBe('DNF')
    })

    it('computes Ao12 by trimming fastest and slowest from 12 solves and averaging 10', () => {
      const times = [10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000, 5000, 20000]
      const solves = times.map((durationMs) =>
        newSolve({ ownerId: '1', sessionId: null, durationMs, penalty: 'none', scramble: '', event: '3x3' }),
      )

      expect(averageOfN(solves, 12)).toBe(10000)
    })

    it('computes standard deviation of solves accurately', () => {
      const solves = [
        newSolve({ ownerId: '1', sessionId: null, durationMs: 10000, penalty: 'none', scramble: '', event: '3x3' }),
        newSolve({ ownerId: '1', sessionId: null, durationMs: 12000, penalty: 'none', scramble: '', event: '3x3' }),
        newSolve({ ownerId: '1', sessionId: null, durationMs: 14000, penalty: 'none', scramble: '', event: '3x3' }),
      ]

      const sd = standardDeviation(solves)
      expect(sd).toBeCloseTo(1632.99, 1)
    })
  })
})
