import { createContext, useContext } from 'react'
import type { CubeSession, Penalty, Solve, SolveStats, TimingDevice } from '../domain/models'

export interface SaveSolveInput {
  durationMs: number
  penalty: Penalty
  scramble: string
  timingDevice?: TimingDevice
}

export interface SolvesContextValue {
  solves: Solve[]
  recentSolves: Solve[]
  sessions: CubeSession[]
  activeSession: CubeSession | null
  currentSession: CubeSession | null
  solveStats: SolveStats
  addSolve: (input: SaveSolveInput) => Promise<Solve>
  saveSolve: (input: SaveSolveInput) => Promise<Solve>
  updateSolve: (solveId: string, penalty: Penalty) => Promise<void>
  updateSolvePenalty: (solveId: string, penalty: Penalty) => Promise<void>
  deleteSolve: (solveId: string) => Promise<void>
  renameSession: (sessionId: string, name: string) => Promise<void>
  deleteSession: (sessionId: string) => Promise<number>
  removeSession: (sessionId: string) => Promise<number>
}

export const SolvesContext = createContext<SolvesContextValue | null>(null)

export function useSolves(): SolvesContextValue {
  const ctx = useContext(SolvesContext)
  if (!ctx) {
    throw new Error('useSolves must be used within a SolvesProvider')
  }
  return ctx
}
