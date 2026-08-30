import {
  useCallback,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getOrCreateSettings } from '../data/db'
import { DEFAULT_SETTINGS, type AppSettings, type CubeEvent } from '../domain/models'
import { getAccentColor } from '../styles/accents'
import { useAuth } from './AuthContext'
import { SettingsContext, type SettingsContextValue } from './SettingsContext'

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { ownerId } = useAuth()

  const settingsQuery = useLiveQuery(
    async () => (ownerId ? db.settings.get(ownerId) : undefined),
    [ownerId],
  )
  const isLoaded = settingsQuery !== undefined
  const settings = useMemo(
    () => (settingsQuery ? { ...DEFAULT_SETTINGS, ...settingsQuery } : { ownerId, ...DEFAULT_SETTINGS }),
    [ownerId, settingsQuery],
  )

  useEffect(() => {
    const root = document.documentElement
    if (settings.theme === 'system') {
      root.removeAttribute('data-theme')
    } else {
      root.setAttribute('data-theme', settings.theme)
    }

    const palette = getAccentColor(settings.accentColor || 'blue')
    root.style.setProperty('--accent-light', palette.light)
    root.style.setProperty('--accent-dark', palette.dark)
    root.style.setProperty('--chart-ao5-light', palette.ao5.light)
    root.style.setProperty('--chart-ao5-dark', palette.ao5.dark)
    root.style.setProperty('--chart-ao12-light', palette.ao12.light)
    root.style.setProperty('--chart-ao12-dark', palette.ao12.dark)

    if (settings.coloredBackground) {
      root.setAttribute('data-colored-bg', 'true')
    } else {
      root.removeAttribute('data-colored-bg')
    }

    const updateThemeColorMeta = () => {
      const bg = getComputedStyle(root).getPropertyValue('--bg').trim() || '#1d4ed8'
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg)
    }

    updateThemeColorMeta()
    const media = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null
    media?.addEventListener('change', updateThemeColorMeta)
    return () => media?.removeEventListener('change', updateThemeColorMeta)
  }, [settings.theme, settings.accentColor, settings.coloredBackground])

  const updateSettings = useCallback(
    async (patch: Partial<AppSettings>) => {
      if (!ownerId) {
        return
      }
      await db.transaction('rw', db.settings, async () => {
        const current = await getOrCreateSettings(ownerId)
        await db.settings.put({ ...current, ...patch, ownerId })
      })
    },
    [ownerId],
  )

  const setEvent = useCallback(
    async (event: CubeEvent) => {
      await updateSettings({ event })
    },
    [updateSettings],
  )

  const value = useMemo<SettingsContextValue>(
    () => ({
      settings,
      isLoaded,
      updateSettings,
      setEvent,
    }),
    [settings, isLoaded, updateSettings, setEvent],
  )

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}
