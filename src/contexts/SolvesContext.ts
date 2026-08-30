import { createContext, useContext } from 'react'
import type { CubeSession, Penalty, Solve, SolveStats } from '../domain/models'

export interface SolvesContextValue {
  solves: Solve[]
  recentSolves: Solve[]
  sessions: CubeSession[]
  activeSession: CubeSession | null
  currentSession: CubeSession | null
  solveStats: SolveStats
  addSolve: (input: { durationMs: number; penalty: Penalty; scramble: string }) => Promise<Solve>
  saveSolve: (input: { durationMs: number; penalty: Penalty; scramble: string }) => Promise<Solve>
  updateSolve: (solveId: string, penalty: Penalty) => Promise<void>
  updateSolvePenalty: (solveId: string, penalty: Penalty) => Promise<void>
  deleteSolve: (solveId: string) => Promise<void>
  createSession: (name: string) => Promise<CubeSession>
  renameSession: (sessionId: string, name: string) => Promise<void>
  changeSession: (sessionId: string) => Promise<void>
  switchSession: (sessionId: string) => Promise<void>
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
