import Dexie from 'dexie'
import type { CubeEvent, Solve, StatsChartScale } from '../../domain/models'
import { effectiveTimeMs } from '../../domain/models'
import { dayKey } from '../../domain/stats/activity'
import { averageFromValues } from '../../domain/stats/averages'
import { RollingAverage } from '../../domain/stats/rollingAverage'
import { db } from '../db'

export interface SolveStats {
  count: number
  dnfCount: number
  plusTwoCount: number
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
  ao250: number | null
  ao500: number | null
  ao1000: number | null
  bestAo5: number | null
  bestAo12: number | null
  bestAo25: number | null
  bestAo50: number | null
  bestAo100: number | null
  bestAo250: number | null
  bestAo500: number | null
  bestAo1000: number | null
}

export const EMPTY_SOLVE_STATS: SolveStats = {
  count: 0,
  dnfCount: 0,
  plusTwoCount: 0,
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
  ao250: null,
  ao500: null,
  ao1000: null,
  bestAo5: null,
  bestAo12: null,
  bestAo25: null,
  bestAo50: null,
  bestAo100: null,
  bestAo250: null,
  bestAo500: null,
  bestAo1000: null,
}

export const AO_WINDOWS = [5, 12, 25, 50, 100, 250, 500, 1000] as const
export type AoWindow = (typeof AO_WINDOWS)[number]

const CURRENT_FIELD = {
  5: 'ao5',
  12: 'ao12',
  25: 'ao25',
  50: 'ao50',
  100: 'ao100',
  250: 'ao250',
  500: 'ao500',
  1000: 'ao1000',
} as const satisfies Record<AoWindow, keyof SolveStats>

const BEST_FIELD = {
  5: 'bestAo5',
  12: 'bestAo12',
  25: 'bestAo25',
  50: 'bestAo50',
  100: 'bestAo100',
  250: 'bestAo250',
  500: 'bestAo500',
  1000: 'bestAo1000',
} as const satisfies Record<AoWindow, keyof SolveStats>

const CURRENT_WINDOW_CAP = AO_WINDOWS[AO_WINDOWS.length - 1]

/** The latest average of `n`: null until there are `n` solves, and when it's a DNF. */
export function currentAverage(stats: SolveStats, n: AoWindow): number | null {
  return stats[CURRENT_FIELD[n]]
}

/** The best average of `n` so far: null until there are `n` solves, and when every one was a DNF. */
export function bestAverage(stats: SolveStats, n: AoWindow): number | null {
  return stats[BEST_FIELD[n]]
}

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
  // Exact for integer times, and the same sum summarizeEvents takes, so the two means agree.
  let sum = 0

  for (const solve of solvesNewestFirst) {
    const effective = effectiveTimeMs(solve)
    stats.count += 1
    stats.totalTime += solve.durationMs + (solve.penalty === 'plus_two' ? 2000 : 0)
    if (solve.penalty === 'plus_two') {
      stats.plusTwoCount += 1
    }
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
      sum += effective
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

  stats.mean = counted > 0 ? sum / counted : null
  stats.stdDev = counted > 0 ? Math.sqrt(m2 / counted) : null
  for (let i = 0; i < AO_WINDOWS.length; i += 1) {
    const n = AO_WINDOWS[i]
    stats[BEST_FIELD[n]] = bests[i]
    if (currentWindow.length >= n) {
      stats[CURRENT_FIELD[n]] = averageFromValues(currentWindow.slice(0, n), n)
    }
  }
  return stats
}

export interface EventSummary {
  event: CubeEvent
  count: number
  totalTime: number
  best: number | null
  mean: number | null
}

/** Totals for every event with solves, busiest first. One pass, no rolling averages. */
export async function summarizeEvents(ownerId: string): Promise<EventSummary[]> {
  const totals = new Map<CubeEvent, EventSummary & { counted: number; sum: number }>()
  await db.solves
    .where('ownerId')
    .equals(ownerId)
    .each((solve) => {
      if (solve.deletedAt) {
        return
      }
      let entry = totals.get(solve.event)
      if (!entry) {
        entry = { event: solve.event, count: 0, totalTime: 0, best: null, mean: null, counted: 0, sum: 0 }
        totals.set(solve.event, entry)
      }
      entry.count += 1
      entry.totalTime += solve.durationMs + (solve.penalty === 'plus_two' ? 2000 : 0)
      const effective = effectiveTimeMs(solve)
      if (effective !== null) {
        entry.counted += 1
        entry.sum += effective
        if (entry.best === null || effective < entry.best) {
          entry.best = effective
        }
      }
    })
  return Array.from(totals.values(), ({ counted, sum, ...summary }) => ({
    ...summary,
    mean: counted > 0 ? sum / counted : null,
  })).sort((a, b) => b.count - a.count)
}

/** Non-deleted solves per local day (YYYY-MM-DD), across every event, from `since` on. */
export async function countSolvesByDay(ownerId: string, since: Date): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  const fromMs = since.getTime()
  // Synced solvedAt strings are stored as received and may not be UTC ISO, so a string range on the
  // index could misplace them. Scan the owner's solves and compare parsed dates instead.
  await db.solves
    .where('ownerId')
    .equals(ownerId)
    .each((solve) => {
      if (solve.deletedAt) {
        return
      }
      const solvedAt = new Date(solve.solvedAt)
      if (!(solvedAt.getTime() >= fromMs)) {
        return
      }
      const key = dayKey(solvedAt)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    })
  return counts
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
