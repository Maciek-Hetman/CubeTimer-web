/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../data/db'
import { AuthProvider } from './AuthProvider'
import { SettingsProvider } from './SettingsProvider'
import { SyncProvider } from './SyncProvider'
import { SolvesProvider } from './SolvesProvider'
import { useAuth } from './AuthContext'
import { useSolves } from './SolvesContext'

function useCombined() {
  const auth = useAuth()
  const solves = useSolves()
  return { auth, solves }
}

describe('SolvesContext & SolvesProvider', () => {
  beforeEach(async () => {
    await db.solves.clear()
    await db.sessions.clear()
    await db.outbox.clear()
    await db.settings.clear()
  })

  afterEach(() => {
    cleanup()
  })

  it('throws error when useSolves is used outside of SolvesProvider', () => {
    expect(() => renderHook(() => useSolves())).toThrow(
      'useSolves must be used within a SolvesProvider',
    )
  })

  it('handles saving solves, updating penalties, and deleting solves', async () => {
    const { result } = renderHook(() => useCombined(), {
      wrapper: ({ children }) => (
        <AuthProvider>
          <SettingsProvider>
            <SyncProvider>
              <SolvesProvider>{children}</SolvesProvider>
            </SyncProvider>
          </SettingsProvider>
        </AuthProvider>
      ),
    })

    await waitFor(() => {
      expect(result.current.auth.ready).toBe(true)
      expect(result.current.auth.ownerId).toBeTruthy()
      expect(result.current.solves.solves).toBeDefined()
    })

    let savedSolve: any
    await act(async () => {
      savedSolve = await result.current.solves.saveSolve({
        durationMs: 12500,
        penalty: 'none',
        scramble: "R U R' U'",
      })
    })

    expect(savedSolve).toBeDefined()
    expect(savedSolve.durationMs).toBe(12500)

    await waitFor(() => {
      expect(result.current.solves.recentSolves.length).toBe(1)
      expect(result.current.solves.solveStats.count).toBe(1)
    })

    await act(async () => {
      await result.current.solves.updateSolvePenalty(savedSolve.id, 'plus_two')
    })

    await waitFor(() => {
      expect(result.current.solves.recentSolves[0].penalty).toBe('plus_two')
    })

    await act(async () => {
      await result.current.solves.deleteSolve(savedSolve.id)
    })

    await waitFor(() => {
      expect(result.current.solves.recentSolves.length).toBe(0)
    })
  })

  it('handles session lifecycle: create, rename, switch, delete', async () => {
    const { result } = renderHook(() => useCombined(), {
      wrapper: ({ children }) => (
        <AuthProvider>
          <SettingsProvider>
            <SyncProvider>
              <SolvesProvider>{children}</SolvesProvider>
            </SyncProvider>
          </SettingsProvider>
        </AuthProvider>
      ),
    })

    await waitFor(() => {
      expect(result.current.auth.ready).toBe(true)
      expect(result.current.auth.ownerId).toBeTruthy()
      expect(result.current.solves.sessions).toBeDefined()
    })

    let session: any
    await act(async () => {
      session = await result.current.solves.createSession('OH Session')
    })

    expect(session.name).toBe('OH Session')

    await waitFor(() => {
      expect(result.current.solves.sessions.some((s) => s.id === session.id)).toBe(true)
    })

    await act(async () => {
      await result.current.solves.renameSession(session.id, 'One-Handed')
    })

    await waitFor(() => {
      expect(result.current.solves.sessions.find((s) => s.id === session.id)?.name).toBe('One-Handed')
    })

    await act(async () => {
      await result.current.solves.switchSession(session.id)
    })

    await waitFor(() => {
      expect(result.current.solves.currentSession?.id).toBe(session.id)
    })

    await act(async () => {
      await result.current.solves.removeSession(session.id)
    })

    await waitFor(() => {
      expect(result.current.solves.sessions.find((s) => s.id === session.id)).toBeUndefined()
    })
  })
})
