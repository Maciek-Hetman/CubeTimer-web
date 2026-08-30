import { createContext, useContext } from 'react'
import type { CubeEvent } from '../domain/models'

export interface ScrambleContextValue {
  scramble: string
  event: CubeEvent
  scrambleState: 'loading' | 'ready' | 'error'
  setEvent: (event: CubeEvent) => Promise<void>
  loadScramble: () => Promise<void>
  generateNewScramble: () => Promise<void>
  customScramble: (scramble: string) => void
  setScramble: (scramble: string) => void
}

export const ScrambleContext = createContext<ScrambleContextValue | null>(null)

export function useScramble(): ScrambleContextValue {
  const ctx = useContext(ScrambleContext)
  if (!ctx) {
    throw new Error('useScramble must be used within a ScrambleProvider')
  }
  return ctx
}
