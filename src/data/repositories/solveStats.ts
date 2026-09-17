import Dexie from 'dexie'
import type { CubeEvent, Solve, StatsChartScale } from '../../domain/models'
import { effectiveTimeMs } from '../../domain/models'
import { averageFromValues } from '../../domain/stats/averages'
import { RollingAverage } from '../../domain/stats/rollingAverage'
import { db } from '../db'

export interface SolveStats {
  count: number
  dnfCount: number
  best: number | null
  worst: number | null
  mean: number | null
  stdDev: number | null
  totalTime: number
  ao5: number | null
  ao12: number | null
  ao25: number | null
  ao50: number | null
  ao100: number | null
  bestAo5: number | null
  bestAo12: number | null
  bestAo25: number | null
  bestAo50: number | null
  bestAo100: number | null
}

export const EMPTY_SOLVE_STATS: SolveStats = {
  count: 0,
  dnfCount: 0,
  best: null,
  worst: null,
  mean: null,
  stdDev: null,
  totalTime: 0,
  ao5: null,
  ao12: null,
  ao25: null,
  ao50: null,
  ao100: null,
  bestAo5: null,
  bestAo12: null,
  bestAo25: null,
  bestAo50: null,
  bestAo100: null,
}

const AO_WINDOWS = [5, 12, 25, 50, 100] as const
const CURRENT_FIELDS = ['ao5', 'ao12', 'ao25', 'ao50', 'ao100'] as const
const BEST_FIELDS = ['bestAo5', 'bestAo12', 'bestAo25', 'bestAo50', 'bestAo100'] as const
const CURRENT_WINDOW_CAP = 100

export const DEFAULT_CHART_POINTS = 500

export interface ChartPoint {
  index: number
  time: number | null
  ao5: number | null
  ao12: number | null
}

/**
 * Loads non-deleted solves oldest-first straight from the solvedAt compound index, so no
 * JS sort is needed. Ties on solvedAt come back in id order, the same order a stable
 * sort by solvedAt over the [ownerId+event] / [ownerId+sessionId] index gives.
 */
async function loadSolvesOldestFirst(
  ownerId: string,
  event: CubeEvent,
  sessionId?: string,
): Promise<Solve[]> {
  const collection = sessionId
    ? db.solves
        .where('[ownerId+sessionId+solvedAt]')
        .between([ownerId, sessionId, Dexie.minKey], [ownerId, sessionId, Dexie.maxKey])
    : db.solves
        .where('[ownerId+event+solvedAt]')
        .between([ownerId, event, Dexie.minKey], [ownerId, event, Dexie.maxKey])
  return collection.filter((solve) => !solve.deletedAt).toArray()
}

/**
 * Reverses an oldest-first list to newest-first while keeping solves that share a
 * solvedAt in their original relative order (what a stable descending sort yields).
 */
function newestFirst(oldestFirst: Solve[]): Solve[] {
  const out: Solve[] = new Array(oldestFirst.length)
  let write = 0
  let end = oldestFirst.length
  while (end > 0) {
    let start = end - 1
    const solvedAt = oldestFirst[start].solvedAt
    while (start > 0 && oldestFirst[start - 1].solvedAt === solvedAt) {
      start -= 1
    }
    for (let i = start; i < end; i += 1) {
      out[write] = oldestFirst[i]
      write += 1
    }
    end = start
  }
  return out
}

/**
 * Computes all statistics for an event (or a single session). Every non-deleted solve
 * is loaded; the pass itself is linear, with rolling averages kept incrementally.
 */
export async function computeSolveStats(
  ownerId: string,
  event: CubeEvent,
  sessionId?: string,
): Promise<SolveStats> {
  const solves = await loadSolvesOldestFirst(ownerId, event, sessionId)
  return summarizeSolves(newestFirst(solves))
}

