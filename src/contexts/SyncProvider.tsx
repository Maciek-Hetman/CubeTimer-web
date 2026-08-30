import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../data/db'
import { putSession } from '../data/repositories/sessions'
import { putSolve } from '../data/repositories/solves'
import type { CubeSession, Solve, SyncStatus } from '../domain/models'
import { getLastSyncedAt, runSync, withBackoff } from '../sync/syncEngine'
import { shouldSkipSync } from '../sync/syncPolicy'
import {
  getDeviceId,
  getDeviceName,
  getStoredDeviceId,
  getStoredDeviceName,
  isGuestOwner,
} from '../app/profile'
import { useAuth } from './AuthContext'
import { SyncContext, type SyncContextValue } from './SyncContext'

const SYNC_MIN_INTERVAL_MS = 30_000

export function SyncProvider({ children }: { children: ReactNode }) {
  const { ownerId, user, ready, refreshAccessToken } = useAuth()

  const [rawSyncStatus, setRawSyncStatus] = useState<SyncStatus>('idle')
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  )
  const [error, setError] = useState<string | null>(null)
  const syncTimer = useRef<number | null>(null)
  const syncingRef = useRef(false)

  const pendingMutations =
    useLiveQuery(
      async () => (ownerId ? db.outbox.where('ownerId').equals(ownerId).count() : 0),
      [ownerId],
    ) ?? 0

  const conflictCount =
    useLiveQuery(
      async () => (ownerId ? db.conflicts.where('ownerId').equals(ownerId).count() : 0),
      [ownerId],
    ) ?? 0

  const rejectedCount =
    useLiveQuery(
      async () => (ownerId ? db.rejections.where('ownerId').equals(ownerId).count() : 0),
      [ownerId],
    ) ?? 0

  const deviceId =
    useLiveQuery(async () => (ownerId ? getStoredDeviceId() : null), [ownerId]) ?? null
  const deviceName =
    useLiveQuery(async () => (ownerId ? getStoredDeviceName() : null), [ownerId]) ?? null
  const lastSyncedAt =
    useLiveQuery(async () => (ownerId ? getLastSyncedAt(ownerId) : null), [ownerId]) ?? null

  const doSync = useCallback(async () => {
    if (!user?.email_verified || !ownerId || isGuestOwner(ownerId) || syncingRef.current) {
      return
    }
    const [pendingCount, lastSynced] = await Promise.all([
      db.outbox.where('ownerId').equals(ownerId).count(),
      getLastSyncedAt(ownerId),
    ])
    if (
      shouldSkipSync({
        pendingMutations: pendingCount,
        lastSyncedAt: lastSynced,
        nowMs: Date.now(),
        minIntervalMs: SYNC_MIN_INTERVAL_MS,
      })
    ) {
      return
    }
    let token: string
    try {
      token = await refreshAccessToken()
    } catch {
      setRawSyncStatus('error')
      setError('Authentication failed for sync')
      return
    }
    syncingRef.current = true
    setRawSyncStatus('syncing')
    setError(null)
    try {
      const devId = await getDeviceId()
      const devName = await getDeviceName()
      const result = await withBackoff(
        () =>
          runSync({
            ownerId,
            accessToken: token,
            device: { id: devId, name: devName, platform: 'web' },
            getAccessToken: refreshAccessToken,
          }),
        0,
      )
      setRawSyncStatus(result.conflicts > 0 || conflictCount > 0 ? 'conflict' : result.status)
      setError(null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sync failed'
      setError(msg)
      setRawSyncStatus(navigator.onLine ? 'error' : 'offline')
    } finally {
      syncingRef.current = false
    }
  }, [conflictCount, ownerId, refreshAccessToken, user])

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
    const onOnline = () => {
      setIsOnline(true)
      requestSync()
    }
    const onOffline = () => {
      setIsOnline(false)
    }
    const onFocus = () => requestSync()
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        requestSync()
      }
    }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
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

  const computedSyncStatus: SyncStatus =
    pendingMutations > 0 && rawSyncStatus === 'idle'
      ? 'pending'
      : conflictCount === 0 && rawSyncStatus === 'conflict'
        ? 'idle'
        : rawSyncStatus

  const value = useMemo<SyncContextValue>(
    () => ({
      syncStatus: computedSyncStatus,
      isOnline,
      lastSyncAt: lastSyncedAt,
      lastSyncedAt,
      error,
      pendingMutations,
      conflicts: conflictCount,
      rejectedCount,
      deviceName,
      deviceId,
      triggerSync: requestSync,
      requestSync,
      resolveConflictKeepServer,
      resolveConflictKeepLocal,
      dismissAllRejected,
    }),
    [
      computedSyncStatus,
      isOnline,
      lastSyncedAt,
      error,
      pendingMutations,
      conflictCount,
      rejectedCount,
      deviceName,
      deviceId,
      requestSync,
      resolveConflictKeepServer,
      resolveConflictKeepLocal,
      dismissAllRejected,
    ],
  )

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
}
