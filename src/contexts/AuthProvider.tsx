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
import {
  ApiError,
  type AuthenticatedRequest,
  type AuthSession,
  type FederatedInput,
  type User,
} from '../api/types'
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

function isRefreshRejected(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 401 || error.status === 409)
}

const AUTH_LOCK = 'cubetimer:auth'

/**
 * Runs `task` under a lock shared by every tab. Refresh tokens are single-use, so reading
 * the stored token and replacing it must not interleave with another tab doing the same.
 */
function withAuthLock<T>(task: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks
  return locks ? (locks.request(AUTH_LOCK, task) as Promise<T>) : task()
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [ownerId, setOwnerId] = useState('')
  const [user, setUser] = useState<User | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const accessTokenRef = useRef<string | null>(null)
  const accessTokenExpiresAtRef = useRef<number>(0)
  const userRef = useRef<User | null>(null)

  useEffect(() => {
    accessTokenRef.current = accessToken
  }, [accessToken])

  useEffect(() => {
    userRef.current = user
  }, [user])

  const applyTokens = useCallback((session: AuthSession) => {
    setAccessToken(session.access_token)
    setUser(session.user)
    accessTokenRef.current = session.access_token
    accessTokenExpiresAtRef.current = Date.now() + session.expires_in * 1000
    userRef.current = session.user
  }, [])

  const activateOwner = useCallback(async (id: string) => {
    await setCurrentOwnerId(id)
    await getOrCreateSettings(id)
    setOwnerId(id)
  }, [])

  const persistSession = useCallback(
    async (session: AuthSession, mergeGuest: boolean) => {
      await withAuthLock(() => saveAuth(session.refresh_token, session.user))
      applyTokens(session)
      if (mergeGuest) {
        const guest = await ensureGuestOwner()
        if (guest !== session.user.id) {
          await adoptGuestData(guest, session.user.id)
        }
      }
      await activateOwner(session.user.id)
    },
    [activateOwner, applyTokens],
  )

  const transitionToGuest = useCallback(async () => {
    await clearAuth()
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

  // Another tab signed in to a different account; show that one here too, as a reload would.
  const followStoredAccount = useCallback(
    async (storedUser: User) => {
      setAccessToken(null)
      setUser(storedUser)
      accessTokenRef.current = null
      accessTokenExpiresAtRef.current = 0
      userRef.current = storedUser
      await activateOwner(storedUser.id)
    },
    [activateOwner],
  )

  const refreshPromiseRef = useRef<Promise<AuthSession> | null>(null)

  const refreshSession = useCallback((): Promise<AuthSession> => {
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current
    }
    const promise = withAuthLock(async () => {
      // Read the token inside the lock: another tab may have rotated it since this tab's last refresh.
      const [token, storedUser] = await Promise.all([getStoredRefreshToken(), getStoredUser<User>()])
      const currentUserId = userRef.current?.id
      if (!token) {
        if (currentUserId) {
          await transitionToGuest()
        }
        throw new ApiError(401, 'unauthenticated', 'Not signed in')
      }
      if (currentUserId && storedUser && storedUser.id !== currentUserId) {
        // Never hand this tab's callers a token for another account; they'd write its data there.
        await followStoredAccount(storedUser)
        throw new ApiError(401, 'account_changed', 'Signed in to a different account in another tab')
      }
      try {
        const session = await authApi.refresh(token)
        await saveAuth(session.refresh_token, session.user)
        applyTokens(session)
        return session
      } catch (error) {
        // Sign out only if the rejected token is still current; if not, it was replaced meanwhile.
        if (isRefreshRejected(error) && (await getStoredRefreshToken()) === token) {
          await transitionToGuest()
        }
        throw error
      }
    }).finally(() => {
      refreshPromiseRef.current = null
    })
    refreshPromiseRef.current = promise
    return promise
  }, [applyTokens, followStoredAccount, transitionToGuest])

  const refreshAccessToken = useCallback(
    async () => (await refreshSession()).access_token,
    [refreshSession],
  )

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
        // Shared with StrictMode's second run of this effect, so the token is only spent once.
        try {
          const session = await refreshSession()
          if (!cancelled) {
            await activateOwner(session.user.id)
          }
        } catch {
          // Offline keeps the stored account; a rejected token has already switched to guest.
        }
      }

      if (!cancelled) {
        setReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [activateOwner, refreshSession])

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

  const loginWithGoogle = useCallback(
    async (input: FederatedInput) => {
      const session = await authApi.federatedLogin('google', input)
      await applyAuthSession(session, { mergeGuest: true })
    },
    [applyAuthSession],
  )

  const linkGoogle = useCallback(
    async (input: FederatedInput) => {
      await authApi.linkFederatedIdentity(authenticatedRequest, 'google', input)
    },
    [authenticatedRequest],
  )

  const register = useCallback(async (email: string, password: string) => {
    await authApi.register(email, password)
  }, [])

  const enqueueWrites = Boolean(user?.email_verified && ownerId && !isGuestOwner(ownerId))

  const logout = useCallback(async () => {
    if (ownerId) {
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
    await withAuthLock(async () => {
      // Revoke the stored token: this tab's last one may already have been rotated by another tab.
      const token = await getStoredRefreshToken()
      if (token) {
        try {
          await authApi.logout(token)
        } catch {
          // ignore
        }
      }
      await transitionToGuest()
    })
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
      loginWithGoogle,
      linkGoogle,
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
      loginWithGoogle,
      linkGoogle,
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