export function summarizeSolves(solvesNewestFirst: Solve[]): SolveStats {
  const stats: SolveStats = { ...EMPTY_SOLVE_STATS }
  const currentWindow: Array<number | null> = []
  const windows = AO_WINDOWS.map((n) => new RollingAverage(n))
  const bests: Array<number | null> = AO_WINDOWS.map(() => null)
  let mean = 0
  let m2 = 0
  let counted = 0

  for (const solve of solvesNewestFirst) {
    const effective = effectiveTimeMs(solve)
    stats.count += 1
    stats.totalTime += solve.durationMs + (solve.penalty === 'plus_two' ? 2000 : 0)
    if (solve.penalty === 'dnf') {
      stats.dnfCount += 1
    } else if (effective !== null) {
      counted += 1
      if (stats.best === null || effective < stats.best) {
        stats.best = effective
      }
      if (stats.worst === null || effective > stats.worst) {
        stats.worst = effective
      }
      const delta = effective - mean
      mean += delta / counted
      m2 += delta * (effective - mean)
    }
    if (currentWindow.length < CURRENT_WINDOW_CAP) {
      currentWindow.push(effective)
    }
    for (let i = 0; i < windows.length; i += 1) {
      const window = windows[i]
      window.push(effective)
      const value = window.average()
      const best = bests[i]
      if (value !== null && (best === null || value < best)) {
        bests[i] = value
      }
    }
  }

  stats.mean = counted > 0 ? mean : null
  stats.stdDev = counted > 0 ? Math.sqrt(m2 / counted) : null
  for (let i = 0; i < AO_WINDOWS.length; i += 1) {
    const n = AO_WINDOWS[i]
    stats[BEST_FIELDS[i]] = bests[i]
    if (currentWindow.length >= n) {
      stats[CURRENT_FIELDS[i]] = averageFromValues(currentWindow.slice(0, n), n)
    }
  }
  return stats
}

/**
 * Streams the solve history into chart points with continuous rolling averages.
 * Supports scaling to recent solves ('100', '250', '500', '1000') or 'all' with downsampling.
 */
export async function collectChartSeries(
  ownerId: string,
  event: CubeEvent,
  scale: StatsChartScale = 'all',
  maxPoints = DEFAULT_CHART_POINTS,
): Promise<ChartPoint[]> {
  const limit = scale === 'all' ? null : Number(scale)
  const pts = chartPointsFromSolves(await loadSolvesOldestFirst(ownerId, event))
  if (limit !== null) {
    return pts.length > limit ? pts.slice(-limit) : pts
  }
  return downsampleChartPoints(pts, maxPoints)
}

export function chartPointsFromSolves(solvesOldestFirst: Solve[]): ChartPoint[] {
  const pts: ChartPoint[] = new Array(solvesOldestFirst.length)
  const ao5 = new RollingAverage(5)
  const ao12 = new RollingAverage(12)
  for (let i = 0; i < solvesOldestFirst.length; i += 1) {
    const effective = effectiveTimeMs(solvesOldestFirst[i])
    ao5.push(effective)
    ao12.push(effective)
    const avg5 = ao5.average()
    const avg12 = ao12.average()
    pts[i] = {
      index: i + 1,
      time: effective === null ? null : effective / 1000,
      ao5: avg5 === null ? null : avg5 / 1000,
      ao12: avg12 === null ? null : avg12 / 1000,
    }
  }
  return pts
}

/**
 * Min/max-per-bucket downsampling over the whole series. Keeps the first and last
 * point, emits each bucket's extremes in chronological order, and one point for
 * buckets without any timed solve.
 */
export function downsampleChartPoints(points: ChartPoint[], maxPoints: number): ChartPoint[] {
  const n = points.length
  if (n <= maxPoints) {
    return points
  }
  if (maxPoints < 2) {
    return maxPoints < 1 ? [] : [points[n - 1]]
  }
  const buckets = Math.floor((maxPoints - 2) / 2)
  const out: ChartPoint[] = [points[0]]
  const middle = n - 2
  for (let b = 0; b < buckets; b += 1) {
    const start = 1 + Math.floor((b * middle) / buckets)
    const end = 1 + Math.floor(((b + 1) * middle) / buckets)
    let minAt = -1
    let maxAt = -1
    for (let i = start; i < end; i += 1) {
      const time = points[i].time
      if (time === null) {
        continue
      }
      if (minAt === -1 || time < (points[minAt].time as number)) {
        minAt = i
      }
      if (maxAt === -1 || time > (points[maxAt].time as number)) {
        maxAt = i
      }
    }
    if (minAt === -1) {
      out.push(points[Math.floor((start + end - 1) / 2)])
    } else if (minAt === maxAt) {
      out.push(points[minAt])
    } else {
      out.push(points[Math.min(minAt, maxAt)], points[Math.max(minAt, maxAt)])
    }
  }
  out.push(points[n - 1])
  return out
}
