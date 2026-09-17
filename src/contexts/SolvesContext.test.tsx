/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db, getOrCreateSettings } from '../data/db'
import { newSession, putSession } from '../data/repositories/sessions'
import { AuthProvider } from './AuthProvider'
import { SettingsProvider } from './SettingsProvider'
import { SyncProvider } from './SyncProvider'
import { SolvesProvider } from './SolvesProvider'
import { useAuth } from './AuthContext'
import { useSolves } from './SolvesContext'

function renderSolves() {
  return renderHook(() => useCombined(), {
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
}

async function setupManualMode(result: { current: ReturnType<typeof useCombined> }, currentId?: string) {
  const ownerId = result.current.auth.ownerId!
  const settings = await getOrCreateSettings(ownerId)
  await db.settings.put({
    ...settings,
    sessionMode: 'manual',
    currentSessionIds: currentId ? { [settings.event]: currentId } : {},
  })
  return { ownerId, event: settings.event }
}

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
  describe('saveSolve in manual mode', () => {
    async function ready() {
      const rendered = renderSolves()
      await waitFor(() => {
        expect(rendered.result.current.auth.ready).toBe(true)
        expect(rendered.result.current.auth.ownerId).toBeTruthy()
      })
      return rendered
    }

    async function save(result: { current: ReturnType<typeof useCombined> }) {
      let solve: any
      await act(async () => {
        solve = await result.current.solves.saveSolve({
          durationMs: 10000,
          penalty: 'none',
          scramble: 'R U',
        })
      })
      return solve
    }

    it('keeps using a valid current session', async () => {
      const { result } = await ready()
      const ownerId = result.current.auth.ownerId!
      const { event } = await setupManualMode(result)
      const session = newSession({ ownerId, name: 'Main', event, kind: 'manual' })
      await putSession(session, { enqueue: false })
      await setupManualMode(result, session.id)

      const solve = await save(result)

      expect(solve.sessionId).toBe(session.id)
      const settings = await getOrCreateSettings(ownerId)
      expect(settings.currentSessionIds[event]).toBe(session.id)
      expect(await db.sessions.count()).toBe(1)
    })

    it('does not attach solves to a session tombstoned via sync', async () => {
      const { result } = await ready()
      const ownerId = result.current.auth.ownerId!
      const { event } = await setupManualMode(result)
      const deleted = {
        ...newSession({ ownerId, name: 'Session 1', event, kind: 'manual' }),
        deletedAt: new Date().toISOString(),
      }
      const other = newSession({ ownerId, name: 'Session 2', event, kind: 'manual' })
      await putSession(deleted, { enqueue: false })
      await putSession(other, { enqueue: false })
      await setupManualMode(result, deleted.id)

      const solve = await save(result)

      expect(solve.sessionId).not.toBe(deleted.id)
      const target = await db.sessions.get(solve.sessionId)
      expect(target?.deletedAt).toBeNull()
      expect(target?.event).toBe(event)
      expect(target?.name).toBe('Session 1')
      const settings = await getOrCreateSettings(ownerId)
      expect(settings.currentSessionIds[event]).toBe(solve.sessionId)
      await waitFor(() => {
        expect(result.current.solves.currentSession?.id).toBe(solve.sessionId)
      })
    })

    it('creates a uniquely named session when the current id does not exist', async () => {
      const { result } = await ready()
      const ownerId = result.current.auth.ownerId!
      const { event } = await setupManualMode(result)
      await putSession(newSession({ ownerId, name: 'Session 1', event, kind: 'manual' }), {
        enqueue: false,
      })
      await setupManualMode(result, 'missing-session-id')

      const solve = await save(result)

      const target = await db.sessions.get(solve.sessionId)
      expect(target).toBeDefined()
      expect(target?.deletedAt).toBeNull()
      expect(target?.name).toBe('Session 2')
      const settings = await getOrCreateSettings(ownerId)
      expect(settings.currentSessionIds[event]).toBe(solve.sessionId)
    })

    it('clears a current id once its session is tombstoned', async () => {
      const { result } = await ready()
      const ownerId = result.current.auth.ownerId!
      const { event } = await setupManualMode(result)
      const session = newSession({ ownerId, name: 'Main', event, kind: 'manual' })
      await putSession(session, { enqueue: false })
      await setupManualMode(result, session.id)
      await waitFor(() => {
        expect(result.current.solves.currentSession?.id).toBe(session.id)
      })

      await act(async () => {
        await db.sessions.put({ ...session, deletedAt: new Date().toISOString() })
      })

      await waitFor(async () => {
        const settings = await getOrCreateSettings(ownerId)
        expect(settings.currentSessionIds[event]).toBeUndefined()
      })
      expect(result.current.solves.currentSession).toBeNull()
    })
  })
})
