import type { ReactNode } from 'react'
import { AuthProvider } from '../contexts/AuthProvider'
import { SettingsProvider } from '../contexts/SettingsProvider'
import { SyncProvider } from '../contexts/SyncProvider'
import { ScrambleProvider } from '../contexts/ScrambleProvider'
import { SolvesProvider } from '../contexts/SolvesProvider'

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <SettingsProvider>
        <SyncProvider>
          <ScrambleProvider>
            <SolvesProvider>
              {children}
            </SolvesProvider>
          </ScrambleProvider>
        </SyncProvider>
      </SettingsProvider>
    </AuthProvider>
  )
}

export type { AppContextValue } from './AppContext'
