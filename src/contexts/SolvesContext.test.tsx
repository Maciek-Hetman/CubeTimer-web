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

async function setCurrentSession(
  result: { current: ReturnType<typeof useCombined> },
  currentId?: string,
) {
  const ownerId = result.current.auth.ownerId!
  const settings = await getOrCreateSettings(ownerId)
  await db.settings.put({
    ...settings,
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
    const { result } = renderSolves()

    await waitFor(() => {
      expect(result.current.auth.ready).toBe(true)
      expect(result.current.auth.ownerId).toBeTruthy()
      expect(result.current.solves.solves).toBeDefined()
    })

    let savedSolve: Awaited<ReturnType<typeof result.current.solves.saveSolve>>
    await act(async () => {
      savedSolve = await result.current.solves.saveSolve({
        durationMs: 12500,
        penalty: 'none',
        scramble: "R U R' U'",
      })
    })

    expect(savedSolve!).toBeDefined()
    expect(savedSolve!.durationMs).toBe(12500)
    expect(savedSolve!.sessionId).toBeTruthy()

    await waitFor(() => {
      expect(result.current.solves.recentSolves.length).toBe(1)
      expect(result.current.solves.solveStats.count).toBe(1)
    })

    await act(async () => {
      await result.current.solves.updateSolvePenalty(savedSolve!.id, 'plus_two')
    })

    await waitFor(() => {
      expect(result.current.solves.recentSolves[0].penalty).toBe('plus_two')
    })

    await act(async () => {
      await result.current.solves.deleteSolve(savedSolve!.id)
    })

    await waitFor(() => {
      expect(result.current.solves.recentSolves.length).toBe(0)
    })
  })

  it('handles session lifecycle: create via saveSolve, rename, delete', async () => {
    const { result } = renderSolves()

    await waitFor(() => {
      expect(result.current.auth.ready).toBe(true)
      expect(result.current.auth.ownerId).toBeTruthy()
      expect(result.current.solves.sessions).toBeDefined()
    })

    let savedSolve: Awaited<ReturnType<typeof result.current.solves.saveSolve>>
    await act(async () => {
      savedSolve = await result.current.solves.saveSolve({
        durationMs: 10000,
        penalty: 'none',
        scramble: 'R U',
      })
    })

    const sessionId = savedSolve!.sessionId!
    await waitFor(() => {
      expect(result.current.solves.sessions.some((s) => s.id === sessionId)).toBe(true)
      expect(result.current.solves.currentSession?.id).toBe(sessionId)
    })

    await act(async () => {
      await result.current.solves.renameSession(sessionId, 'One-Handed')
    })

    await waitFor(() => {
      expect(result.current.solves.sessions.find((s) => s.id === sessionId)?.name).toBe('One-Handed')
    })

    await act(async () => {
      await result.current.solves.removeSession(sessionId)
    })

    await waitFor(() => {
      expect(result.current.solves.sessions.find((s) => s.id === sessionId)).toBeUndefined()
    })
  })

  describe('saveSolve automatic sessions', () => {
    async function ready() {
      const rendered = renderSolves()
      await waitFor(() => {
        expect(rendered.result.current.auth.ready).toBe(true)
        expect(rendered.result.current.auth.ownerId).toBeTruthy()
      })
      return rendered
    }

    async function save(result: { current: ReturnType<typeof useCombined> }) {
      let solve: Awaited<ReturnType<typeof result.current.solves.saveSolve>>
      await act(async () => {
        solve = await result.current.solves.saveSolve({
          durationMs: 10000,
          penalty: 'none',
          scramble: 'R U',
        })
      })
      return solve!
    }

    it('reuses an open automatic session within the inactivity gap', async () => {
      const { result } = await ready()
      const ownerId = result.current.auth.ownerId!
      const { event } = await setCurrentSession(result)
      const session = newSession({
        ownerId,
        name: '22 aug 2026 evening',
        event,
        kind: 'automatic',
        startedAt: new Date().toISOString(),
      })
      await putSession(session, { enqueue: false })
      await setCurrentSession(result, session.id)

      const solve = await save(result)

      expect(solve.sessionId).toBe(session.id)
      const settings = await getOrCreateSettings(ownerId)
      expect(settings.currentSessionIds[event]).toBe(session.id)
      expect(await db.sessions.count()).toBe(1)
    })

    it('does not attach solves to a session tombstoned via sync', async () => {
      const { result } = await ready()
      const ownerId = result.current.auth.ownerId!
      const { event } = await setCurrentSession(result)
      const deleted = {
        ...newSession({
          ownerId,
          name: '22 aug 2026 evening',
          event,
          kind: 'automatic',
          startedAt: new Date().toISOString(),
        }),
        deletedAt: new Date().toISOString(),
      }
      await putSession(deleted, { enqueue: false })
      await setCurrentSession(result, deleted.id)

      const solve = await save(result)

      expect(solve.sessionId).not.toBe(deleted.id)
      const target = await db.sessions.get(solve.sessionId!)
      expect(target?.deletedAt).toBeNull()
      expect(target?.event).toBe(event)
      expect(target?.kind).toBe('automatic')
      const settings = await getOrCreateSettings(ownerId)
      expect(settings.currentSessionIds[event]).toBe(solve.sessionId)
      await waitFor(() => {
        expect(result.current.solves.currentSession?.id).toBe(solve.sessionId)
      })
    })

    it('creates a new automatic session when no open automatic session exists', async () => {
      const { result } = await ready()
      const ownerId = result.current.auth.ownerId!
      const { event } = await setCurrentSession(result)
      await putSession(newSession({ ownerId, name: 'Legacy Manual', event, kind: 'manual' }), {
        enqueue: false,
      })
      await setCurrentSession(result, 'missing-session-id')

      const solve = await save(result)

      const target = await db.sessions.get(solve.sessionId!)
      expect(target).toBeDefined()
      expect(target?.deletedAt).toBeNull()
      expect(target?.kind).toBe('automatic')
      const settings = await getOrCreateSettings(ownerId)
      expect(settings.currentSessionIds[event]).toBe(solve.sessionId)
    })

    it('clears a current id once its session is tombstoned', async () => {
      const { result } = await ready()
      const ownerId = result.current.auth.ownerId!
      const { event } = await setCurrentSession(result)
      const session = newSession({
        ownerId,
        name: 'Main',
        event,
        kind: 'automatic',
        startedAt: new Date().toISOString(),
      })
      await putSession(session, { enqueue: false })
      await setCurrentSession(result, session.id)
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
