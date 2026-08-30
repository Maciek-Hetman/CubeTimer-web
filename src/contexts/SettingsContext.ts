import { createContext, useContext } from 'react'
import type { AppSettings, CubeEvent } from '../domain/models'

export interface SettingsContextValue {
  settings: AppSettings
  isLoaded: boolean
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>
  setEvent: (event: CubeEvent) => Promise<void>
}

export const SettingsContext = createContext<SettingsContextValue | null>(null)

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext)
  if (!ctx) {
    throw new Error('useSettings must be used within a SettingsProvider')
  }
  return ctx
}
