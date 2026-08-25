import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import * as authApi from '../api/auth'
import { apiRequest, type AuthenticatedRequest, type RequestOptions } from '../api/client'
import { ApiError, type AuthSession, type User } from '../api/types'
import { db, getOrCreateSettings } from '../data/db'
import {
  deleteSessionCascade,
  listSessions,
  newSession,
  putSession,
} from '../data/repositories/sessions'
import { listSolves, newSolve, putSolve } from '../data/repositories/solves'
import { DEFAULT_SETTINGS, nowIso, type AppSettings, type CubeEvent, type CubeSession, type Penalty, type Solve } from '../domain/models'
import {
  automaticSessionName,
  findOpenAutomaticSession,
  latestSolveInSession,
  shouldReuseAutomaticSession,
} from '../domain/sessions/automaticSessions'
import { adoptGuestData } from '../sync/guestMerge'
import { runSync, withBackoff, type SyncStatus } from '../sync/syncEngine'
import {
  clearAuth,
  createFreshGuestOwner,
  ensureGuestOwner,
  getCurrentOwnerId,
  getDeviceId,
  getDeviceName,
  getStoredRefreshToken,
  getStoredUser,
  isGuestOwner,
  saveAuth,
  setCurrentOwnerId,
} from './profile'

export interface AppContextValue {
  ready: boolean
  ownerId: string
  user: User | null
  settings: AppSettings
  syncStatus: SyncStatus
  pendingMutations: number
  sessions: CubeSession[]
  solves: Solve[]
  currentSession: CubeSession | null
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>
  setEvent: (event: CubeEvent) => Promise<void>
  saveSolve: (input: { durationMs: number; penalty: Penalty; scramble: string }) => Promise<Solve>
  updateSolvePenalty: (solveId: string, penalty: Penalty) => Promise<void>
  deleteSolve: (solveId: string) => Promise<void>
  createSession: (name: string) => Promise<CubeSession>
  renameSession: (sessionId: string, name: string) => Promise<void>
  switchSession: (sessionId: string) => Promise<void>
  removeSession: (sessionId: string) => Promise<number>
  isAdmin: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  applyAuthSession: (session: AuthSession, options?: { mergeGuest?: boolean }) => Promise<void>
  authenticatedRequest: AuthenticatedRequest
  requestSync: () => void
  resolveConflictKeepServer: (conflictId: string) => Promise<void>
  resolveConflictKeepLocal: (conflictId: string) => Promise<void>
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProviders({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [ownerId, setOwnerId] = useState('')
  const [user, setUser] = useState<User | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')
  const accessTokenRef = useRef<string | null>(null)
  const refreshTokenRef = useRef<string | null>(null)
  const syncTimer = useRef<number | null>(null)
  const syncingRef = useRef(false)

  useEffect(() => {
    accessTokenRef.current = accessToken
  }, [accessToken])

  const persistSession = useCallback(async (session: AuthSession, mergeGuest: boolean) => {
    refreshTokenRef.current = session.refresh_token
    await saveAuth(session.refresh_token, session.user)
    setAccessToken(session.access_token)
    setUser(session.user)
    accessTokenRef.current = session.access_token
    if (mergeGuest) {
      const guest = await ensureGuestOwner()
      if (guest !== session.user.id) {
        await adoptGuestData(guest, session.user.id)
      }
    }
    await setCurrentOwnerId(session.user.id)
    await getOrCreateSettings(session.user.id)
    setOwnerId(session.user.id)
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      await ensureGuestOwner()
      const owner = await getCurrentOwnerId()
      await getOrCreateSettings(owner)
      const refreshToken = await getStoredRefreshToken()
      const storedUser = await getStoredUser<User>()
      if (!cancelled) {
        setOwnerId(owner)
        if (storedUser) {
          setUser(storedUser)
        }
      }
      if (refreshToken) {
        refreshTokenRef.current = refreshToken
        try {
          const session = await authApi.refresh(refreshToken)
          if (!cancelled) {
            await persistSession(session, false)
          }
        } catch {
          await clearAuth()
          refreshTokenRef.current = null
        }
      }
      if (!cancelled) {
        setReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [persistSession])

  const settingsQuery = useLiveQuery(async () => (ownerId ? db.settings.get(ownerId) : undefined), [ownerId])
  const settings = settingsQuery ? { ...DEFAULT_SETTINGS, ...settingsQuery } : { ownerId, ...DEFAULT_SETTINGS }

  const sessions =
    useLiveQuery(
      async () => (ownerId ? listSessions(ownerId, settingsQuery?.event) : []),
      [ownerId, settingsQuery?.event],
    ) ?? []

  const solves =
    useLiveQuery(
      async () => (ownerId ? listSolves(ownerId, settingsQuery?.event) : []),
      [ownerId, settingsQuery?.event],
    ) ?? []

  const pendingMutations =
    useLiveQuery(async () => (ownerId ? db.outbox.where('ownerId').equals(ownerId).count() : 0), [ownerId]) ?? 0

  const conflictCount =
    useLiveQuery(async () => (ownerId ? db.conflicts.where('ownerId').equals(ownerId).count() : 0), [ownerId]) ?? 0

  const currentSession = useMemo(() => {
    const id = settings.currentSessionIds[settings.event]
    return sessions.find((session) => session.id === id) ?? null
  }, [sessions, settings])

  const enqueueWrites = Boolean(user && ownerId && !isGuestOwner(ownerId))

  const refreshAccessToken = useCallback(async () => {
    const token = refreshTokenRef.current ?? (await getStoredRefreshToken())
    if (!token) {
      throw new ApiError(401, 'unauthenticated', 'Not signed in')
    }
    try {
      const session = await authApi.refresh(token)
      refreshTokenRef.current = session.refresh_token
      await saveAuth(session.refresh_token, session.user)
      setAccessToken(session.access_token)
      setUser(session.user)
      accessTokenRef.current = session.access_token
      return session.access_token
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 409)) {
        await clearAuth()
        refreshTokenRef.current = null
        setAccessToken(null)
        setUser(null)
      }
      throw error
    }
  }, [])

  const authenticatedRequest = useCallback(
    async <T,>(path: string, options: Omit<RequestOptions, 'accessToken'> = {}): Promise<T> => {
      const run = (token: string) => apiRequest<T>(path, { ...options, accessToken: token })
      let token = accessTokenRef.current
      if (!token) {
        token = await refreshAccessToken()
      }
      try {
        return await run(token)
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          const next = await refreshAccessToken()
          return run(next)
        }
        throw error
      }
    },
    [refreshAccessToken],
  )

  const doSync = useCallback(async () => {
    if (!ownerId || isGuestOwner(ownerId) || syncingRef.current) {
      return
    }
    let token = accessTokenRef.current
    if (!token) {
      try {
        token = await refreshAccessToken()
      } catch {
        setSyncStatus('error')
        return
      }
    }
    syncingRef.current = true
    setSyncStatus('syncing')
    try {
      const deviceId = await getDeviceId()
      const deviceName = await getDeviceName()
      const result = await withBackoff(
        () =>
          runSync({
            ownerId,
            accessToken: token!,
            device: { id: deviceId, name: deviceName, platform: 'web' },
            getAccessToken: refreshAccessToken,
          }),
        0,
      )
      setSyncStatus(result.conflicts > 0 || conflictCount > 0 ? 'conflict' : result.status)
    } catch {
      setSyncStatus(navigator.onLine ? 'error' : 'offline')
    } finally {
      syncingRef.current = false
    }
  }, [conflictCount, ownerId, refreshAccessToken])

  const requestSync = useCallback(() => {
    if (syncTimer.current) {
      window.clearTimeout(syncTimer.current)
    }
    syncTimer.current = window.setTimeout(() => {
      void doSync()
    }, 400)
  }, [doSync])

  useEffect(() => {
    if (!ready || !user || isGuestOwner(ownerId)) {
      return
    }
    requestSync()
    const onOnline = () => requestSync()
    const onFocus = () => requestSync()
    window.addEventListener('online', onOnline)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    const interval = window.setInterval(() => requestSync(), 60_000)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
      window.clearInterval(interval)
    }
  }, [ownerId, ready, requestSync, user])

