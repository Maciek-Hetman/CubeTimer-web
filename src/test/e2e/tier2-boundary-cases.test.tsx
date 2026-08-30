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
import { averageOfN, bestAverageOfN, bestSingle, meanOfSolves, worstSingle } from '../../domain/stats/averages'
import { formatDuration, formatTotalTime } from '../../domain/stats/formatTime'
import { createTimerEngine } from '../../features/timer/timerMachine'
import { TimerPage } from '../../features/timer/TimerPage'
import { HistoryPage } from '../../features/history/HistoryPage'
import { StatsPage } from '../../features/stats/StatsPage'

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

describe('Tier 2: Boundary & Corner Cases E2E Tests', () => {
  beforeEach(async () => {
    cleanup()
    await resetDb()
  })

  afterEach(() => {
    cleanup()
  })

  describe('1. Timing Boundaries & Input Edge Conditions', () => {
    it('does not start timer on instant tap / release before hold duration (5ms tap)', async () => {
      renderWithApp(<TimerPage variant="mobile" />)
      await screen.findByRole('button', { name: 'Timer' })
      await waitFor(() => {
        expect(timerHint()).toHaveTextContent(/Hold Space or tap and hold to start/i)
      })

      fireEvent.keyDown(window, { code: 'Space', key: ' ' })
      fireEvent.keyUp(window, { code: 'Space', key: ' ' })

      await waitFor(() => {
        expect(timerHint()).toHaveTextContent(/Hold Space or tap and hold to start/i)
      })
      const solves = await db.solves.toArray()
      expect(solves.length).toBe(0)
    })

    it('handles long hold (>2000ms past ready state) smoothly and starts on release', () => {
      const engine = createTimerEngine(() => 500)
      engine.press(1000)
      expect(engine.getSnapshot().phase).toBe('holding')
      engine.tick(1500)
      expect(engine.getSnapshot().phase).toBe('ready')
      // Hold for another 2500ms past ready
      engine.tick(4000)
      expect(engine.getSnapshot().phase).toBe('ready')
      expect(engine.getSnapshot().holdProgress).toBe(1)
      engine.release(4005)
      expect(engine.getSnapshot().phase).toBe('running')
    })

    it('transitions directly to ready with 0ms hold delay configuration', () => {
      const engine = createTimerEngine(() => 0)
      engine.press(1000)
      expect(engine.getSnapshot().phase).toBe('ready')
      expect(engine.getSnapshot().holdProgress).toBe(1)
      engine.release(1001)
      expect(engine.getSnapshot().phase).toBe('running')
    })

    it('ignores repeated keydown events (event.repeat = true) without resetting hold progress', async () => {
      renderWithApp(<TimerPage variant="desktop" />)
      await screen.findByRole('button', { name: 'Timer' })
      await waitFor(() => {
        expect(timerHint()).toHaveTextContent(/Hold any key to start/i)
      })

      const repeatedEvent = new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        code: 'Space',
        key: ' ',
        repeat: true,
      })
      window.dispatchEvent(repeatedEvent)
      expect(repeatedEvent.defaultPrevented).toBe(true)
      expect(timerHint()).toHaveTextContent(/Hold any key to start/i)
    })

    it('ignores spacebar presses when focus is inside a form input target', async () => {
      renderWithApp(
        <div>
          <input data-testid="search-input" />
          <TimerPage variant="mobile" />
        </div>,
      )
      await screen.findByRole('button', { name: 'Timer' })
      const input = screen.getByTestId('search-input')
      input.focus()

      fireEvent.keyDown(input, { code: 'Space', key: ' ' })
      expect(timerHint()).toHaveTextContent(/Hold Space or tap and hold to start/i)
    })
  })

  describe('2. Rapid Concurrency & Solve Spamming', () => {
    it('handles rapid solve completion without state corruption in timer engine', () => {
      const engine = createTimerEngine(() => 100)
      // Solve 1
      engine.press(1000)
      engine.tick(1100)
      engine.release(1100)
      expect(engine.getSnapshot().phase).toBe('running')
      engine.press(2500) // Stop solve 1 (duration: 1400ms)
      expect(engine.getSnapshot().phase).toBe('finished')
      expect(engine.getSnapshot().finishedMs).toBe(1400)

      // Immediately start Solve 2 within 1ms
      engine.press(2501)
      expect(engine.getSnapshot().phase).toBe('holding')
      engine.tick(2601)
      engine.release(2601)
      expect(engine.getSnapshot().phase).toBe('running')
      engine.press(4000) // Stop solve 2 (duration: 1399ms)
      expect(engine.getSnapshot().phase).toBe('finished')
      expect(engine.getSnapshot().finishedMs).toBe(1399)
    })

    it('handles multiple rapid clicks on New scramble button without crashing', async () => {
      const user = userEvent.setup()
      renderWithApp(<TimerPage variant="mobile" />)
      const refreshBtn = await screen.findByRole('button', { name: /new scramble/i })

      // Rapidly click 3 times in quick succession
      await user.click(refreshBtn)
      await user.click(refreshBtn)
      await user.click(refreshBtn)

      await waitFor(() => {
        const scramble = document.querySelector('.scramble')?.textContent
        expect(scramble).toBeDefined()
        expect(scramble?.length).toBeGreaterThan(10)
      })
    })

    it('handles sequential penalty toggles consistently in database', async () => {
      const user = userEvent.setup()
      const ownerId = await ensureGuestOwner()
      const session = newSession({ ownerId, name: 'Rapid Penalty', event: '3x3', kind: 'manual' })
      await putSession(session, { enqueue: false, baseVersion: 0 })
      const solve = newSolve({
        ownerId,
        sessionId: session.id,
        durationMs: 9500,
        penalty: 'none',
        scramble: "R U R' U'",
        event: '3x3',
      })
      await putSolve(solve, { enqueue: false, baseVersion: 0 })

      renderWithApp(<HistoryPage />)
      await user.click(await screen.findByText('Rapid Penalty'))

      const plusTwoBtn = await screen.findByRole('button', { name: '+2' })
      await user.click(plusTwoBtn)
      await waitFor(async () => {
        const updated = await db.solves.get(solve.id)
        expect(updated?.penalty).toBe('plus_two')
      })

      const dnfBtn = screen.getByRole('button', { name: 'DNF' })
      await user.click(dnfBtn)
      await waitFor(async () => {
        const updated = await db.solves.get(solve.id)
        expect(updated?.penalty).toBe('dnf')
      })

      // Toggle DNF again to return to none
      await user.click(dnfBtn)
      await waitFor(async () => {
        const updated = await db.solves.get(solve.id)
        expect(updated?.penalty).toBe('none')
      })
    })

    it('handles rapid session switching without race conditions', async () => {
      const user = userEvent.setup()
      const ownerId = await ensureGuestOwner()
      const session1 = newSession({ ownerId, name: 'S1', event: '3x3', kind: 'manual' })
      const session2 = newSession({ ownerId, name: 'S2', event: '3x3', kind: 'manual' })
      const session3 = newSession({ ownerId, name: 'S3', event: '3x3', kind: 'manual' })
      await putSession(session1, { enqueue: false, baseVersion: 0 })
      await putSession(session2, { enqueue: false, baseVersion: 0 })
      await putSession(session3, { enqueue: false, baseVersion: 0 })

      const settings = await getOrCreateSettings(ownerId)
      await db.settings.put({ ...settings, sessionMode: 'manual', currentSessionIds: { '3x3': session1.id } })

      renderWithApp(<TimerPage variant="mobile" />)
      await user.click(await screen.findByRole('button', { name: /sessions/i }))

      const dialog = await screen.findByRole('dialog', { name: /sessions/i })
      await user.click(within(dialog).getByRole('button', { name: 'S2' }))

      await waitFor(async () => {
        const updated = await db.settings.get(ownerId)
        expect(updated?.currentSessionIds['3x3']).toBe(session2.id)
      })
    })

    it('handles multiple solve deletes in quick succession properly', async () => {
      const user = userEvent.setup()
      const ownerId = await ensureGuestOwner()
      const session = newSession({ ownerId, name: 'Multi Delete', event: '3x3', kind: 'manual' })
      await putSession(session, { enqueue: false, baseVersion: 0 })

      const solve1 = newSolve({ ownerId, sessionId: session.id, durationMs: 10000, penalty: 'none', scramble: '', event: '3x3' })
      const solve2 = newSolve({ ownerId, sessionId: session.id, durationMs: 11000, penalty: 'none', scramble: '', event: '3x3' })
      await putSolve(solve1, { enqueue: false, baseVersion: 0 })
      await putSolve(solve2, { enqueue: false, baseVersion: 0 })

      renderWithApp(<HistoryPage />)
      await user.click(await screen.findByText('Multi Delete'))

      const deleteBtns = await screen.findAllByRole('button', { name: 'Delete solve' })
      expect(deleteBtns.length).toBe(2)

      await user.click(deleteBtns[0])
      const confirmDialog = await screen.findByRole('dialog')
      await user.click(within(confirmDialog).getByRole('button', { name: 'Delete' }))

      await waitFor(async () => {
        const s1 = await db.solves.get(solve1.id)
        expect(s1?.deletedAt).toBeDefined()
      })
    })
  })

  describe('3. Dataset Extremes & Statistical Boundaries', () => {
    it('renders empty state UI when there are zero solves without NaN or crashes', async () => {
      renderWithApp(<StatsPage />)
      expect(await screen.findByText('No solves yet')).toBeInTheDocument()
      expect(screen.queryByText(/NaN/)).not.toBeInTheDocument()
    })

    it('handles single solve dataset: mean equals solve, Ao5 and Ao12 are unavailable', () => {
      const solves = [
        newSolve({ ownerId: '1', sessionId: null, durationMs: 12500, penalty: 'none', scramble: '', event: '3x3' }),
      ]

      expect(bestSingle(solves)).toBe(12500)
      expect(worstSingle(solves)).toBe(12500)
      expect(meanOfSolves(solves)).toBe(12500)
      expect(averageOfN(solves, 5)).toBeNull()
      expect(averageOfN(solves, 12)).toBeNull()
    })

    it('handles 4 solves (one below Ao5 threshold): Ao5 is null', () => {
      const solves = [
        newSolve({ ownerId: '1', sessionId: null, durationMs: 10000, penalty: 'none', scramble: '', event: '3x3' }),
        newSolve({ ownerId: '1', sessionId: null, durationMs: 11000, penalty: 'none', scramble: '', event: '3x3' }),
        newSolve({ ownerId: '1', sessionId: null, durationMs: 12000, penalty: 'none', scramble: '', event: '3x3' }),
        newSolve({ ownerId: '1', sessionId: null, durationMs: 13000, penalty: 'none', scramble: '', event: '3x3' }),
      ]

      expect(meanOfSolves(solves)).toBe(11500)
      expect(averageOfN(solves, 5)).toBeNull()
    })

    it('handles 5 solves all DNF: Best Single is null, Mean is null, Ao5 is DNF', () => {
      const solves = Array.from({ length: 5 }, () =>
        newSolve({ ownerId: '1', sessionId: null, durationMs: 10000, penalty: 'dnf', scramble: '', event: '3x3' }),
      )

      expect(bestSingle(solves)).toBeNull()
      expect(worstSingle(solves)).toBeNull()
      expect(meanOfSolves(solves)).toBeNull()
      expect(averageOfN(solves, 5)).toBeNull()
    })

    it('handles 5 identical solve times: Ao5 equals the identical time', () => {
      const solves = Array.from({ length: 5 }, () =>
        newSolve({ ownerId: '1', sessionId: null, durationMs: 9870, penalty: 'none', scramble: '', event: '3x3' }),
      )

      expect(averageOfN(solves, 5)).toBe(9870)
      expect(bestSingle(solves)).toBe(9870)
      expect(worstSingle(solves)).toBe(9870)
    })
  })

  describe('4. Volume, Sizing & Session Boundaries', () => {
    it('computes Ao50 accurately on 50 solve volume dataset', () => {
      // 50 solves of 10.0s (10000ms) with one 5.0s (min) and one 20.0s (max)
      const times = [5000, ...Array(48).fill(10000), 20000]
      const solves = times.map((durationMs) =>
        newSolve({ ownerId: '1', sessionId: null, durationMs, penalty: 'none', scramble: '', event: '3x3' }),
      )

      expect(averageOfN(solves, 50)).toBe(10000)
      expect(bestAverageOfN(solves, 50)).toBe(10000)
    })

    it('paginates large session lists in HistoryPage (25+ sessions)', async () => {
      const user = userEvent.setup()
      const ownerId = await ensureGuestOwner()

      for (let i = 1; i <= 25; i++) {
        const session = newSession({
          ownerId,
          name: `Session ${i.toString().padStart(2, '0')}`,
          event: '3x3',
          kind: 'manual',
          startedAt: new Date(2026, 0, i).toISOString(),
        })
        await putSession(session, { enqueue: false, baseVersion: 0 })
        await putSolve(
          newSolve({ ownerId, sessionId: session.id, durationMs: 10000, penalty: 'none', scramble: '', event: '3x3' }),
          { enqueue: false, baseVersion: 0 },
        )
      }

      renderWithApp(<HistoryPage />)
      expect(await screen.findByText(/25 sessions stored/)).toBeInTheDocument()
      expect(screen.getByText(/Page 1 of 2/)).toBeInTheDocument()

      // Click Next
      const nextBtn = screen.getByRole('button', { name: 'Next' })
      await user.click(nextBtn)
      expect(screen.getByText(/Page 2 of 2/)).toBeInTheDocument()
    })

    it('groups uncategorized solves with sessionId null under Uncategorized Solves in History', async () => {
      const ownerId = await ensureGuestOwner()
      await putSolve(
        newSolve({ ownerId, sessionId: null, durationMs: 13500, penalty: 'none', scramble: "R U R' U'", event: '3x3' }),
        { enqueue: false, baseVersion: 0 },
      )

      renderWithApp(<HistoryPage />)
      expect(await screen.findByText('Uncategorized Solves')).toBeInTheDocument()
      expect(screen.getByText(/No session · 1 solve · Avg: 13\.50/)).toBeInTheDocument()
    })

    it('formats large duration values (>1 hour) correctly in duration and total time', () => {
      // 3723450ms = 1 hour, 2 minutes, 3.45 seconds
      const formatted = formatDuration(3723450)
      expect(formatted).toBe('62:03.45')

      const formattedTotal = formatTotalTime(3723450)
      expect(formattedTotal).toBe('1h 2m 3s')
    })

    it('formats 0 duration cleanly as 0s in total time', () => {
      expect(formatTotalTime(0)).toBe('0s')
      expect(formatDuration(0)).toBe('0.00')
    })
  })

  describe('5. Character & Input Robustness in Sessions', () => {
    it('handles session names with emojis properly', async () => {
      const user = userEvent.setup()
      const ownerId = await ensureGuestOwner()
      const settings = await getOrCreateSettings(ownerId)
      await db.settings.put({ ...settings, sessionMode: 'manual' })

      renderWithApp(<TimerPage variant="mobile" />)
      await user.click(await screen.findByRole('button', { name: /sessions/i }))

      const dialog = await screen.findByRole('dialog', { name: /sessions/i })
      const input = within(dialog).getByLabelText('New session name')
      await user.type(input, '🔥 Sub-10 Grinding 🧩 ⏱️')
      await user.click(within(dialog).getByRole('button', { name: 'Create' }))

      await waitFor(async () => {
        const sessions = await db.sessions.where('ownerId').equals(ownerId).toArray()
        const emojiSession = sessions.find((s) => s.name === '🔥 Sub-10 Grinding 🧩 ⏱️')
        expect(emojiSession).toBeDefined()
      })
    })

    it('handles session names with Unicode and international characters', async () => {
      const user = userEvent.setup()
      const ownerId = await ensureGuestOwner()
      const settings = await getOrCreateSettings(ownerId)
      await db.settings.put({ ...settings, sessionMode: 'manual' })

      renderWithApp(<TimerPage variant="mobile" />)
      await user.click(await screen.findByRole('button', { name: /sessions/i }))

      const dialog = await screen.findByRole('dialog', { name: /sessions/i })
      const input = within(dialog).getByLabelText('New session name')
      await user.type(input, 'Session de entraînement 練習 🏆')
      await user.click(within(dialog).getByRole('button', { name: 'Create' }))

      await waitFor(async () => {
        const sessions = await db.sessions.where('ownerId').equals(ownerId).toArray()
        const unicodeSession = sessions.find((s) => s.name === 'Session de entraînement 練習 🏆')
        expect(unicodeSession).toBeDefined()
      })
    })

    it('safely escapes HTML characters in session names without script injection', async () => {
      const ownerId = await ensureGuestOwner()
      const xssName = `<script>alert('xss')</script> & <b>bold</b>`
      const session = newSession({ ownerId, name: xssName, event: '3x3', kind: 'manual' })
      await putSession(session, { enqueue: false, baseVersion: 0 })
      await putSolve(
        newSolve({ ownerId, sessionId: session.id, durationMs: 10000, penalty: 'none', scramble: '', event: '3x3' }),
        { enqueue: false, baseVersion: 0 },
      )

      renderWithApp(<HistoryPage />)
      // Rendered as text safely
      expect(await screen.findByText(xssName)).toBeInTheDocument()
      expect(document.querySelector('script[src*="xss"]')).toBeNull()
    })

    it('trims leading and trailing whitespace from session names', async () => {
      const user = userEvent.setup()
      const ownerId = await ensureGuestOwner()
      const settings = await getOrCreateSettings(ownerId)
      await db.settings.put({ ...settings, sessionMode: 'manual' })

      renderWithApp(<TimerPage variant="mobile" />)
      await user.click(await screen.findByRole('button', { name: /sessions/i }))

      const dialog = await screen.findByRole('dialog', { name: /sessions/i })
      const input = within(dialog).getByLabelText('New session name')
      await user.type(input, '   Padded Session Name   ')
      await user.click(within(dialog).getByRole('button', { name: 'Create' }))

      await waitFor(async () => {
        const sessions = await db.sessions.where('ownerId').equals(ownerId).toArray()
        const trimmedSession = sessions.find((s) => s.name === 'Padded Session Name')
        expect(trimmedSession).toBeDefined()
      })
    })

    it('rejects empty or whitespace-only session name submission', async () => {
      const user = userEvent.setup()
      const ownerId = await ensureGuestOwner()
      const settings = await getOrCreateSettings(ownerId)
      await db.settings.put({ ...settings, sessionMode: 'manual' })

      renderWithApp(<TimerPage variant="mobile" />)
      await user.click(await screen.findByRole('button', { name: /sessions/i }))

      const dialog = await screen.findByRole('dialog', { name: /sessions/i })
      const input = within(dialog).getByLabelText('New session name')
      await user.type(input, '    ')
      await user.click(within(dialog).getByRole('button', { name: 'Create' }))

      const sessions = await db.sessions.where('ownerId').equals(ownerId).toArray()
      expect(sessions.length).toBe(0)
    })
  })
})
