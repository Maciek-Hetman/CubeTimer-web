import { useEffect, useState, type CSSProperties } from 'react'
import { useApp } from '../../app/AppProviders'
import type { AppSettings, SavedTheme, SessionMode, TimerDisplayMode, TimerFont } from '../../domain/models'
import { WIDGET_SCALE_MAX, WIDGET_SCALE_MIN, WIDGET_SCALE_PRESETS, WIDGET_SCALE_STEP } from '../../domain/models'
import { Alert } from '../../ui/Alert'
import { Button } from '../../ui/Button'
import { Field } from '../../ui/Field'
import { Select } from '../../ui/Select'
import { PageHeader } from '../../ui/PageHeader'
import { Panel } from '../../ui/Panel'
import { Switch } from '../../ui/Switch'
import { PencilIcon, TrashIcon } from '../../ui/NavIcons'
import { SessionManager } from '../sessions/SessionManager'
import { ACCENT_PRESETS, ACCENT_TIERS } from '../../styles/accents'
import { activeThemePreset, BUILTIN_PRESETS, type ThemeFields } from '../../styles/themes'

const HOLD_PRESETS = [100, 200, 300, 500, 750, 1000] as const

const rangeFill = (value: number, min: number, max: number): CSSProperties =>
  ({ '--fill': `${((value - min) / (max - min)) * 100}%` }) as CSSProperties

const DEFAULT_DARK_BG = '#020617'
const DEFAULT_LIGHT_BG = '#cbd5e1'

interface BackgroundPreset {
  label: string
  value: string
  tier: 'light' | 'vivid' | 'deep'
}

const BACKGROUND_TIERS: { id: BackgroundPreset['tier']; label: string }[] = [
  { id: 'light', label: 'Light' },
  { id: 'vivid', label: 'Vivid' },
  { id: 'deep', label: 'Deep' },
]

const BACKGROUND_PRESETS: BackgroundPreset[] = [
  { label: 'Fog', value: '#cbd5e1', tier: 'light' },
  { label: 'Sky', value: '#7dd3fc', tier: 'light' },
  { label: 'Mint', value: '#a7f3d0', tier: 'light' },
  { label: 'Lilac', value: '#c4b5fd', tier: 'light' },
  { label: 'Sand', value: '#fde68a', tier: 'light' },
  { label: 'Peach', value: '#fda4af', tier: 'light' },
  { label: 'Crimson', value: '#b91c1c', tier: 'vivid' },
  { label: 'Coral', value: '#e11d48', tier: 'vivid' },
  { label: 'Flame', value: '#ea580c', tier: 'vivid' },
  { label: 'Amber', value: '#d97706', tier: 'vivid' },
  { label: 'Grass', value: '#16a34a', tier: 'vivid' },
  { label: 'Teal', value: '#0d9488', tier: 'vivid' },
  { label: 'Ocean', value: '#0284c7', tier: 'vivid' },
  { label: 'Violet', value: '#7c3aed', tier: 'vivid' },
  { label: 'Midnight', value: '#020617', tier: 'deep' },
  { label: 'Charcoal', value: '#171717', tier: 'deep' },
  { label: 'Ink', value: '#0f172a', tier: 'deep' },
  { label: 'Espresso', value: '#1c1917', tier: 'deep' },
  { label: 'Deep Forest', value: '#052e16', tier: 'deep' },
  { label: 'Deep Plum', value: '#2e1065', tier: 'deep' },
]

interface SwatchOption {
  id: string
  label: string
  swatch: string
}

function SwatchGrid({
  options,
  selected,
  onSelect,
}: {
  options: SwatchOption[]
  selected: string
  onSelect: (id: string) => void
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '8px' }}>
      {options.map((option) => (
        <Button
          key={option.id}
          type="button"
          variant={selected === option.id ? 'primary' : 'ghost'}
          onClick={() => onSelect(option.id)}
          style={{ width: '100%', justifyContent: 'flex-start' }}
        >
          <div style={{ width: 16, height: 16, borderRadius: 4, background: option.swatch, boxShadow: 'var(--shadow-sm)', flexShrink: 0 }} />
          {option.label}
        </Button>
      ))}
    </div>
  )
}

