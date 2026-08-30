/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../data/db'
import { generateScramble } from '../features/scramble/scrambleService'
import { AuthProvider } from './AuthProvider'
import { SettingsProvider } from './SettingsProvider'
import { ScrambleProvider } from './ScrambleProvider'
import { useScramble } from './ScrambleContext'

vi.mock('../features/scramble/scrambleService', () => ({
  generateScramble: vi.fn(async () => "R U R' U'"),
}))

describe('ScrambleContext & ScrambleProvider', () => {
  beforeEach(async () => {
    cleanup()
    vi.mocked(generateScramble).mockClear()
    await db.delete()
    await db.open()
  })

  afterEach(async () => {
    cleanup()
  })

  it('throws error when useScramble is used outside of ScrambleProvider', () => {
    expect(() => renderHook(() => useScramble())).toThrow(
      'useScramble must be used within a ScrambleProvider',
    )
  })

  it('automatically loads scramble on mount', async () => {
    const { result } = renderHook(() => useScramble(), {
      wrapper: ({ children }) => (
        <AuthProvider>
          <SettingsProvider>
            <ScrambleProvider>{children}</ScrambleProvider>
          </SettingsProvider>
        </AuthProvider>
      ),
    })

    await waitFor(() => {
      expect(result.current.scramble).toBe("R U R' U'")
      expect(result.current.scrambleState).toBe('ready')
    })
  })

  it('supports generating new scramble and setting custom scramble', async () => {
    const { result } = renderHook(() => useScramble(), {
      wrapper: ({ children }) => (
        <AuthProvider>
          <SettingsProvider>
            <ScrambleProvider>{children}</ScrambleProvider>
          </SettingsProvider>
        </AuthProvider>
      ),
    })

    await waitFor(() => expect(result.current.scrambleState).toBe('ready'))

    act(() => {
      result.current.customScramble("F R U R' U' F'")
    })

    expect(result.current.scramble).toBe("F R U R' U' F'")

    vi.mocked(generateScramble).mockResolvedValueOnce("M2 U M2 U2 M2 U M2")
    await act(async () => {
      await result.current.generateNewScramble()
    })

    expect(result.current.scramble).toBe("M2 U M2 U2 M2 U M2")
  })
})
