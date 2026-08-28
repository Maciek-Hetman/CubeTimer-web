import { describe, expect, it } from 'vitest'
import type { SavedTheme } from '../domain/models'
import {
  activeThemePreset,
  BUILTIN_PRESETS,
  presetMatchesSettings,
  type ThemeSettingsSlice,
} from './themes'

function slice(overrides: Partial<ThemeSettingsSlice> = {}): ThemeSettingsSlice {
  return {
    theme: 'system',
    accentColor: 'blue',
    backgroundType: 'theme',
    backgroundPreset: '',
    ...overrides,
  }
}

describe('presetMatchesSettings', () => {
  it('matches when all three dimensions align', () => {
    const preset = BUILTIN_PRESETS[0]
    expect(
      presetMatchesSettings(preset, {
        theme: preset.theme,
        accentColor: preset.accentColor,
        backgroundType: 'preset',
        backgroundPreset: preset.backgroundPreset,
      }),
    ).toBe(true)
  })

  it('requires backgroundType to be preset', () => {
    const preset = BUILTIN_PRESETS[0]
    expect(
      presetMatchesSettings(preset, {
        theme: preset.theme,
        accentColor: preset.accentColor,
        backgroundType: 'theme',
        backgroundPreset: preset.backgroundPreset,
      }),
    ).toBe(false)
  })

  it('does not match when any dimension differs', () => {
    const preset = BUILTIN_PRESETS[0]
    expect(
      presetMatchesSettings(preset, {
        theme: preset.theme,
        accentColor: 'green',
        backgroundType: 'preset',
        backgroundPreset: preset.backgroundPreset,
      }),
    ).toBe(false)
  })
})

describe('activeThemePreset', () => {
  it('returns the matching builtin preset', () => {
    const preset = BUILTIN_PRESETS[2]
    const active = activeThemePreset(
      {
        theme: preset.theme,
        accentColor: preset.accentColor,
        backgroundType: 'preset',
        backgroundPreset: preset.backgroundPreset,
      },
      [],
    )
    expect(active.kind).toBe('builtin')
    expect(active.kind === 'builtin' && active.preset.id).toBe(preset.id)
  })

  it('returns a custom preset before falling back to user', () => {
    const custom: SavedTheme = {
      id: 'custom-1',
      name: 'My Theme',
      theme: 'light',
      accentColor: 'indigo',
      backgroundPreset: '#cbd5e1',
    }
    const active = activeThemePreset(
      {
        theme: 'light',
        accentColor: 'indigo',
        backgroundType: 'preset',
        backgroundPreset: '#cbd5e1',
      },
      [custom],
    )
    expect(active.kind).toBe('custom')
    expect(active.kind === 'custom' && active.preset.id).toBe('custom-1')
  })

  it('returns user when nothing matches', () => {
    const active = activeThemePreset(slice({ theme: 'dark', accentColor: 'rose' }), [])
    expect(active.kind).toBe('user')
  })

  it('prefers builtins over customs when both match', () => {
    const duplicate: SavedTheme = {
      id: 'custom-dup',
      name: 'Copy',
      theme: BUILTIN_PRESETS[0].theme,
      accentColor: BUILTIN_PRESETS[0].accentColor,
      backgroundPreset: BUILTIN_PRESETS[0].backgroundPreset,
    }
    const active = activeThemePreset(
      {
        theme: BUILTIN_PRESETS[0].theme,
        accentColor: BUILTIN_PRESETS[0].accentColor,
        backgroundType: 'preset',
        backgroundPreset: BUILTIN_PRESETS[0].backgroundPreset,
      },
      [duplicate],
    )
    expect(active.kind).toBe('builtin')
    expect(active.kind === 'builtin' && active.preset.id).toBe(BUILTIN_PRESETS[0].id)
  })
})