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
import type { Table } from 'dexie'
import * as authApi from '../api/auth'
import { apiRequest, type AuthenticatedRequest, type RequestOptions } from '../api/client'
import { ApiError, type AuthSession, type User } from '../api/types'
import { db, getOrCreateSettings, getMeta, setMeta } from '../data/db'
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
  type SolveStats,
} from '../data/repositories/solveStats'
import { DEFAULT_SETTINGS, nowIso, type AppSettings, type CubeEvent, type CubeSession, type Penalty, type Solve } from '../domain/models'
import {
  findOpenAutomaticSession,
  shouldReuseAutomaticSession,
  uniqueAutomaticSessionName,
} from '../domain/sessions/automaticSessions'
import { adoptGuestData } from '../sync/guestMerge'
import { runSync, getLastSyncedAt, lastSyncKey, withBackoff, type SyncStatus } from '../sync/syncEngine'
import { isTokenExpired, shouldSkipSync } from '../sync/syncPolicy'
import {
  clearAuth,
  createFreshGuestOwner,
  ensureGuestOwner,
  getCurrentOwnerId,
  getDeviceId,
  getDeviceName,
  getStoredDeviceId,
  getStoredDeviceName,
  getStoredRefreshToken,
  getStoredUser,
  isGuestOwner,
  saveAuth,
  setCurrentOwnerId,
} from './profile'
import { getAccentPalette } from '../styles/accents'

export interface AppContextValue {
  ready: boolean
  ownerId: string
  user: User | null
  settings: AppSettings
  syncStatus: SyncStatus
  pendingMutations: number
  sessions: CubeSession[]
  recentSolves: Solve[]
  solveStats: SolveStats
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
  deleteAccount: () => Promise<void>
  applyAuthSession: (session: AuthSession, options?: { mergeGuest?: boolean }) => Promise<void>
  authenticatedRequest: AuthenticatedRequest
  requestSync: () => void
  resolveConflictKeepServer: (conflictId: string) => Promise<void>
  resolveConflictKeepLocal: (conflictId: string) => Promise<void>
  conflicts: number
  rejectedCount: number
  dismissAllRejected: () => Promise<void>
  lastSyncedAt: string | null
  deviceName: string | null
  deviceId: string | null
  scramble: string
  scrambleState: 'loading' | 'ready' | 'error'
  loadScramble: () => Promise<void>
  customBackground: string | null
  setCustomBackground: (bg: string | null) => Promise<void>
}

const AppContext = createContext<AppContextValue | null>(null)

let mountRefreshPromise: Promise<AuthSession> | null = null
const EMPTY_SESSIONS: CubeSession[] = []
const EMPTY_SOLVES: Solve[] = []
const SYNC_MIN_INTERVAL_MS = 30_000

