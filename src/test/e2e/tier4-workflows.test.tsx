/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AppProviders } from '../../app/AppProviders'
import { ensureGuestOwner } from '../../app/profile'
import { db, getOrCreateSettings } from '../../data/db'
import { newSession, putSession } from '../../data/repositories/sessions'
import { newSolve, putSolve } from '../../data/repositories/solves'
import { computeSolveStats } from '../../data/repositories/solveStats'
import { averageOfN } from '../../domain/stats/averages'
import type { Solve } from '../../domain/models'
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

describe('Tier 4: Real-World Workload Scenarios E2E Tests', () => {
  beforeEach(async () => {
    cleanup()
    await resetDb()
  })

  afterEach(() => {
    cleanup()
  })

  it('1. Full Speedcubing Competition Round (12 solves with +2 and DNF, Ao5 and Ao12)', async () => {
    const ownerId = await ensureGuestOwner()
    const session = newSession({ ownerId, name: 'Competition Round 1', event: '3x3', kind: 'manual' })
    await putSession(session, { enqueue: false, baseVersion: 0 })

    // 12 solves with realistic times
    // Raw ms: 10500, 11200, 9800, 12400, 10100, 14300 (+2 -> 16300), 9500, 11000, 10800, 15000 (DNF), 10200, 9900
    const solveData: Array<{ ms: number; penalty: 'none' | 'plus_two' | 'dnf'; scramble: string }> = [
      { ms: 10500, penalty: 'none', scramble: "D2 R2 F2 U' L2 B2" },
      { ms: 11200, penalty: 'none', scramble: "R U R' U' R' F R2" },
      { ms: 9800, penalty: 'none', scramble: "F2 U2 R2 D2 F2 L2" },
      { ms: 12400, penalty: 'none', scramble: "L2 B2 D2 U2 R2 F2" },
      { ms: 10100, penalty: 'none', scramble: "U2 F2 R2 U2 B2 R2" },
      { ms: 14300, penalty: 'plus_two', scramble: "B2 L2 D2 R2 B2 U2" }, // 16300ms effective
      { ms: 9500, penalty: 'none', scramble: "R2 D2 F2 L2 B2 U2" },
      { ms: 11000, penalty: 'none', scramble: "U2 L2 B2 R2 D2 F2" },
      { ms: 10800, penalty: 'none', scramble: "F2 R2 D2 B2 L2 U2" },
      { ms: 15000, penalty: 'dnf', scramble: "D2 F2 L2 U2 R2 B2" }, // DNF
      { ms: 10200, penalty: 'none', scramble: "R2 B2 U2 L2 D2 F2" },
      { ms: 9900, penalty: 'none', scramble: "U2 R2 F2 D2 L2 B2" },
    ]

    const createdSolves: Solve[] = []
    for (let i = 0; i < solveData.length; i++) {
      const item = solveData[i]
      const s = newSolve({
        ownerId,
        sessionId: session.id,
        durationMs: item.ms,
        penalty: item.penalty,
        scramble: item.scramble,
        event: '3x3',
        solvedAt: new Date(2026, 0, 1, 10, i).toISOString(),
      })
      await putSolve(s, { enqueue: false, baseVersion: 0 })
      createdSolves.push(s)
    }

    // Verify first 5 solves Ao5:
    // Solves [0..4]: 10.50, 11.20, 9.80, 12.40, 10.10
    // Sorted: 9.80 (trimmed), 10.10, 10.50, 11.20, 12.40 (trimmed)
    // Middle 3: (10.10 + 10.50 + 11.20) / 3 = 31.80 / 3 = 10.60s (10600ms)
    const firstFive = createdSolves.slice(0, 5)
    expect(averageOfN(firstFive, 5)).toBe(10600)

    // Verify full 12 solves Ao12:
    // Solves: [10.50, 11.20, 9.80, 12.40, 10.10, 16.30, 9.50, 11.00, 10.80, DNF, 10.20, 9.90]
    // Fastest: 9.50 (trimmed)
    // Slowest: DNF (trimmed)
    // Remaining 10: 10.50 + 11.20 + 9.80 + 12.40 + 10.10 + 16.30 + 11.00 + 10.80 + 10.20 + 9.90 = 112.20s
    // Ao12 = 112.20 / 10 = 11.22s (11220ms)
    expect(averageOfN(createdSolves, 12)).toBe(11220)

    const stats = await computeSolveStats(ownerId, '3x3', session.id)
    expect(stats.count).toBe(12)
    expect(stats.ao12).toBe(11220)
    expect(stats.best).toBe(9500)

    // Render in History and verify summary
    renderWithApp(<HistoryPage />)
    expect(await screen.findByText('Competition Round 1')).toBeInTheDocument()
    expect(screen.getByText(/12 solves/)).toBeInTheDocument()
  })

  it('2. Outlier Deletion Workflow (recording 6 solves, deleting corrupted outlier, verifying recalculated Ao5)', async () => {
    const user = userEvent.setup()
    const ownerId = await ensureGuestOwner()
    const session = newSession({ ownerId, name: 'Practice with Outlier', event: '3x3', kind: 'manual' })
    await putSession(session, { enqueue: false, baseVersion: 0 })

    // 5 clean solves around 10.5s + 1 accidental outlier (59.99s)
    // Times (oldest to newest):
    // 0: 10000ms
    // 1: 10500ms
    // 2: 11000ms
    // 3: 10200ms
    // 4: 59990ms (outlier)
    // 5: 10800ms
    const solveTimes = [10000, 10500, 11000, 10200, 59990, 10800]
    const createdSolves: Solve[] = []
    for (let i = 0; i < solveTimes.length; i++) {
      const s = newSolve({
        ownerId,
        sessionId: session.id,
        durationMs: solveTimes[i],
        penalty: 'none',
        scramble: "R U R' U'",
        event: '3x3',
        solvedAt: new Date(2026, 0, 1, 14, i).toISOString(),
      })
      await putSolve(s, { enqueue: false, baseVersion: 0 })
      createdSolves.push(s)
    }

    renderWithApp(<HistoryPage />)
    await user.click(await screen.findByText('Practice with Outlier'))

    // Outlier 59.99 is the second item from top in History list (newest first: 10.80, then 59.99)
    expect(await screen.findByText('59.99')).toBeInTheDocument()

    // Delete outlier solve
    const deleteBtns = await screen.findAllByRole('button', { name: 'Delete solve' })
    await user.click(deleteBtns[1]) // Second row is the 59.99 solve

    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

    // Verify solve is deleted from database
    await waitFor(async () => {
      const deleted = await db.solves.get(createdSolves[4].id)
      expect(deleted?.deletedAt).toBeDefined()
    })

    // Remaining 5 solves: 10.0, 10.5, 11.0, 10.2, 10.8
    // Sorted: 10.0 (trimmed), 10.2, 10.5, 10.8, 11.0 (trimmed)
    // Middle 3: (10.2 + 10.5 + 10.8) / 3 = 31.5 / 3 = 10.50s (10500ms)
    await waitFor(async () => {
      const stats = await computeSolveStats(ownerId, '3x3', session.id)
      expect(stats.count).toBe(5)
      expect(stats.ao5).toBe(10500)
    })
  })

  it('3. Personal Best Progression (single PB and Ao5 PB detection and stats reflection)', async () => {
    const ownerId = await ensureGuestOwner()
    const session = newSession({ ownerId, name: 'PB Progression Session', event: '3x3', kind: 'manual' })
    await putSession(session, { enqueue: false, baseVersion: 0 })

    const settings = await getOrCreateSettings(ownerId)
    await db.settings.put({
      ...settings,
      sessionMode: 'manual',
      currentSessionIds: { '3x3': session.id },
    })

    // Add initial solve (15.00s)
    await putSolve(
      newSolve({ ownerId, sessionId: session.id, durationMs: 15000, penalty: 'none', scramble: '', event: '3x3', solvedAt: '2026-01-01T15:00:00Z' }),
      { enqueue: false, baseVersion: 0 },
    )
    let stats = await computeSolveStats(ownerId, '3x3')
    expect(stats.best).toBe(15000)

    // Add faster solve (12.50s) -> breaks PB
    await putSolve(
      newSolve({ ownerId, sessionId: session.id, durationMs: 12500, penalty: 'none', scramble: '', event: '3x3', solvedAt: '2026-01-01T15:01:00Z' }),
      { enqueue: false, baseVersion: 0 },
    )
    stats = await computeSolveStats(ownerId, '3x3')
    expect(stats.best).toBe(12500)

    // Add 3 more solves to complete Ao5 (11.00s, 11.50s, 10.50s)
    for (const time of [11000, 11500, 10500]) {
      await putSolve(
        newSolve({ ownerId, sessionId: session.id, durationMs: time, penalty: 'none', scramble: '', event: '3x3' }),
        { enqueue: false, baseVersion: 0 },
      )
    }

    stats = await computeSolveStats(ownerId, '3x3')
    expect(stats.best).toBe(10500)
    expect(stats.bestAo5).toBeDefined()
    expect(stats.count).toBe(5)

    // Render StatsPage and verify top PB cards
    renderWithApp(<StatsPage />)
    expect(await screen.findByText('PB Time')).toBeInTheDocument()
    expect(await screen.findByText('10.50')).toBeInTheDocument()
  })

  it('4. Full Persistence & State Restoration (Simulated Page Reload)', async () => {
    const ownerId = await ensureGuestOwner()

    // 1. Configure settings
    const settings = await getOrCreateSettings(ownerId)
    await db.settings.put({
      ...settings,
      event: '3x3',
      timerStartDelayMs: 300,
      timerFont: 'fira',
      accentColor: 'blue',
      sessionMode: 'manual',
    })

    // 2. Create session and 7 solves
    const session = newSession({ ownerId, name: 'Championship Prep', event: '3x3', kind: 'manual' })
    await putSession(session, { enqueue: false, baseVersion: 0 })

    await db.settings.put({
      ...(await db.settings.get(ownerId))!,
      currentSessionIds: { '3x3': session.id },
    })

    const times = [12000, 11000, 10000, 9500, 10500, 11500, 10200]
    for (let i = 0; i < times.length; i++) {
      await putSolve(
        newSolve({
          ownerId,
          sessionId: session.id,
          durationMs: times[i],
          penalty: i === 3 ? 'plus_two' : 'none', // Solve 3 (9500ms + 2000ms = 11500ms)
          scramble: `Scramble ${i + 1}`,
          event: '3x3',
          solvedAt: new Date(2026, 0, 1, 16, i).toISOString(),
        }),
        { enqueue: false, baseVersion: 0 },
      )
    }

    // 3. Simulate browser refresh by unmounting completely and remounting AppProviders
    cleanup()

    const { unmount } = renderWithApp(
      <div>
        <TimerPage variant="mobile" />
        <HistoryPage />
      </div>,
    )

    // Verify session name restored
    expect(await screen.findByText('Championship Prep')).toBeInTheDocument()

    // Verify solve count in History
    expect(screen.getByText(/7 solves/)).toBeInTheDocument()

    // Verify database state is 100% intact
    const restoredStats = await computeSolveStats(ownerId, '3x3', session.id)
    expect(restoredStats.count).toBe(7)
    expect(restoredStats.best).toBe(10000) // 10000ms is fastest clean solve
    expect(restoredStats.ao5).toBeDefined()

    unmount()
  })
})
