import type { AppSettings, SavedTheme } from '../domain/models'

export interface ThemePreset {
  id: string
  label: string
  theme: 'light' | 'dark'
  accentColor: string
  backgroundPreset: string
}

export const BUILTIN_PRESETS: ThemePreset[] = [
  { id: 'ocean-dark', label: 'Ocean Dark', theme: 'dark', accentColor: 'blue', backgroundPreset: '#020617' },
  { id: 'forest-dark', label: 'Forest Dark', theme: 'dark', accentColor: 'green', backgroundPreset: '#052e16' },
  { id: 'royal-dark', label: 'Royal Dark', theme: 'dark', accentColor: 'purple', backgroundPreset: '#2e1065' },
  { id: 'ice-light', label: 'Ice Light', theme: 'light', accentColor: 'cyan', backgroundPreset: '#7dd3fc' },
  { id: 'rose-light', label: 'Rose Light', theme: 'light', accentColor: 'rose', backgroundPreset: '#fda4af' },
  { id: 'sand-light', label: 'Sand Light', theme: 'light', accentColor: 'yellow', backgroundPreset: '#fde68a' },
]

export type ThemeSettingsSlice = Pick<
  AppSettings,
  'theme' | 'accentColor' | 'backgroundType' | 'backgroundPreset'
>

export type ThemeFields = Pick<ThemePreset, 'theme' | 'accentColor' | 'backgroundPreset'>

export function presetMatchesSettings(preset: ThemeFields, settings: ThemeSettingsSlice): boolean {
  return (
    settings.theme === preset.theme &&
    settings.accentColor === preset.accentColor &&
    settings.backgroundType === 'preset' &&
    settings.backgroundPreset === preset.backgroundPreset
  )
}

export type ActiveTheme =
  | { kind: 'builtin'; preset: ThemePreset }
  | { kind: 'custom'; preset: SavedTheme }
  | { kind: 'user'; preset: null }

export function activeThemePreset(settings: ThemeSettingsSlice, customThemes: SavedTheme[]): ActiveTheme {
  const builtin = BUILTIN_PRESETS.find((preset) => presetMatchesSettings(preset, settings))
  if (builtin) {
    return { kind: 'builtin', preset: builtin }
  }
  const custom = customThemes.find((preset) => presetMatchesSettings(preset, settings))
  if (custom) {
    return { kind: 'custom', preset: custom }
  }
  return { kind: 'user', preset: null }
}