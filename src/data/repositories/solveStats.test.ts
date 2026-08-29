import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db'
import {
  countSolvesBySession,
  listSolves,
  listSolvesForSession,
  newSolve,
  putSolve,
  recentSolves,
  RECENT_SOLVES_LIMIT,
} from './solves'
import {
  collectChartSeries,
  computeSolveStats,
  DEFAULT_CHART_POINTS,
} from './solveStats'
import {
  averageOfN,
  bestAverageOfN,
  bestSingle,
  meanOfSolves,
  standardDeviation,
  totalTime,
  worstSingle,
} from '../../domain/stats/averages'
import { nowIso, type CubeEvent, type Penalty, type Solve } from '../../domain/models'

function makeSolve(
  ownerId: string,
  sessionId: string | null,
  durationMs: number,
  penalty: Penalty,
  solvedAt: string,
  event: CubeEvent = '3x3',
): Solve {
  return newSolve({ ownerId, sessionId, durationMs, penalty, scramble: `R ${durationMs}`, event, solvedAt })
}

async function seedDataset(owner: string, session: string, count: number) {
  const base = Date.parse('2026-01-01T00:00:00.000Z')
  const rows: Solve[] = []
  for (let i = 0; i < count; i += 1) {
    const ms = 5000 + ((i * 137) % 15000)
    const penalty: Penalty = i % 17 === 0 ? 'dnf' : i % 7 === 0 ? 'plus_two' : 'none'
    const at = new Date(base + i * 60_000).toISOString()
    rows.push(makeSolve(owner, session, ms, penalty, at))
  }
  await db.solves.bulkPut(rows)
}

async function resetDb() {
  await db.transaction('rw', db.solves, db.outbox, async () => {
    await db.solves.clear()
    await db.outbox.clear()
  })
}

describe('solveStats streaming aggregation', () => {
  beforeEach(resetDb)

  it('matches array-based statistics on a large mixed dataset', async () => {
    const owner = 'user-1'
    const session = 'session-1'
    seedDataset(owner, session, 130)

    const stats = await computeSolveStats(owner, '3x3')
    const solves = await listSolves(owner, '3x3')

    expect(stats.count).toBe(solves.length)
    expect(stats.best).toBe(bestSingle(solves))
    expect(stats.worst).toBe(worstSingle(solves))
    expect(stats.mean).toBeCloseTo(meanOfSolves(solves) ?? NaN, 6)
    expect(stats.stdDev).toBeCloseTo(standardDeviation(solves) ?? NaN, 6)
    expect(stats.totalTime).toBe(totalTime(solves))
    for (const n of [5, 12, 25, 50, 100] as const) {
      const current = { 5: stats.ao5, 12: stats.ao12, 25: stats.ao25, 50: stats.ao50, 100: stats.ao100 }[n]
      const best = {
        5: stats.bestAo5,
        12: stats.bestAo12,
        25: stats.bestAo25,
        50: stats.bestAo50,
        100: stats.bestAo100,
      }[n]
      expect(current).toBe(averageOfN(solves, n))
      expect(best).toBe(bestAverageOfN(solves, n))
    }
  })

  it('is scoped to a single session', async () => {
    const owner = 'user-1'
    seedDataset(owner, 'session-1', 20)
    seedDataset(owner, 'session-2', 30)

    const scoped = await computeSolveStats(owner, '3x3', 'session-1')
    expect(scoped.count).toBe(20)
    const all = await computeSolveStats(owner, '3x3')
    expect(all.count).toBe(50)
  })

  it('ignores tombstones', async () => {
    const owner = 'user-1'
    const session = 'session-1'
    seedDataset(owner, session, 20)
    const solves = await listSolves(owner, '3x3')
    const first = solves[0]
    await putSolve({ ...first, deletedAt: nowIso() }, { enqueue: false })

    const stats = await computeSolveStats(owner, '3x3')
    expect(stats.count).toBe(19)
    const remaining = await listSolves(owner, '3x3')
    expect(remaining).toHaveLength(19)
    expect(remaining.some((solve) => solve.id === first.id)).toBe(false)
  })

  it('returns empty stats when there are no solves', async () => {
    const stats = await computeSolveStats('user-1', '3x3')
    expect(stats.count).toBe(0)
    expect(stats.best).toBeNull()
    expect(stats.totalTime).toBe(0)
  })
})

