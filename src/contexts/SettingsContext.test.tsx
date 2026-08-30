/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../data/db'
import { AuthProvider } from './AuthProvider'
import { SettingsProvider } from './SettingsProvider'
import { useSettings } from './SettingsContext'

describe('SettingsContext & SettingsProvider', () => {
  beforeEach(async () => {
    await db.settings.clear()
  })

  afterEach(() => {
    cleanup()
  })

  it('throws error when useSettings is used outside of SettingsProvider', () => {
    expect(() => renderHook(() => useSettings())).toThrow(
      'useSettings must be used within a SettingsProvider',
    )
  })

  it('provides default settings and updates settings', async () => {
    const { result } = renderHook(() => useSettings(), {
      wrapper: ({ children }) => (
        <AuthProvider>
          <SettingsProvider>{children}</SettingsProvider>
        </AuthProvider>
      ),
    })

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true)
    })

    expect(result.current.settings.event).toBe('3x3')
    expect(result.current.settings.timerStartDelayMs).toBe(500)

    await act(async () => {
      await result.current.updateSettings({ timerStartDelayMs: 300 })
    })

    await waitFor(() => {
      expect(result.current.settings.timerStartDelayMs).toBe(300)
    })
  })

  it('updates event via setEvent', async () => {
    const { result } = renderHook(() => useSettings(), {
      wrapper: ({ children }) => (
        <AuthProvider>
          <SettingsProvider>{children}</SettingsProvider>
        </AuthProvider>
      ),
    })

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true)
    })

    await act(async () => {
      await result.current.setEvent('4x4')
    })

    await waitFor(() => {
      expect(result.current.settings.event).toBe('4x4')
    })
  })

  it('applies theme and accent color CSS properties', async () => {
    const { result } = renderHook(() => useSettings(), {
      wrapper: ({ children }) => (
        <AuthProvider>
          <SettingsProvider>{children}</SettingsProvider>
        </AuthProvider>
      ),
    })

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true)
    })

    await act(async () => {
      await result.current.updateSettings({ theme: 'dark', accentColor: 'emerald' })
    })

    await waitFor(() => {
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
      expect(document.documentElement.style.getPropertyValue('--accent-light')).toBeTruthy()
    })
  })
})
