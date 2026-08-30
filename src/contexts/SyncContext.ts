import { createContext, useContext } from 'react'
import type { SyncStatus } from '../domain/models'

export interface SyncContextValue {
  syncStatus: SyncStatus
  isOnline: boolean
  lastSyncAt: string | null
  lastSyncedAt: string | null
  error: string | null
  pendingMutations: number
  conflicts: number
  rejectedCount: number
  deviceName: string | null
  deviceId: string | null
  triggerSync: () => void
  requestSync: () => void
  resolveConflictKeepServer: (conflictId: string) => Promise<void>
  resolveConflictKeepLocal: (conflictId: string) => Promise<void>
  dismissAllRejected: () => Promise<void>
}

export const SyncContext = createContext<SyncContextValue | null>(null)

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext)
  if (!ctx) {
    throw new Error('useSync must be used within a SyncProvider')
  }
  return ctx
}