describe('bounded solve queries', () => {
  beforeEach(resetDb)

  it('returns the newest solves first, bounded by the limit', async () => {
    const owner = 'user-1'
    seedDataset(owner, 'session-1', 50)
    const recent = await recentSolves(owner, '3x3')
    expect(recent).toHaveLength(RECENT_SOLVES_LIMIT)
    for (let i = 1; i < recent.length; i += 1) {
      expect(recent[i - 1].solvedAt >= recent[i].solvedAt).toBe(true)
    }
    const solves = await listSolves(owner, '3x3')
    expect(recent[0].id).toBe(solves[0].id)
  })

  it('lists a bounded set of solves for one session', async () => {
    const owner = 'user-1'
    seedDataset(owner, 'session-1', 50)
    const rows = await listSolvesForSession(owner, 'session-1', 10)
    expect(rows).toHaveLength(10)
    for (const row of rows) {
      expect(row.sessionId).toBe('session-1')
    }
  })

  it('aggregates solve count and average solve time per session', async () => {
    const owner = 'user-1'
    const now = '2026-01-01T12:00:00.000Z'
    // Session 1: 3 valid solves (10s, 20s, 30s) -> avg = 20s (20000ms)
    await putSolve(makeSolve(owner, 'session-1', 10000, 'none', now), { enqueue: false })
    await putSolve(makeSolve(owner, 'session-1', 20000, 'none', now), { enqueue: false })
    await putSolve(makeSolve(owner, 'session-1', 30000, 'none', now), { enqueue: false })

    // Session 2: 1 normal (10s), 1 with +2 penalty (10s + 2s = 12s), 1 DNF -> avg = (10s + 12s)/2 = 11s (11000ms), count = 3
    await putSolve(makeSolve(owner, 'session-2', 10000, 'none', now), { enqueue: false })
    await putSolve(makeSolve(owner, 'session-2', 10000, 'plus_two', now), { enqueue: false })
    await putSolve(makeSolve(owner, 'session-2', 15000, 'dnf', now), { enqueue: false })

    // Session 3: only DNF -> avg = null, count = 2
    await putSolve(makeSolve(owner, 'session-3', 10000, 'dnf', now), { enqueue: false })
    await putSolve(makeSolve(owner, 'session-3', 12000, 'dnf', now), { enqueue: false })

    // Orphan solves: 2 solves (15s, 25s) -> avg = 20s (20000ms), count = 2
    await putSolve(makeSolve(owner, null, 15000, 'none', now), { enqueue: false })
    await putSolve(makeSolve(owner, null, 25000, 'none', now), { enqueue: false })

    // Deleted solve in session 1 (should be ignored)
    const deletedSolve = makeSolve(owner, 'session-1', 999999, 'none', now)
    await putSolve({ ...deletedSolve, deletedAt: now }, { enqueue: false })

    const summary = await countSolvesBySession(owner, '3x3')

    expect(summary.counts.get('session-1')).toBe(3)
    expect(summary.averages.get('session-1')).toBe(20000)

    expect(summary.counts.get('session-2')).toBe(3)
    expect(summary.averages.get('session-2')).toBe(11000)

    expect(summary.counts.get('session-3')).toBe(2)
    expect(summary.averages.get('session-3')).toBeNull()

    expect(summary.orphanCount).toBe(2)
    expect(summary.orphanAvgTime).toBe(20000)
  })
})

