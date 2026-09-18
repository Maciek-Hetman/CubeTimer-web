import { eventLabel, normalizeTimingDevice, type Solve } from '../../domain/models'
import { formatSolveTime } from '../../domain/stats/formatTime'

const SHARE_DEVICE_LABELS = {
  keyboard: 'keyboard',
  external_timer: 'Bluetooth timer',
  smart_cube: 'smart cube',
} as const

export function formatSolveShareText(solve: Solve): string {
  const device = SHARE_DEVICE_LABELS[normalizeTimingDevice(solve.timingDevice)]
  const date = new Date(solve.solvedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  const lines = [`${eventLabel(solve.event)} solve: ${formatSolveTime(solve)}`, `Timed with ${device} · ${date}`]
  if (solve.scramble) {
    lines.push(`Scramble: ${solve.scramble}`)
  }
  return lines.join('\n')
}

export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'failed'

/** Opens the native share sheet when available, otherwise copies the solve to the clipboard. */
export async function shareSolve(solve: Solve): Promise<ShareResult> {
  const text = formatSolveShareText(solve)
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ text })
      return 'shared'
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return 'cancelled'
      }
      // Fall through to the clipboard if the share sheet is unavailable.
    }
  }
  try {
    await navigator.clipboard.writeText(text)
    return 'copied'
  } catch {
    return 'failed'
  }
}
