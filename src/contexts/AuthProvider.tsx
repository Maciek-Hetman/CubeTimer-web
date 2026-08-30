import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Table } from 'dexie'
import * as authApi from '../api/auth'
import { apiRequest, type RequestOptions } from '../api/client'
import { ApiError, type AuthenticatedRequest, type AuthSession, type User } from '../api/types'
import { db, getMeta, getOrCreateSettings } from '../data/db'
import { listSessions, putSession } from '../data/repositories/sessions'
import { nowIso } from '../domain/models'
import { adoptGuestData } from '../sync/guestMerge'
import { lastSyncKey } from '../sync/syncEngine'
import { isTokenExpired } from '../sync/syncPolicy'
import {
  clearAuth,
  createFreshGuestOwner,
  ensureGuestOwner,
  getCurrentOwnerId,
  getStoredRefreshToken,
  getStoredUser,
  isGuestOwner,
  saveAuth,
  setCurrentOwnerId,
} from '../app/profile'
import { AuthContext, type AuthContextValue } from './AuthContext'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [ownerId, setOwnerId] = useState('')
  const [user, setUser] = useState<User | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const accessTokenRef = useRef<string | null>(null)
  const accessTokenExpiresAtRef = useRef<number>(0)
  const userRef = useRef<User | null>(null)
  const refreshTokenRef = useRef<string | null>(null)

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
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [currentOwner, guestOwner, refreshToken, storedUser] = await Promise.all([
        getMeta<string | null>('owner.current', null),
        getMeta<string | null>('owner.guest', null),
        getStoredRefreshToken(),
        getStoredUser<User>(),
      ])

      let owner = currentOwner || guestOwner
      if (!owner) {
        owner = await ensureGuestOwner()
      }
      if (!refreshToken && !isGuestOwner(owner)) {
        owner = await createFreshGuestOwner()
      }

      if (!cancelled) {
        setOwnerId(owner)
        if (storedUser) {
          setUser(storedUser)
        }
      }

      await getOrCreateSettings(owner)

      if (refreshToken) {
        refreshTokenRef.current = refreshToken
        try {
          const session = await authApi.refresh(refreshToken)
          if (!cancelled) {
            await persistSession(session, false)
          } else {
            void persistSession(session, false)
          }
        } catch {
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

  const authenticatedRequest = useCallback<AuthenticatedRequest>(
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

  const applyAuthSession = useCallback(
    async (session: AuthSession, options?: { mergeGuest?: boolean }) => {
      await persistSession(session, options?.mergeGuest ?? true)
    },
    [persistSession],
  )

  const login = useCallback(
    async (email: string, password: string) => {
      const session = await authApi.login(email, password)
      await applyAuthSession(session, { mergeGuest: true })
    },
    [applyAuthSession],
  )

  const register = useCallback(async (email: string, password: string) => {
    await authApi.register(email, password)
  }, [])

  const enqueueWrites = Boolean(user?.email_verified && ownerId && !isGuestOwner(ownerId))

  const logout = useCallback(async () => {
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
  }, [ownerId, enqueueWrites, transitionToGuest])

  const requestPasswordReset = useCallback(async (email: string) => {
    await authApi.forgotPassword(email)
  }, [])

  const resetPassword = useCallback(
    async (token: string, newPassword: string) => {
      const session = await authApi.resetPassword(token, newPassword)
      await applyAuthSession(session, { mergeGuest: true })
    },
    [applyAuthSession],
  )

  const verifyEmail = useCallback(
    async (token: string) => {
      const session = await authApi.verifyEmail(token)
      await applyAuthSession(session, { mergeGuest: false })
    },
    [applyAuthSession],
  )

  const resendVerificationEmail = useCallback(async (email: string) => {
    await authApi.resendVerification(email)
  }, [])

  const updatePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      await authApi.changePassword(authenticatedRequest, currentPassword, newPassword)
    },
    [authenticatedRequest],
  )

  const deleteAccount = useCallback(async () => {
    await authApi.deleteAccount(authenticatedRequest)
    await db.transaction(
      'rw',
      [
        db.solves,
        db.sessions,
        db.outbox,
        db.settings,
        db.conflicts,
        db.rejections,
        db.widgetLayouts,
        db.meta,
      ] as Table[],
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

  const isAdmin = user?.user_role === 'admin'
  const role = user?.user_role ?? null

  const value = useMemo<AuthContextValue>(
    () => ({
      ready,
      ownerId,
      user,
      token: accessToken,
      role,
      isAdmin,
      enqueueWrites,
      login,
      register,
      logout,
      requestPasswordReset,
      resetPassword,
      verifyEmail,
      resendVerificationEmail,
      deleteAccount,
      updatePassword,
      applyAuthSession,
      authenticatedRequest,
      refreshAccessToken,
    }),
    [
      ready,
      ownerId,
      user,
      accessToken,
      role,
      isAdmin,
      enqueueWrites,
      login,
      register,
      logout,
      requestPasswordReset,
      resetPassword,
      verifyEmail,
      resendVerificationEmail,
      deleteAccount,
      updatePassword,
      applyAuthSession,
      authenticatedRequest,
      refreshAccessToken,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