describe('collectChartSeries', () => {
  beforeEach(resetDb)

  it('keeps every point when the history is smaller than the cap', async () => {
    const owner = 'user-1'
    seedDataset(owner, 'session-1', 30)
    const series = await collectChartSeries(owner, '3x3', 'all', 100)
    expect(series).toHaveLength(30)
    expect(series[0].index).toBe(1)
    expect(series[series.length - 1].index).toBe(30)
  })

  it('downsamples large histories to a bounded point count when scale is all', async () => {
    const owner = 'user-1'
    seedDataset(owner, 'session-1', 600)
    const series = await collectChartSeries(owner, '3x3', 'all', DEFAULT_CHART_POINTS)
    expect(series.length).toBeLessThanOrEqual(DEFAULT_CHART_POINTS)
    expect(series[0].index).toBe(1)
    expect(series[series.length - 1].index).toBe(600)
  }, 15_000)

  it('overlays running ao5 and ao12 averages on every point', async () => {
    const owner = 'user-1'
    seedDataset(owner, 'session-1', 30)
    const solves = await listSolves(owner, '3x3')
    const series = await collectChartSeries(owner, '3x3', 'all', 100)
    const seconds = (value: number | null) => (value === null ? null : value / 1000)

    for (const point of series) {
      const from = solves.length - point.index
      expect(point.ao5).toBe(seconds(averageOfN(solves.slice(from, from + 5), 5)))
      expect(point.ao12).toBe(seconds(averageOfN(solves.slice(from, from + 12), 12)))
    }
    const latest = series[series.length - 1]
    expect(latest.ao5).not.toBeNull()
    expect(latest.ao12).not.toBeNull()
  })

  it('carries ao5 and ao12 through downsampling', async () => {
    const owner = 'user-1'
    seedDataset(owner, 'session-1', 600)
    const solves = await listSolves(owner, '3x3')
    const series = await collectChartSeries(owner, '3x3', 'all', DEFAULT_CHART_POINTS)
    const seconds = (value: number | null) => (value === null ? null : value / 1000)

    for (const point of series) {
      const from = solves.length - point.index
      expect(point.ao5).toBe(seconds(averageOfN(solves.slice(from, from + 5), 5)))
      expect(point.ao12).toBe(seconds(averageOfN(solves.slice(from, from + 12), 12)))
    }
    const latest = series[series.length - 1]
    expect(latest.ao5).not.toBeNull()
    expect(latest.ao12).not.toBeNull()
  }, 15_000)

  it('slices to the last N points and retains absolute solve index for scaling options', async () => {
    const owner = 'user-1'
    seedDataset(owner, 'session-1', 250)
    const solves = await listSolves(owner, '3x3')
    const seconds = (value: number | null) => (value === null ? null : value / 1000)

    // Last 100
    const series100 = await collectChartSeries(owner, '3x3', '100')
    expect(series100).toHaveLength(100)
    expect(series100[0].index).toBe(151)
    expect(series100[series100.length - 1].index).toBe(250)

    // Verify rolling averages on the boundary of the slice
    for (const point of series100) {
      const from = solves.length - point.index
      expect(point.ao5).toBe(seconds(averageOfN(solves.slice(from, from + 5), 5)))
      expect(point.ao12).toBe(seconds(averageOfN(solves.slice(from, from + 12), 12)))
    }

    // Last 250
    const series250 = await collectChartSeries(owner, '3x3', '250')
    expect(series250).toHaveLength(250)
    expect(series250[0].index).toBe(1)
    expect(series250[series250.length - 1].index).toBe(250)
  })

  it('returns all points if total solves are fewer than the selected scale', async () => {
    const owner = 'user-1'
    seedDataset(owner, 'session-1', 40)

    const series500 = await collectChartSeries(owner, '3x3', '500')
    expect(series500).toHaveLength(40)
    expect(series500[0].index).toBe(1)
    expect(series500[series500.length - 1].index).toBe(40)

    const series1000 = await collectChartSeries(owner, '3x3', '1000')
    expect(series1000).toHaveLength(40)
    expect(series1000[0].index).toBe(1)
    expect(series1000[series1000.length - 1].index).toBe(40)
  })
})