  useEffect(() => {
    const root = document.documentElement
    if (settings.theme === 'system') {
      root.removeAttribute('data-theme')
    } else {
      root.setAttribute('data-theme', settings.theme)
    }
    const applyThemeColor = () => {
      const bg = getComputedStyle(root).getPropertyValue('--bg').trim() || '#1d4ed8'
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg)
    }
    applyThemeColor()
    const media = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null
    media?.addEventListener('change', applyThemeColor)
    return () => media?.removeEventListener('change', applyThemeColor)
  }, [settings.theme])

  const updateSettings = useCallback(
    async (patch: Partial<AppSettings>) => {
      if (!ownerId) {
        return
      }
      const current = (await db.settings.get(ownerId)) ?? { ownerId, ...DEFAULT_SETTINGS }
      await db.settings.put({ ...current, ...patch, ownerId })
    },
    [ownerId],
  )

  const setEvent = useCallback(
    async (event: CubeEvent) => {
      await updateSettings({ event })
    },
    [updateSettings],
  )

  const saveSolve = useCallback(
    async (input: { durationMs: number; penalty: Penalty; scramble: string }) => {
      if (!ownerId) {
        throw new Error('App not ready')
      }
      const current = (await db.settings.get(ownerId)) ?? { ownerId, ...DEFAULT_SETTINGS }
      const now = Date.now()
      let sessionId = current.currentSessionIds[current.event] ?? null
      if (current.sessionMode === 'automatic') {
        const allSessions = await listSessions(ownerId, current.event)
        const allSolves = await listSolves(ownerId, current.event)
        const open = findOpenAutomaticSession(allSessions, current.event)
        const last = open ? latestSolveInSession(allSolves, open.id) : undefined
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
            name: automaticSessionName(new Date(now)),
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
      if (!solve) {
        return
      }
      await putSolve({ ...solve, penalty }, { enqueue: enqueueWrites, baseVersion: solve.version })
      if (enqueueWrites) {
        requestSync()
      }
    },
    [enqueueWrites, requestSync],
  )

  const deleteSolve = useCallback(
    async (solveId: string) => {
      const solve = await db.solves.get(solveId)
      if (!solve) {
        return
      }
      await putSolve({ ...solve, deletedAt: nowIso() }, { enqueue: enqueueWrites, baseVersion: solve.version })
      if (enqueueWrites) {
        requestSync()
      }
    },
    [enqueueWrites, requestSync],
  )

  const createSession = useCallback(
    async (name: string) => {
      if (!ownerId) {
        throw new Error('App not ready')
      }
      const current = (await db.settings.get(ownerId)) ?? { ownerId, ...DEFAULT_SETTINGS }
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
      if (!session) {
        return
      }
      await putSession({ ...session, name }, { enqueue: enqueueWrites, baseVersion: session.version })
      if (enqueueWrites) {
        requestSync()
      }
    },
    [enqueueWrites, requestSync],
  )

  const switchSession = useCallback(
    async (sessionId: string) => {
      if (!ownerId) {
        return
      }
      const current = (await db.settings.get(ownerId)) ?? { ownerId, ...DEFAULT_SETTINGS }
      await updateSettings({
        currentSessionIds: { ...current.currentSessionIds, [current.event]: sessionId },
      })
    },
    [ownerId, updateSettings],
  )

  const removeSession = useCallback(
    async (sessionId: string) => {
      const count = await deleteSessionCascade(sessionId, { enqueue: enqueueWrites })
      if (!ownerId) {
        return count
      }
      const current = (await db.settings.get(ownerId)) ?? { ownerId, ...DEFAULT_SETTINGS }
      if (current.currentSessionIds[current.event] === sessionId) {
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

  const applyAuthSession = useCallback(
    async (session: AuthSession, options?: { mergeGuest?: boolean }) => {
      await persistSession(session, options?.mergeGuest ?? true)
      requestSync()
    },
    [persistSession, requestSync],
  )

  const loginFn = useCallback(
    async (email: string, password: string) => {
      const session = await authApi.login(email, password)
      await applyAuthSession(session, { mergeGuest: true })
    },
    [applyAuthSession],
  )

  const registerFn = useCallback(async (email: string, password: string) => {
    await authApi.register(email, password)
  }, [])

  const logoutFn = useCallback(async () => {
    if (ownerId) {
      const current = await db.settings.get(ownerId)
      if (current?.sessionMode === 'automatic') {
        const openSessions = (await listSessions(ownerId)).filter(
          (session) => session.kind === 'automatic' && !session.endedAt && !session.deletedAt,
        )
        for (const session of openSessions) {
          await putSession(
            { ...session, endedAt: nowIso() },
            { enqueue: enqueueWrites, baseVersion: session.version },
          )
        }
        if (enqueueWrites) {
          await doSync()
        }
      }
    }
    const token = refreshTokenRef.current
    if (token) {
      try {
        await authApi.logout(token)
      } catch {
        // ignore
      }
    }
    await clearAuth()
    refreshTokenRef.current = null
    setAccessToken(null)
    setUser(null)
    const guest = await createFreshGuestOwner()
    await getOrCreateSettings(guest)
    setOwnerId(guest)
    setSyncStatus('idle')
  }, [doSync, enqueueWrites, ownerId])

  const resolveConflictKeepServer = useCallback(async (conflictId: string) => {
    await db.conflicts.delete(conflictId)
  }, [])

  const resolveConflictKeepLocal = useCallback(
    async (conflictId: string) => {
      const conflict = await db.conflicts.get(conflictId)
      if (!conflict) {
        return
      }
      if (conflict.entity === 'session') {
        const session = conflict.local as CubeSession
        await putSession(
          { ...session, version: conflict.current.version },
          { enqueue: true, baseVersion: conflict.current.version },
        )
      } else {
        const solve = conflict.local as Solve
        await putSolve(
          { ...solve, version: conflict.current.version },
          { enqueue: true, baseVersion: conflict.current.version },
        )
      }
      await db.conflicts.delete(conflictId)
      requestSync()
    },
    [requestSync],
  )

  const value = useMemo<AppContextValue>(
    () => ({
      ready,
      ownerId,
      user,
      settings,
      syncStatus: pendingMutations > 0 && syncStatus === 'idle' ? 'pending' : syncStatus,
      pendingMutations,
      sessions,
      solves,
      currentSession,
      isAdmin: user?.user_role === 'admin',
      updateSettings,
      setEvent,
      saveSolve,
      updateSolvePenalty,
      deleteSolve,
      createSession,
      renameSession,
      switchSession,
      removeSession,
      login: loginFn,
      register: registerFn,
      logout: logoutFn,
      applyAuthSession,
      authenticatedRequest,
      requestSync,
      resolveConflictKeepServer,
      resolveConflictKeepLocal,
    }),
    [
      applyAuthSession,
      authenticatedRequest,
      createSession,
      currentSession,
      deleteSolve,
      loginFn,
      logoutFn,
      ownerId,
      pendingMutations,
      ready,
      registerFn,
      removeSession,
      renameSession,
      requestSync,
      resolveConflictKeepLocal,
      resolveConflictKeepServer,
      saveSolve,
      sessions,
      setEvent,
      settings,
      solves,
      switchSession,
      syncStatus,
      updateSettings,
      updateSolvePenalty,
      user,
    ],
  )

  if (!ready || !ownerId) {
    return (
      <div className="boot-screen" role="status" aria-live="polite">
        <span className="app-logo" aria-hidden="true" />
        <strong>CubeTimer</strong>
        <p className="muted">Loading your times…</p>
      </div>
    )
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) {
    throw new Error('useApp must be used within AppProviders')
  }
  return ctx
}
