import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Solve } from '../../domain/models'
import { formatSolveShareText, shareSolve } from './shareSolve'

const solve: Solve = {
  id: 's1',
  ownerId: 'o1',
  sessionId: null,
  durationMs: 9876,
  penalty: 'plus_two',
  solvedAt: '2026-09-17T09:03:00.000Z',
  scramble: "R U R' U'",
  event: '3x3',
  timingDevice: 'external_timer',
  version: 1,
  updatedAt: '2026-09-17T09:03:00.000Z',
  deletedAt: null,
}

describe('shareSolve', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('formats time, event, device and scramble', () => {
    const text = formatSolveShareText(solve)
    expect(text).toContain('3x3 solve: 11.87+')
    expect(text).toContain('Timed with Bluetooth timer')
    expect(text).toContain("Scramble: R U R' U'")
  })

  it('uses the native share sheet when available', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { share })
    expect(await shareSolve(solve)).toBe('shared')
    expect(share).toHaveBeenCalledWith({ text: formatSolveShareText(solve) })
  })

  it('treats a dismissed share sheet as cancelled', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('dismissed', 'AbortError'))
    vi.stubGlobal('navigator', { share })
    expect(await shareSolve(solve)).toBe('cancelled')
  })

  it('falls back to the clipboard without Web Share', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    expect(await shareSolve(solve)).toBe('copied')
    expect(writeText).toHaveBeenCalledWith(formatSolveShareText(solve))
  })
})
