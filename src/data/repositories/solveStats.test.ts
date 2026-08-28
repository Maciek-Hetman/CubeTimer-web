import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db'
import {
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
})

describe('collectChartSeries', () => {
  beforeEach(resetDb)

  it('keeps every point when the history is smaller than the cap', async () => {
    const owner = 'user-1'
    seedDataset(owner, 'session-1', 30)
    const series = await collectChartSeries(owner, '3x3', 100)
    expect(series).toHaveLength(30)
    expect(series[0].index).toBe(1)
    expect(series[series.length - 1].index).toBe(30)
  })

  it('downsamples large histories to a bounded point count', async () => {
    const owner = 'user-1'
    seedDataset(owner, 'session-1', 600)
    const series = await collectChartSeries(owner, '3x3', DEFAULT_CHART_POINTS)
    expect(series.length).toBeLessThanOrEqual(DEFAULT_CHART_POINTS)
    expect(series[0].index).toBe(1)
    expect(series[series.length - 1].index).toBe(600)
  }, 15_000)
})