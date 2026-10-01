/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generateScramble } from '../features/scramble/scrambleService'
import { ScrambleProvider } from './ScrambleProvider'

const setEvent = vi.hoisted(() => vi.fn())

vi.mock('./AuthContext', () => ({ useAuth: () => ({ ready: true }) }))
vi.mock('./SettingsContext', () => ({ useSettings: () => ({ settings: { event: '3x3' }, setEvent }) }))
vi.mock('../features/scramble/scrambleService', () => ({ generateScramble: vi.fn() }))

/**
 * Counts React state updates from here on. Every update reads window.event to pick its priority, and
 * once a test environment is torn down that read throws "window is not defined".
 */
function watchStateUpdates() {
  let reads = 0
  Object.defineProperty(window, 'event', {
    configurable: true,
    get: () => {
      reads += 1
      return undefined
    },
  })
  return {
    count: () => reads,
    stop: () => delete (window as { event?: unknown }).event,
  }
}

describe('ScrambleProvider', () => {
  beforeEach(() => {
    vi.mocked(generateScramble).mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it.each([
    ['fails', (settle: { reject: (error: Error) => void }) => settle.reject(new Error('Worker went away'))],
    ['arrives', (settle: { resolve: (value: string) => void }) => settle.resolve("R U R' U'")],
  ] as const)('drops a scramble that %s after the provider unmounts', async (_outcome, finish) => {
    const settle = {} as { resolve: (value: string) => void; reject: (error: Error) => void }
    vi.mocked(generateScramble).mockImplementationOnce(
      () =>
        new Promise<string>((resolve, reject) => {
          settle.resolve = resolve
          settle.reject = reject
        }),
    )
    const { unmount } = render(
      <ScrambleProvider>
        <p>Timer</p>
      </ScrambleProvider>,
    )
    await waitFor(() => expect(generateScramble).toHaveBeenCalledOnce())
    unmount()

    const updates = watchStateUpdates()
    try {
      finish(settle)
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(updates.count()).toBe(0)
    } finally {
      updates.stop()
    }
  })
})
