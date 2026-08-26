import { effectiveTimeMs, type Penalty } from '../models'

export function formatDuration(ms: number): string {
  const centiseconds = Math.floor(ms / 10)
  const minutes = Math.floor(centiseconds / 6000)
  const seconds = Math.floor((centiseconds % 6000) / 100)
  const cs = centiseconds % 100
  const paddedCs = cs.toString().padStart(2, '0')
  if (minutes > 0) {
    return `${minutes}:${seconds.toString().padStart(2, '0')}.${paddedCs}`
  }
  return `${seconds}.${paddedCs}`
}

export function formatSolveTime(solve: { durationMs: number; penalty: Penalty }): string {
  if (solve.penalty === 'dnf') {
    return 'DNF'
  }
  const ms = effectiveTimeMs(solve)
  if (ms === null) {
    return 'DNF'
  }
  const formatted = formatDuration(ms)
  return solve.penalty === 'plus_two' ? `${formatted}+` : formatted
}

export function formatAverage(ms: number | null): string {
  if (ms === null) {
    return 'DNF'
  }
  return formatDuration(ms)
}

export function formatTotalTime(ms: number): string {
  if (ms === 0) return '0s'
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  const parts = []
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0) parts.push(`${minutes}m`)
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`)

  return parts.join(' ')
}
