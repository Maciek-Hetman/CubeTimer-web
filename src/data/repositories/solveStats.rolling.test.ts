import { beforeEach, describe, expect, it } from 'vitest'
import type { Penalty, Solve } from '../../domain/models'
import {
  averageOfN,
  bestAverageOfN,
  bestSingle,
  meanOfSolves,
  standardDeviation,
  totalTime,
  worstSingle,
} from '../../domain/stats/averages'
import { db } from '../db'
import { newSolve } from './solves'
import {
  chartPointsFromSolves,
  collectChartSeries,
  computeSolveStats,
  summarizeSolves,
} from './solveStats'

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function randomSolves(rand: () => number, count: number, range: number, sameSecondRate = 0): Solve[] {
  const base = Date.UTC(2026, 0, 1)
  let at = base
  const rows: Solve[] = []
  for (let i = 0; i < count; i += 1) {
    const roll = rand()
    const penalty: Penalty = roll < 0.08 ? 'dnf' : roll < 0.2 ? 'plus_two' : 'none'
    if (rand() >= sameSecondRate) {
      at += 1000
    }
    rows.push(
      newSolve({
        ownerId: 'owner',
        sessionId: rand() < 0.5 ? 'session-a' : 'session-b',
        durationMs: 5000 + Math.floor(rand() * range),
        penalty,
        scramble: '',
        event: '3x3',
        solvedAt: new Date(at).toISOString(),
      }),
    )
  }
  return rows
}

function expectClose(actual: number | null, expected: number | null) {
  if (expected === null) {
    expect(actual).toBeNull()
  } else {
    expect(actual).toBeCloseTo(expected, 6)
  }
}

const CURRENT = { 5: 'ao5', 12: 'ao12', 25: 'ao25', 50: 'ao50', 100: 'ao100' } as const
const BEST = { 5: 'bestAo5', 12: 'bestAo12', 25: 'bestAo25', 50: 'bestAo50', 100: 'bestAo100' } as const

describe('summarizeSolves', () => {
  it('matches the array-based reference for randomized histories', () => {
    const rand = mulberry32(7)
    for (const count of [0, 4, 5, 6, 11, 12, 13, 24, 25, 26, 49, 50, 51, 99, 100, 101, 350]) {
      for (const range of [5, 15000]) {
        const newestFirst = randomSolves(rand, count, range).reverse()
        const stats = summarizeSolves(newestFirst)
        expect(stats.count).toBe(count)
        expect(stats.best).toBe(bestSingle(newestFirst))
        expect(stats.worst).toBe(worstSingle(newestFirst))
        expect(stats.totalTime).toBe(totalTime(newestFirst))
        expectClose(stats.mean, meanOfSolves(newestFirst))
        expectClose(stats.stdDev, standardDeviation(newestFirst))
        for (const n of [5, 12, 25, 50, 100] as const) {
          expect(stats[CURRENT[n]]).toBe(averageOfN(newestFirst, n))
          expect(stats[BEST[n]]).toBe(bestAverageOfN(newestFirst, n))
        }
      }
    }
  })
})

describe('chartPointsFromSolves', () => {
  it('matches averageOfN for every rolling point', () => {
    const rand = mulberry32(99)
    const oldestFirst = randomSolves(rand, 300, 40)
    const points = chartPointsFromSolves(oldestFirst)
    const seconds = (ms: number | null) => (ms === null ? null : ms / 1000)
    points.forEach((point, i) => {
      const upTo = oldestFirst.slice(0, i + 1).reverse()
      expect(point.index).toBe(i + 1)
      expect(point.ao5).toBe(seconds(averageOfN(upTo, 5)))
      expect(point.ao12).toBe(seconds(averageOfN(upTo, 12)))
    })
  })
})

describe('indexed solve loading', () => {
  beforeEach(async () => {
    await db.transaction('rw', db.solves, db.outbox, async () => {
      await db.solves.clear()
      await db.outbox.clear()
    })
  })

  it('orders like a stable localeCompare sort, including solvedAt ties and tombstones', async () => {
    const rand = mulberry32(1234)
    const rows = randomSolves(rand, 400, 15000, 0.3)
    rows.push(
      ...randomSolves(rand, 30, 15000).map((solve) => ({ ...solve, event: '2x2' as const })),
      ...randomSolves(rand, 30, 15000).map((solve) => ({ ...solve, ownerId: 'other' })),
    )
    for (let i = 0; i < rows.length; i += 9) {
      rows[i] = { ...rows[i], deletedAt: '2026-02-01T00:00:00.000Z' }
    }
    await db.solves.bulkPut(rows)

    const reference = async (sessionId?: string, ascending = false) => {
      const collection = sessionId
        ? db.solves.where('[ownerId+sessionId]').equals(['owner', sessionId])
        : db.solves.where('[ownerId+event]').equals(['owner', '3x3'])
      const loaded = await collection.filter((solve) => !solve.deletedAt).toArray()
      return ascending
        ? loaded.sort((a, b) => a.solvedAt.localeCompare(b.solvedAt))
        : loaded.sort((a, b) => b.solvedAt.localeCompare(a.solvedAt))
    }

    const all = await reference()
    const expected = summarizeSolves(all)
    const actual = await computeSolveStats('owner', '3x3')
    expect(actual).toEqual(expected)
    expect(Object.is(actual.mean, expected.mean)).toBe(true)
    expect(Object.is(actual.stdDev, expected.stdDev)).toBe(true)

    const session = await reference('session-a')
    expect(await computeSolveStats('owner', '3x3', 'session-a')).toEqual(summarizeSolves(session))

    const series = await collectChartSeries('owner', '3x3', '1000')
    expect(series).toEqual(chartPointsFromSolves(await reference(undefined, true)))
  })
})
