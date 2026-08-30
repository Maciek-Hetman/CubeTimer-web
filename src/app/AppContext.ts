import { createContext } from 'react'
import type { AuthenticatedRequest, User } from '../api/types'
import type {
  AppSettings,
  AuthSession,
  CubeEvent,
  CubeSession,
  Penalty,
  Solve,
  SolveStats,
  SyncStatus,
} from '../domain/models'
import { useAuth } from '../contexts/AuthContext'
import { useSettings } from '../contexts/SettingsContext'
import { useSync } from '../contexts/SyncContext'
import { useScramble } from '../contexts/ScrambleContext'
import { useSolves } from '../contexts/SolvesContext'

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
}

export const AppContext = createContext<AppContextValue | null>(null)

export function useApp(): AppContextValue {
  const auth = useAuth()
  const settings = useSettings()
  const sync = useSync()
  const scramble = useScramble()
  const solves = useSolves()

  return {
    ready: auth.ready,
    ownerId: auth.ownerId,
    user: auth.user,
    isAdmin: auth.isAdmin,
    login: auth.login,
    register: auth.register,
    logout: auth.logout,
    deleteAccount: auth.deleteAccount,
    applyAuthSession: auth.applyAuthSession,
    authenticatedRequest: auth.authenticatedRequest,

    settings: settings.settings,
    updateSettings: settings.updateSettings,
    setEvent: settings.setEvent,

    syncStatus: sync.syncStatus,
    pendingMutations: sync.pendingMutations,
    conflicts: sync.conflicts,
    rejectedCount: sync.rejectedCount,
    lastSyncedAt: sync.lastSyncedAt,
    deviceName: sync.deviceName,
    deviceId: sync.deviceId,
    requestSync: sync.requestSync,
    resolveConflictKeepServer: sync.resolveConflictKeepServer,
    resolveConflictKeepLocal: sync.resolveConflictKeepLocal,
    dismissAllRejected: sync.dismissAllRejected,

    scramble: scramble.scramble,
    scrambleState: scramble.scrambleState,
    loadScramble: scramble.loadScramble,

    sessions: solves.sessions,
    recentSolves: solves.recentSolves,
    solveStats: solves.solveStats,
    currentSession: solves.currentSession,
    saveSolve: solves.saveSolve,
    updateSolvePenalty: solves.updateSolvePenalty,
    deleteSolve: solves.deleteSolve,
    createSession: solves.createSession,
    renameSession: solves.renameSession,
    switchSession: solves.switchSession,
    removeSession: solves.removeSession,
  }
}
