import Dexie from 'dexie'
import type { CubeEvent, Solve, StatsChartScale } from '../../domain/models'
import { effectiveTimeMs } from '../../domain/models'
import { averageFromValues } from '../../domain/stats/averages'
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

function solvesByTime(ownerId: string, event: CubeEvent, sessionId?: string, descending = true) {
  const query = sessionId
    ? db.solves
        .where('[ownerId+sessionId+solvedAt]')
        .between([ownerId, sessionId, Dexie.minKey], [ownerId, sessionId, Dexie.maxKey], true, true)
    : db.solves
        .where('[ownerId+event+solvedAt]')
        .between([ownerId, event, Dexie.minKey], [ownerId, event, Dexie.maxKey], true, true)
  return descending ? query.reverse() : query
}

/**
 * Computes all statistics for an event (or a single session) by streaming
 * solves newest-first with a single pass. Memory stays bounded by the largest
 * average window regardless of history size.
 */
export async function computeSolveStats(
  ownerId: string,
  event: CubeEvent,
  sessionId?: string,
): Promise<SolveStats> {
  const stats: SolveStats = { ...EMPTY_SOLVE_STATS }
  const currentWindow: Array<number | null> = []
  const deques: Array<Array<number | null>> = AO_WINDOWS.map(() => [])
  let mean = 0
  let m2 = 0
  let counted = 0

  const feed = (solve: Solve) => {
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
    for (let i = 0; i < AO_WINDOWS.length; i += 1) {
      const n = AO_WINDOWS[i]
      const deque = deques[i]
      deque.push(effective)
      if (deque.length > n) {
        deque.shift()
      }
      if (deque.length === n) {
        const value = averageFromValues(deque, n)
        const field = BEST_FIELDS[i]
        if (value !== null && (stats[field] === null || value < (stats[field] as number))) {
          stats[field] = value
        }
      }
    }
  }

  await solvesByTime(ownerId, event, sessionId)
    .filter((solve) => !solve.deletedAt)
    .each(feed)

  stats.mean = counted > 0 ? mean : null
  stats.stdDev = counted > 0 ? Math.sqrt(m2 / counted) : null
  for (let i = 0; i < AO_WINDOWS.length; i += 1) {
    const n = AO_WINDOWS[i]
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
  type RawPoint = { pos: number; time: number | null; ao5: number | null; ao12: number | null }
  const pts: RawPoint[] = []
  const aoWindows: Array<{ n: number; deque: Array<number | null> }> = [
    { n: 5, deque: [] },
    { n: 12, deque: [] },
  ]
  let pos = 0
  const limit = scale === 'all' ? null : Number(scale)

  const feed = (solve: Solve) => {
    pos += 1
    const effective = effectiveTimeMs(solve)
    const time = effective === null ? null : effective / 1000
    const point: RawPoint = { pos, time, ao5: null, ao12: null }
    for (const window of aoWindows) {
      window.deque.push(effective)
      if (window.deque.length > window.n) {
        window.deque.shift()
      }
      if (window.deque.length === window.n) {
        const value = averageFromValues(window.deque, window.n)
        if (window.n === 5) {
          point.ao5 = value === null ? null : value / 1000
        } else {
          point.ao12 = value === null ? null : value / 1000
        }
      }
    }
    pts.push(point)
    if (limit !== null) {
      if (pts.length > limit) {
        pts.shift()
      }
    } else if (pts.length > maxPoints) {
      const tail = pts.slice(-4)
      const rest = pts.slice(0, -4)
      if (tail.length === 4) {
        const min = tail.reduce((a, b) =>
          b.time !== null && (a.time === null || b.time < a.time) ? b : a,
        )
        const max = tail.reduce((a, b) =>
          b.time !== null && (a.time === null || b.time > a.time) ? b : a,
        )
        pts.length = 0
        pts.push(...rest, min, max)
      }
    }
  }

  await solvesByTime(ownerId, event, undefined, false)
    .filter((solve) => !solve.deletedAt)
    .each(feed)

  return pts.map((point) => ({
    index: point.pos,
    time: point.time,
    ao5: point.ao5,
    ao12: point.ao12,
  }))
}