export function AppProviders({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [ownerId, setOwnerId] = useState('')
  const [user, setUser] = useState<User | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')
  const accessTokenRef = useRef<string | null>(null)
  const accessTokenExpiresAtRef = useRef<number>(0)
  const userRef = useRef<User | null>(null)
  const refreshTokenRef = useRef<string | null>(null)
  const syncTimer = useRef<number | null>(null)
  const syncingRef = useRef(false)

  useEffect(() => {
    accessTokenRef.current = accessToken
  }, [accessToken])

  useEffect(() => {
    userRef.current = user
  }, [user])

  const persistSession = useCallback(async (session: AuthSession, mergeGuest: boolean) => {
    refreshTokenRef.current = session.refresh_token
    await saveAuth(session.refresh_token, session.user)
    setAccessToken(session.access_token)
    setUser(session.user)
    accessTokenRef.current = session.access_token
    accessTokenExpiresAtRef.current = Date.now() + session.expires_in * 1000
    userRef.current = session.user
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

  const transitionToGuest = useCallback(async () => {
    if (syncTimer.current) {
      window.clearTimeout(syncTimer.current)
      syncTimer.current = null
    }
    await clearAuth()
    refreshTokenRef.current = null
    setAccessToken(null)
    setUser(null)
    accessTokenRef.current = null
    accessTokenExpiresAtRef.current = 0
    userRef.current = null
    let guest = await getCurrentOwnerId()
    if (!isGuestOwner(guest)) {
      guest = await createFreshGuestOwner()
    }
    await getOrCreateSettings(guest)
    setOwnerId(guest)
    setSyncStatus('idle')
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      await ensureGuestOwner()
      let owner = await getCurrentOwnerId()
      const refreshToken = await getStoredRefreshToken()
      if (!refreshToken && !isGuestOwner(owner)) {
        owner = await createFreshGuestOwner()
      }
      await getOrCreateSettings(owner)
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
          if (!mountRefreshPromise) {
            mountRefreshPromise = authApi.refresh(refreshToken)
          }
          const refreshPromise = mountRefreshPromise
          const session = await refreshPromise
          if (mountRefreshPromise === refreshPromise) {
            mountRefreshPromise = null
          }
          if (!cancelled) {
            await persistSession(session, false)
          } else {
            // Still persist the new tokens to IDB so they aren't lost if the second mount reads from IDB.
            void persistSession(session, false)
          }
        } catch {
          mountRefreshPromise = null
          await transitionToGuest()
        }
      }
      if (!cancelled) {
        setReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [persistSession, transitionToGuest])

  const settingsQuery = useLiveQuery(async () => (ownerId ? db.settings.get(ownerId) : undefined), [ownerId])
  const settings = useMemo(
    () => (settingsQuery ? { ...DEFAULT_SETTINGS, ...settingsQuery } : { ownerId, ...DEFAULT_SETTINGS }),
    [ownerId, settingsQuery],
  )

  const customBackground = useLiveQuery(
    async () => (ownerId ? getMeta<string | null>(`custom_bg_${ownerId}`, null) : null),
    [ownerId]
  ) ?? null

  const setCustomBackground = useCallback(async (bg: string | null) => {
    if (!ownerId) return
    await setMeta(`custom_bg_${ownerId}`, bg)
  }, [ownerId])

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

  const pendingMutations =
    useLiveQuery(async () => (ownerId ? db.outbox.where('ownerId').equals(ownerId).count() : 0), [ownerId]) ?? 0

  const conflictCount =
    useLiveQuery(async () => (ownerId ? db.conflicts.where('ownerId').equals(ownerId).count() : 0), [ownerId]) ?? 0

  const rejectedCount =
    useLiveQuery(async () => (ownerId ? db.rejections.where('ownerId').equals(ownerId).count() : 0), [ownerId]) ?? 0

  const deviceId =
    useLiveQuery(async () => (ownerId ? getStoredDeviceId() : null), [ownerId]) ?? null
  const deviceName =
    useLiveQuery(async () => (ownerId ? getStoredDeviceName() : null), [ownerId]) ?? null
  const lastSyncedAt =
    useLiveQuery(async () => (ownerId ? getLastSyncedAt(ownerId) : null), [ownerId]) ?? null

  const currentSession = useMemo(() => {
    const id = settings.currentSessionIds[settings.event]
    return sessions.find((session) => session.id === id) ?? null
  }, [sessions, settings])

  const enqueueWrites = Boolean(user?.email_verified && ownerId && !isGuestOwner(ownerId))

  const [scramble, setScramble] = useState('')
  const [scrambleState, setScrambleState] = useState<'loading' | 'ready' | 'error'>('loading')
  const scrambleRequest = useRef(0)
  const scrambleEventRef = useRef<CubeEvent | null>(null)

  const loadScramble = useCallback(async () => {
    const event = settings.event
    const id = ++scrambleRequest.current
    setScrambleState('loading')
    try {
      const { generateScramble } = await import('../features/scramble/scrambleService')
      const value = await generateScramble(event)
      if (id === scrambleRequest.current) {
        setScramble(value)
        setScrambleState('ready')
        scrambleEventRef.current = event
      }
    } catch {
      if (id === scrambleRequest.current) {
        setScramble('')
        setScrambleState('error')
      }
    }
  }, [settings.event])

  useEffect(() => {
    if (ready && scrambleEventRef.current !== settings.event) {
      void loadScramble()
    }
  }, [ready, settings.event, loadScramble])

  const refreshPromiseRef = useRef<Promise<string> | null>(null)

  const refreshAccessToken = useCallback(async () => {
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current
    }
    const promise = (async () => {
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
        accessTokenExpiresAtRef.current = Date.now() + session.expires_in * 1000
        userRef.current = session.user
        return session.access_token
      } catch (error) {
        if (error instanceof ApiError && (error.status === 401 || error.status === 409)) {
          await transitionToGuest()
        }
        throw error
      } finally {
        refreshPromiseRef.current = null
      }
    })()
    refreshPromiseRef.current = promise
    return promise
  }, [transitionToGuest])

  const authenticatedRequest = useCallback(
    async <T,>(path: string, options: Omit<RequestOptions, 'accessToken'> = {}): Promise<T> => {
      const run = (token: string) => apiRequest<T>(path, { ...options, accessToken: token })
      let token = accessTokenRef.current
      if (!token || isTokenExpired(accessTokenExpiresAtRef.current)) {
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
    const currentUser = userRef.current
    if (!currentUser?.email_verified || !ownerId || isGuestOwner(ownerId) || syncingRef.current) {
      return
    }
    const [pendingCount, lastSyncedAt] = await Promise.all([
      db.outbox.where('ownerId').equals(ownerId).count(),
      getLastSyncedAt(ownerId),
    ])
    if (
      shouldSkipSync({
        pendingMutations: pendingCount,
        lastSyncedAt,
        nowMs: Date.now(),
        minIntervalMs: SYNC_MIN_INTERVAL_MS,
      })
    ) {
      return
    }
    let token = accessTokenRef.current
    if (!token || isTokenExpired(accessTokenExpiresAtRef.current)) {
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
      syncTimer.current = null
      void doSync()
    }, 400)
  }, [doSync])

  useEffect(() => {
    if (!ready || !user?.email_verified || isGuestOwner(ownerId)) {
      return
    }
    requestSync()
    const onOnline = () => requestSync()
    const onFocus = () => requestSync()
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        requestSync()
      }
    }
    window.addEventListener('online', onOnline)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [ownerId, ready, requestSync, user])

  useEffect(() => {
    return () => {
      if (syncTimer.current) {
        window.clearTimeout(syncTimer.current)
        syncTimer.current = null
      }
    }
  }, [])

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
      
      const isDark =
        settings.theme === 'dark' ||
        (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
      
      const palette = getAccentPalette(settings.accentColor || 'blue')
      const colors = isDark ? palette.dark : palette.light
      
      root.style.setProperty('--accent', colors.main)
      root.style.setProperty('--accent-soft', colors.soft)
      
      const opacity = settings.uiTransparency ?? 100
      root.style.setProperty('--ui-opacity', `${opacity}%`)
      
      if (opacity < 100) {
        root.setAttribute('data-transparent-ui', 'true')
      } else {
        root.removeAttribute('data-transparent-ui')
      }
    }
    
    applyThemeColor()
    const media = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null
    media?.addEventListener('change', applyThemeColor)
    return () => media?.removeEventListener('change', applyThemeColor)
  }, [settings.theme, settings.accentColor, settings.uiTransparency])

  const updateSettings = useCallback(
    async (patch: Partial<AppSettings>) => {
      if (!ownerId) {
        return
      }
      await db.transaction('rw', db.settings, async () => {
        const current = await getOrCreateSettings(ownerId)
        await db.settings.put({ ...current, ...patch, ownerId })
      })
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
      await putSolve({ ...solve, deletedAt: nowIso() }, { enqueue: enqueueWrites, baseVersion: solve.version })
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
      if (!session || session.ownerId !== ownerId || session.event !== current.event || session.deletedAt) {
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
    await transitionToGuest()
  }, [doSync, enqueueWrites, ownerId, transitionToGuest])

  const deleteAccountFn = useCallback(async () => {
    await authApi.deleteAccount(authenticatedRequest)
    await db.transaction(
      'rw',
      [db.solves, db.sessions, db.outbox, db.settings, db.conflicts, db.rejections, db.widgetLayouts, db.meta] as Table[],
      async () => {
        await db.solves.where('ownerId').equals(ownerId).delete()
        await db.sessions.where('ownerId').equals(ownerId).delete()
        await db.outbox.where('ownerId').equals(ownerId).delete()
        await db.conflicts.where('ownerId').equals(ownerId).delete()
        await db.rejections.where('ownerId').equals(ownerId).delete()
        await db.settings.delete(ownerId)
        await db.widgetLayouts.delete(ownerId)
        await db.meta.bulkDelete([`cursor:${ownerId}`, lastSyncKey(ownerId)])
      },
    )
    await transitionToGuest()
  }, [authenticatedRequest, ownerId, transitionToGuest])

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

  const dismissAllRejected = useCallback(async () => {
    await db.rejections.where('ownerId').equals(ownerId).delete()
  }, [ownerId])

  const value = useMemo<AppContextValue>(
    () => ({
      ready,
      ownerId,
      user,
      settings,
      syncStatus:
        pendingMutations > 0 && syncStatus === 'idle'
          ? 'pending'
          : conflictCount === 0 && syncStatus === 'conflict'
            ? 'idle'
            : syncStatus,
      pendingMutations,
      sessions,
      recentSolves: recentSolvesList,
      solveStats,
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
      deleteAccount: deleteAccountFn,
      applyAuthSession,
      authenticatedRequest,
      requestSync,
      resolveConflictKeepServer,
      resolveConflictKeepLocal,
      conflicts: conflictCount,
      rejectedCount,
      dismissAllRejected,
      lastSyncedAt,
      deviceName,
      deviceId,
      scramble,
      scrambleState,
      loadScramble,
      customBackground,
      setCustomBackground,
    }),
    [
      applyAuthSession,
      authenticatedRequest,
      createSession,
      currentSession,
      deleteSolve,
      loginFn,
      logoutFn,
      deleteAccountFn,
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
      recentSolvesList,
      solveStats,
      switchSession,
      syncStatus,
      updateSettings,
      updateSolvePenalty,
      user,
      conflictCount,
      rejectedCount,
      dismissAllRejected,
      lastSyncedAt,
      deviceName,
      deviceId,
      scramble,
      scrambleState,
      loadScramble,
      customBackground,
      setCustomBackground,
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
