import { createContext, useContext } from 'react'
import type { SmartTimerListener } from '../features/timer/bluetooth/types'

export type BluetoothTimerStatus = 'unsupported' | 'disconnected' | 'connecting' | 'connected'

export interface BluetoothTimerContextValue {
  status: BluetoothTimerStatus
  deviceName: string | null
  error: string | null
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  /** Subscribes to timer events; returns an unsubscribe function. */
  subscribe: (listener: SmartTimerListener) => () => void
}

export const BluetoothTimerContext = createContext<BluetoothTimerContextValue | null>(null)

export function useBluetoothTimer(): BluetoothTimerContextValue {
  const ctx = useContext(BluetoothTimerContext)
  if (!ctx) {
    throw new Error('useBluetoothTimer must be used within a BluetoothTimerProvider')
  }
  return ctx
}
