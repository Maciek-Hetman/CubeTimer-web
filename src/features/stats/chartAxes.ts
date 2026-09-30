import type { ChartPoint } from '../../data/repositories/solveStats'
import { formatDuration } from '../../domain/stats/formatTime'

/** Chart values are seconds; read them the way every other time on the page reads. */
export function formatChartSeconds(seconds: number): string {
  // Round away float noise from ms / 1000 first, so 12.35 can't floor to 12.34.
  return formatDuration(Math.round(seconds * 100_000) / 100)
}

export function formatAxisSeconds(seconds: number): string {
  if (seconds < 60) {
    return Number.isInteger(seconds) ? String(seconds) : seconds.toFixed(1)
  }
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
}

/**
 * Round solve numbers (250, 500, 750…) inside the plotted range. Recharts steps its own
 * ticks from the first solve instead, which gives 1, 351, 701….
 */
export function solveTicks(points: ChartPoint[]): number[] | undefined {
  if (points.length < 2) return undefined
  const first = points[0].index
  const last = points[points.length - 1].index
  const rough = Math.max((last - first) / 5, 1)
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const step = [1, 2, 2.5, 5, 10]
    .map((multiple) => multiple * magnitude)
    .filter(Number.isInteger)
    .reduce((best, candidate) => (Math.abs(candidate - rough) < Math.abs(best - rough) ? candidate : best))
  const ticks: number[] = []
  for (let tick = Math.ceil(first / step) * step; tick <= last; tick += step) {
    ticks.push(tick)
  }
  return ticks
}
