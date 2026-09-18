import type { ReactNode } from 'react'
import { AuthProvider } from '../contexts/AuthProvider'
import { SettingsProvider } from '../contexts/SettingsProvider'
import { BluetoothTimerProvider } from '../contexts/BluetoothTimerProvider'
import { SyncProvider } from '../contexts/SyncProvider'
import { ScrambleProvider } from '../contexts/ScrambleProvider'
import { SolvesProvider } from '../contexts/SolvesProvider'

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <SettingsProvider>
        <BluetoothTimerProvider>
          <SyncProvider>
            <ScrambleProvider>
              <SolvesProvider>
                {children}
              </SolvesProvider>
            </ScrambleProvider>
          </SyncProvider>
        </BluetoothTimerProvider>
      </SettingsProvider>
    </AuthProvider>
  )
}

export type { AppContextValue } from './AppContext'
