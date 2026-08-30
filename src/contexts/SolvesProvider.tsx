import {
  useCallback,
  useMemo,
  type ReactNode,
} from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getOrCreateSettings } from '../data/db'
import {
  deleteSessionCascade,
  listSessions,
  newSession,
  putSession,
} from '../data/repositories/sessions'
import {
  latestSolveInSession,
  listSolvesForSession,
  newSolve,
  putSolve,
  recentSolves,
  RECENT_SOLVES_LIMIT,
} from '../data/repositories/solves'
import {
  computeSolveStats,
  EMPTY_SOLVE_STATS,
} from '../data/repositories/solveStats'
import { nowIso, type CubeSession, type Penalty, type Solve } from '../domain/models'
import {
  findOpenAutomaticSession,
  shouldReuseAutomaticSession,
  uniqueAutomaticSessionName,
} from '../domain/sessions/automaticSessions'
import { useAuth } from './AuthContext'
import { useSettings } from './SettingsContext'
import { useSync } from './SyncContext'
import { SolvesContext, type SolvesContextValue } from './SolvesContext'

const EMPTY_SESSIONS: CubeSession[] = []
const EMPTY_SOLVES: Solve[] = []

export function SolvesProvider({ children }: { children: ReactNode }) {
  const { ownerId, enqueueWrites } = useAuth()
  const { settings, updateSettings } = useSettings()
  const { requestSync } = useSync()

  const sessionsQuery = useLiveQuery(
    async () => (ownerId ? listSessions(ownerId, settings.event) : EMPTY_SESSIONS),
    [ownerId, settings.event],
  )
  const sessions = sessionsQuery ?? EMPTY_SESSIONS

  const recentSolvesListQuery = useLiveQuery(
    async () =>
      ownerId
        ? recentSolves(ownerId, settings.event, RECENT_SOLVES_LIMIT)
        : EMPTY_SOLVES,
    [ownerId, settings.event],
  )
  const recentSolvesList = recentSolvesListQuery ?? EMPTY_SOLVES

  const solveStatsQuery = useLiveQuery(
    async () => (ownerId ? computeSolveStats(ownerId, settings.event) : EMPTY_SOLVE_STATS),
    [ownerId, settings.event],
  )
  const solveStats = solveStatsQuery ?? EMPTY_SOLVE_STATS

  const currentSession = useMemo(() => {
    const id = settings.currentSessionIds[settings.event]
    return sessions.find((session) => session.id === id) ?? null
  }, [sessions, settings])

  const saveSolve = useCallback(
    async (input: { durationMs: number; penalty: Penalty; scramble: string }) => {
      if (!ownerId) {
        throw new Error('App not ready')
      }
      const current = await getOrCreateSettings(ownerId)
      const now = Date.now()
      let sessionId = current.currentSessionIds[current.event] ?? null
      if (current.sessionMode === 'automatic') {
        const allSessions = await listSessions(ownerId, current.event)
        const open = findOpenAutomaticSession(allSessions, current.event)
        const last = open ? await latestSolveInSession(ownerId, open.id) : undefined
        const reuse = shouldReuseAutomaticSession({
          session: open,
          lastSolve: last,
          nowMs: now,
          gapMs: current.inactivityGapMinutes * 60_000,
          event: current.event,
        })
        if (reuse && open) {
          sessionId = open.id
        } else {
          if (open) {
            await putSession(
              { ...open, endedAt: nowIso(new Date(now)) },
              { enqueue: enqueueWrites, baseVersion: open.version },
            )
          }
          const created = newSession({
            ownerId,
            name: uniqueAutomaticSessionName(
              new Date(now),
              allSessions.map((session) => session.name),
            ),
            event: current.event,
            kind: 'automatic',
            startedAt: nowIso(new Date(now)),
          })
          await putSession(created, { enqueue: enqueueWrites, baseVersion: 0 })
          sessionId = created.id
          await updateSettings({
            currentSessionIds: { ...current.currentSessionIds, [current.event]: created.id },
          })
        }
      } else if (!sessionId) {
        const created = newSession({
          ownerId,
          name: 'Session 1',
          event: current.event,
          kind: 'manual',
        })
        await putSession(created, { enqueue: enqueueWrites, baseVersion: 0 })
        sessionId = created.id
        await updateSettings({
          currentSessionIds: { ...current.currentSessionIds, [current.event]: created.id },
        })
      }
      const solve = newSolve({
        ownerId,
        sessionId,
        durationMs: input.durationMs,
        penalty: input.penalty,
        scramble: input.scramble,
        event: current.event,
      })
      await putSolve(solve, { enqueue: enqueueWrites, baseVersion: 0 })
      if (enqueueWrites) {
        requestSync()
      }
      return solve
    },
    [enqueueWrites, ownerId, requestSync, updateSettings],
  )

  const updateSolvePenalty = useCallback(
    async (solveId: string, penalty: Penalty) => {
      const solve = await db.solves.get(solveId)
      if (!solve || solve.ownerId !== ownerId) {
        return
      }
      await putSolve({ ...solve, penalty }, { enqueue: enqueueWrites, baseVersion: solve.version })
      if (enqueueWrites) {
        requestSync()
      }
    },
    [enqueueWrites, ownerId, requestSync],
  )

  const removeSessionInternal = useCallback(
    async (session: CubeSession) => {
      const count = await deleteSessionCascade(session.id, { enqueue: enqueueWrites })
      if (!ownerId) {
        return count
      }
      const current = await getOrCreateSettings(ownerId)
      if (current.currentSessionIds[current.event] === session.id) {
        const next = { ...current.currentSessionIds }
        delete next[current.event]
        await updateSettings({ currentSessionIds: next })
      }
      if (enqueueWrites) {
        requestSync()
      }
      return count
    },
    [enqueueWrites, ownerId, requestSync, updateSettings],
  )

  const deleteSolve = useCallback(
    async (solveId: string) => {
      const solve = await db.solves.get(solveId)
      if (!solve || solve.ownerId !== ownerId) {
        return
      }
      await putSolve(
        { ...solve, deletedAt: nowIso() },
        { enqueue: enqueueWrites, baseVersion: solve.version },
      )
      if (enqueueWrites) {
        requestSync()
      }
      if (solve.sessionId) {
        const remaining = await listSolvesForSession(ownerId, solve.sessionId, 1)
        if (remaining.length === 0) {
          const session = await db.sessions.get(solve.sessionId)
          if (session && !session.deletedAt) {
            await removeSessionInternal(session)
          }
        }
      }
    },
    [enqueueWrites, ownerId, requestSync, removeSessionInternal],
  )

  const createSession = useCallback(
    async (name: string) => {
      if (!ownerId) {
        throw new Error('App not ready')
      }
      const current = await getOrCreateSettings(ownerId)
      const session = newSession({ ownerId, name, event: current.event, kind: 'manual' })
      await putSession(session, { enqueue: enqueueWrites, baseVersion: 0 })
      await updateSettings({
        currentSessionIds: { ...current.currentSessionIds, [current.event]: session.id },
      })
      if (enqueueWrites) {
        requestSync()
      }
      return session
    },
    [enqueueWrites, ownerId, requestSync, updateSettings],
  )

  const renameSession = useCallback(
    async (sessionId: string, name: string) => {
      const session = await db.sessions.get(sessionId)
      if (!session || session.ownerId !== ownerId) {
        return
      }
      await putSession({ ...session, name }, { enqueue: enqueueWrites, baseVersion: session.version })
      if (enqueueWrites) {
        requestSync()
      }
    },
    [enqueueWrites, ownerId, requestSync],
  )

  const switchSession = useCallback(
    async (sessionId: string) => {
      if (!ownerId) {
        return
      }
      const current = await getOrCreateSettings(ownerId)
      const session = await db.sessions.get(sessionId)
      if (
        !session ||
        session.ownerId !== ownerId ||
        session.event !== current.event ||
        session.deletedAt
      ) {
        return
      }
      await updateSettings({
        currentSessionIds: { ...current.currentSessionIds, [current.event]: sessionId },
      })
    },
    [ownerId, updateSettings],
  )

  const removeSession = useCallback(
    async (sessionId: string) => {
      const session = await db.sessions.get(sessionId)
      if (!session || session.ownerId !== ownerId) {
        return 0
      }
      return removeSessionInternal(session)
    },
    [ownerId, removeSessionInternal],
  )

  const value = useMemo<SolvesContextValue>(
    () => ({
      solves: recentSolvesList,
      recentSolves: recentSolvesList,
      sessions,
      activeSession: currentSession,
      currentSession,
      solveStats,
      addSolve: saveSolve,
      saveSolve,
      updateSolve: updateSolvePenalty,
      updateSolvePenalty,
      deleteSolve,
      createSession,
      renameSession,
      changeSession: switchSession,
      switchSession,
      deleteSession: removeSession,
      removeSession,
    }),
    [
      recentSolvesList,
      sessions,
      currentSession,
      solveStats,
      saveSolve,
      updateSolvePenalty,
      deleteSolve,
      createSession,
      renameSession,
      switchSession,
      removeSession,
    ],
  )

  return <SolvesContext.Provider value={value}>{children}</SolvesContext.Provider>
}