export function SettingsPage() {
  const { settings, updateSettings, setCustomBackground } = useApp()
  const [sessionOpen, setSessionOpen] = useState(false)
  const [gapDraft, setGapDraft] = useState(String(settings.inactivityGapMinutes))
  const [presetNameDraft, setPresetNameDraft] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')

  useEffect(() => {
    setGapDraft(String(settings.inactivityGapMinutes))
  }, [settings.inactivityGapMinutes])

  const gapValue = Number(gapDraft)
  const gapInvalid = !Number.isFinite(gapValue) || gapValue < 5 || gapValue > 240

  const systemDark = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)')?.matches
  const effectiveTheme: 'light' | 'dark' =
    settings.theme === 'system' ? (systemDark ? 'dark' : 'light') : settings.theme

  const activeTheme = activeThemePreset(settings, settings.customThemes)
  const currentBgColor =
    settings.backgroundType === 'preset' && settings.backgroundPreset
      ? settings.backgroundPreset
      : effectiveTheme === 'dark'
        ? DEFAULT_DARK_BG
        : DEFAULT_LIGHT_BG

  const applyPreset = (preset: ThemeFields) => {
    void updateSettings({
      theme: preset.theme,
      accentColor: preset.accentColor,
      backgroundType: 'preset',
      backgroundPreset: preset.backgroundPreset,
    })
  }

  const themeOptions = [
    ...BUILTIN_PRESETS.map((preset) => ({ value: `preset:${preset.id}`, label: preset.label })),
    ...settings.customThemes.map((preset) => ({ value: `custom:${preset.id}`, label: preset.name })),
    { value: 'user', label: 'Custom theme' },
  ]

  const themeSelectValue =
    activeTheme.kind === 'builtin'
      ? `preset:${activeTheme.preset.id}`
      : activeTheme.kind === 'custom'
        ? `custom:${activeTheme.preset.id}`
        : 'user'

  const handleThemeSelect = (value: string) => {
    if (value === 'user') return
    const preset = value.startsWith('preset:')
      ? BUILTIN_PRESETS.find((p) => `preset:${p.id}` === value)
      : settings.customThemes.find((p) => `custom:${p.id}` === value)
    if (preset) applyPreset(preset)
  }

  const savePreset = () => {
    const name = presetNameDraft.trim()
    if (!name) return
    const saved: SavedTheme = {
      id: `custom-${Date.now()}`,
      name,
      theme: effectiveTheme,
      accentColor: settings.accentColor,
      backgroundPreset: currentBgColor,
    }
    void updateSettings({
      theme: effectiveTheme,
      accentColor: settings.accentColor,
      backgroundType: 'preset',
      backgroundPreset: currentBgColor,
      customThemes: [...settings.customThemes, saved],
    })
    setPresetNameDraft('')
  }

  const startRename = (preset: SavedTheme) => {
    setRenamingId(preset.id)
    setRenameDraft(preset.name)
  }

  const commitRename = () => {
    const id = renamingId
    setRenamingId(null)
    const name = renameDraft.trim()
    if (!id || !name) return
    void updateSettings({ customThemes: settings.customThemes.map((t) => (t.id === id ? { ...t, name } : t)) })
  }

  const deletePreset = (id: string) => {
    void updateSettings({ customThemes: settings.customThemes.filter((t) => t.id !== id) })
  }

  return (
    <div className="stack narrow-page">
      <PageHeader title="Settings" />

      <Panel className="stack">
        <h2>Sessions</h2>
        <Field label="Session management">
          <Select
            value={settings.sessionMode}
            onChange={(val) => void updateSettings({ sessionMode: val as SessionMode })}
            options={[
              { value: 'automatic', label: 'Automatic' },
              { value: 'manual', label: 'Manual' }
            ]}
          />
        </Field>
        <Field label="Inactivity gap (minutes)">
          <input
            type="number"
            min={5}
            max={240}
            value={gapDraft}
            onChange={(event) => setGapDraft(event.target.value)}
            onBlur={() => {
              if (gapInvalid) {
                setGapDraft(String(settings.inactivityGapMinutes))
                return
              }
              void updateSettings({ inactivityGapMinutes: Math.round(gapValue) })
            }}
          />
        </Field>
        {gapInvalid ? <Alert tone="error">Enter a value between 5 and 240 minutes.</Alert> : null}
        {settings.sessionMode === 'manual' ? (
          <Button type="button" onClick={() => setSessionOpen(true)}>
            Manage sessions
          </Button>
        ) : null}
      </Panel>

      <Panel className="stack">
        <h2>Timer</h2>
        <Field label={`Hold delay (${settings.timerStartDelayMs} ms)`}>
          <input
            type="range"
            min={0}
            max={1000}
            step={50}
            value={settings.timerStartDelayMs}
            style={rangeFill(settings.timerStartDelayMs, 0, 1000)}
            onChange={(event) => void updateSettings({ timerStartDelayMs: Number(event.target.value) })}
          />
        </Field>
        <div className="row wrap">
          {HOLD_PRESETS.map((preset) => (
            <Button
              key={preset}
              type="button"
              variant={settings.timerStartDelayMs === preset ? 'primary' : 'ghost'}
              onClick={() => void updateSettings({ timerStartDelayMs: preset })}
            >
              {preset} ms
            </Button>
          ))}
        </div>
        <Field label="Timer display during solve">
          <Select
            value={settings.timerDisplayMode ?? 'show'}
            onChange={(val) => void updateSettings({ timerDisplayMode: val as TimerDisplayMode })}
            options={[
              { value: 'show', label: 'Show full time' },
              { value: 'hide_decimals', label: 'Hide decimals' },
              { value: 'hide', label: 'Hide completely' }
            ]}
          />
        </Field>
        <Switch
          label="Hide scramble during solve"
          checked={settings.hideScrambleDuringSolve}
          onChange={(checked) => void updateSettings({ hideScrambleDuringSolve: checked })}
        />
        <Switch
          label="Enable widgets (desktop only)"
          checked={settings.enableWidgets ?? true}
          onChange={(checked) => void updateSettings({ enableWidgets: checked })}
        />
        {(settings.enableWidgets ?? true) && (
          <Switch
            label="Hide widgets during solve"
            checked={settings.hideWidgetsDuringSolve}
            onChange={(checked) => void updateSettings({ hideWidgetsDuringSolve: checked })}
          />
        )}
        {(settings.enableWidgets ?? true) && (
          <>
            <Field label={`Widget scale (${settings.widgetScale}%)`}>
              <input
                type="range"
                min={WIDGET_SCALE_MIN}
                max={WIDGET_SCALE_MAX}
                step={WIDGET_SCALE_STEP}
                value={settings.widgetScale}
                style={rangeFill(settings.widgetScale, WIDGET_SCALE_MIN, WIDGET_SCALE_MAX)}
                onChange={(event) => void updateSettings({ widgetScale: Number(event.target.value) })}
              />
            </Field>
            <div className="row wrap">
              {WIDGET_SCALE_PRESETS.map((preset) => (
                <Button
                  key={preset.id}
                  type="button"
                  variant={settings.widgetScale === preset.value ? 'primary' : 'ghost'}
                  onClick={() => void updateSettings({ widgetScale: preset.value })}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </>
        )}
      </Panel>

      <Panel className="stack">
        <h2>Timer Appearance</h2>
        
        <Field label="Timer Font">
          <Select
            value={settings.timerFont ?? 'jetbrains'}
            onChange={(val) => void updateSettings({ timerFont: val as TimerFont })}
            options={[
              { value: 'jetbrains', label: 'JetBrains Mono' },
              { value: 'fira', label: 'Fira Code' },
              { value: 'digital', label: 'Share Tech Mono' },
              { value: 'dseg7', label: 'DSEG7 Classic (Digital Clock)' },
              { value: 'inter', label: 'Inter' },
              { value: 'roboto', label: 'Roboto' },
              { value: 'open-sans', label: 'Open Sans' },
              { value: 'system', label: 'System Monospace' }
            ]}
          />
        </Field>

        <Field label="Timer Size">
          <div className="row wrap">
            {(['small', 'medium', 'large', 'xlarge'] as const).map((size) => (
              <Button
                key={size}
                type="button"
                variant={settings.timerSize === size ? 'primary' : 'ghost'}
                onClick={() => void updateSettings({ timerSize: size })}
                style={{ textTransform: 'capitalize' }}
              >
                {size}
              </Button>
            ))}
          </div>
        </Field>

        <Field label="Timer Color Override">
          <div className="row" style={{ alignItems: 'center', gap: 12 }}>
            <input
              type="color"
              value={settings.timerColor || '#1d4ed8'}
              onChange={(e) => void updateSettings({ timerColor: e.target.value })}
              style={{
                width: 44,
                height: 44,
                padding: 0,
                boxShadow: 'var(--shadow-sm)',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer'
              }}
            />
            {settings.timerColor && (
              <Button type="button" variant="ghost" onClick={() => void updateSettings({ timerColor: '' })}>
                Reset to Default
              </Button>
            )}
          </div>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            Applies to idle, running, and finished states.
          </p>
        </Field>
      </Panel>

      <Panel className="stack">
        <h2>Themes</h2>

        <Field label="Theme">
          <Select
            aria-label="Theme"
            value={themeSelectValue}
            onChange={handleThemeSelect}
            options={themeOptions}
          />
        </Field>

        {activeTheme.kind === 'user' ? (
          <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text"
              value={presetNameDraft}
              onChange={(e) => setPresetNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') savePreset()
              }}
              placeholder="Theme name"
              style={{ flex: 1, minWidth: 160 }}
            />
            <Button type="button" variant="primary" onClick={savePreset} disabled={!presetNameDraft.trim()}>
              Save as theme
            </Button>
          </div>
        ) : activeTheme.kind === 'custom' ? (
          renamingId === activeTheme.preset.id ? (
            <input
              type="text"
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename()
                if (e.key === 'Escape') setRenamingId(null)
              }}
              autoFocus
              aria-label="Theme name"
              style={{ flex: 1, minWidth: 160 }}
            />
          ) : (
            <div className="row" style={{ gap: 8 }}>
              <Button type="button" variant="ghost" onClick={() => startRename(activeTheme.preset)}>
                <PencilIcon /> Rename
              </Button>
              <Button type="button" variant="ghost" onClick={() => deletePreset(activeTheme.preset.id)}>
                <TrashIcon /> Delete
              </Button>
            </div>
          )
        ) : null}
      </Panel>

      <Panel className="stack">
        <h2>Appearance</h2>

        <Field label="Theme mode">
          <Select
            value={settings.theme}
            onChange={(val) => void updateSettings({ theme: val as AppSettings['theme'] })}
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' }
            ]}
          />
        </Field>

        <Field label="Accent Color">
          <div className="stack">
            {ACCENT_TIERS.map((tier) => (
              <div className="stack" key={tier.id} style={{ gap: '6px' }}>
                <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>{tier.label}</p>
                <SwatchGrid
                  options={ACCENT_PRESETS.filter((p) => p.tier === tier.id).map((p) => ({
                    id: p.id,
                    label: p.label,
                    swatch: p.light.main,
                  }))}
                  selected={settings.accentColor}
                  onSelect={(id) => void updateSettings({ accentColor: id })}
                />
              </div>
            ))}
          </div>
        </Field>

        <Field label={`UI Transparency (${settings.uiTransparency ?? 100}%)`}>
          <input
            type="range"
            min={10}
            max={100}
            step={5}
            value={settings.uiTransparency ?? 100}
            style={rangeFill(settings.uiTransparency ?? 100, 10, 100)}
            onChange={(event) => void updateSettings({ uiTransparency: Number(event.target.value) })}
          />
        </Field>

        <Field label="Background">
          <Select
            value={settings.backgroundType ?? 'theme'}
            onChange={(val) => void updateSettings({ backgroundType: val as AppSettings['backgroundType'] })}
            options={[
              { value: 'theme', label: 'Theme Default' },
              { value: 'preset', label: 'Solid Color' },
              { value: 'custom', label: 'Custom Image' }
            ]}
          />
        </Field>

        {settings.backgroundType === 'preset' && (
          <div className="stack">
            {BACKGROUND_TIERS.map((tier) => (
              <div className="stack" key={tier.id} style={{ gap: '6px' }}>
                <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>{tier.label}</p>
                <SwatchGrid
                  options={BACKGROUND_PRESETS.filter((p) => p.tier === tier.id).map((p) => ({
                    id: p.value,
                    label: p.label,
                    swatch: p.value,
                  }))}
                  selected={settings.backgroundPreset}
                  onSelect={(id) => void updateSettings({ backgroundPreset: id })}
                />
              </div>
            ))}
          </div>
        )}

        {settings.backgroundType === 'custom' && (
          <>
            <Field label="Upload custom image">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  const reader = new FileReader()
                  reader.onload = () => {
                    void setCustomBackground(reader.result as string)
                  }
                  reader.readAsDataURL(file)
                }}
              />
            </Field>
            <Field label="Image scaling">
              <Select
                value={settings.backgroundImageSizing ?? 'fill'}
                onChange={(val) =>
                  void updateSettings({ backgroundImageSizing: val as AppSettings['backgroundImageSizing'] })
                }
                options={[
                  { value: 'fill', label: 'Fill (Cropped)' },
                  { value: 'stretch', label: 'Stretch (Distorted)' }
                ]}
              />
            </Field>
          </>
        )}
      </Panel>

      {sessionOpen ? <SessionManager onClose={() => setSessionOpen(false)} /> : null}
    </div>
  )
}