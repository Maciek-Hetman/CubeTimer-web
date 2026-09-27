import { createContext, useContext } from 'react'
import type { SmartTimerListener } from '../features/timer/bluetooth/types'

/** `listening`: the audio input is open, but no timer signal is coming in. */
export type WiredTimerStatus = 'unsupported' | 'disconnected' | 'connecting' | 'listening' | 'connected'

export interface WiredTimerContextValue {
  status: WiredTimerStatus
  /** Label of the audio input in use. */
  inputLabel: string | null
  error: string | null
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  /** Subscribes to timer events; returns an unsubscribe function. */
  subscribe: (listener: SmartTimerListener) => () => void
}

export const WiredTimerContext = createContext<WiredTimerContextValue | null>(null)

export function useWiredTimer(): WiredTimerContextValue {
  const ctx = useContext(WiredTimerContext)
  if (!ctx) {
    throw new Error('useWiredTimer must be used within a WiredTimerProvider')
  }
  return ctx
}
