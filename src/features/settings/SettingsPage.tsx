import { useEffect, useState } from 'react'
import { useApp } from '../../app/AppProviders'
import type { AppSettings, SessionMode, TimerDisplayMode, TimerFont } from '../../domain/models'
import { Alert } from '../../ui/Alert'
import { Button } from '../../ui/Button'
import { Field } from '../../ui/Field'
import { Select } from '../../ui/Select'
import { PageHeader } from '../../ui/PageHeader'
import { Panel } from '../../ui/Panel'
import { Switch } from '../../ui/Switch'
import { SessionManager } from '../sessions/SessionManager'
import { ACCENT_PRESETS } from '../../styles/accents'

const HOLD_PRESETS = [0, 250, 300, 500, 550, 1000] as const

const BACKGROUND_PRESETS = [
  { label: 'Slate', value: '#64748b' },
  { label: 'Navy', value: '#1e3a8a' },
  { label: 'Forest', value: '#064e3b' },
  { label: 'Plum', value: '#701a75' },
  { label: 'Charcoal', value: '#171717' },
  { label: 'Crimson', value: '#991b1b' },
  { label: 'Rust', value: '#9a3412' },
  { label: 'Olive', value: '#3f6212' },
  { label: 'Teal', value: '#115e59' },
  { label: 'Ocean', value: '#0369a1' },
  { label: 'Midnight', value: '#020617' },
  { label: 'Mocha', value: '#3b2f2f' },
  { label: 'Sage', value: '#4b5563' },
  { label: 'Lavender', value: '#581c87' },
  { label: 'Coral', value: '#9f1239' },
  { label: 'Steel', value: '#334155' },
]

export function SettingsPage() {
  const { settings, updateSettings, setCustomBackground } = useApp()
  const [sessionOpen, setSessionOpen] = useState(false)
  const [gapDraft, setGapDraft] = useState(String(settings.inactivityGapMinutes))

  useEffect(() => {
    setGapDraft(String(settings.inactivityGapMinutes))
  }, [settings.inactivityGapMinutes])

  const gapValue = Number(gapDraft)
  const gapInvalid = !Number.isFinite(gapValue) || gapValue < 5 || gapValue > 240

  return (
    <div className="stack narrow-page">
      <PageHeader title="Settings" subtitle="Sessions, timer behavior, and appearance" />

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
        <p className="muted" style={{ margin: 0 }}>
          Automatic sessions group nearby solves and start a new one after this gap or after logout.
        </p>
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
      </Panel>

      <Panel className="stack">
        <h2>Timer Appearance</h2>
        
        <Field label="Timer Font">
          <Select
            value={settings.timerFont ?? 'jetbrains'}
            onChange={(val) => void updateSettings({ timerFont: val as TimerFont })}
            options={[
              { value: 'jetbrains', label: 'JetBrains Mono' },
              { value: 'roboto', label: 'Roboto Mono' },
              { value: 'fira', label: 'Fira Code' },
              { value: 'inter', label: 'Inter' },
              { value: 'digital', label: 'Digital (Share Tech Mono)' },
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
                border: '1px solid var(--border)',
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
            {settings.timerColor ? 'Custom color is set. ' : 'Currently using app accent color. '}
            Only applies to Idle and Running states.
          </p>
        </Field>
      </Panel>

      <Panel className="stack">
        <h2>Appearance</h2>
        
        <Field label="Accent Color">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '8px' }}>
            {ACCENT_PRESETS.map((preset) => (
              <Button
                key={preset.id}
                type="button"
                variant={settings.accentColor === preset.id ? 'primary' : 'ghost'}
                onClick={() => void updateSettings({ accentColor: preset.id })}
                style={{ width: '100%', justifyContent: 'flex-start' }}
              >
                <div style={{ width: 16, height: 16, borderRadius: 4, background: preset.light.main, border: '1px solid var(--border)', flexShrink: 0 }} />
                {preset.label}
              </Button>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '8px' }}>
            {BACKGROUND_PRESETS.map((preset) => (
              <Button
                key={preset.value}
                type="button"
                variant={settings.backgroundPreset === preset.value ? 'primary' : 'ghost'}
                onClick={() => void updateSettings({ backgroundPreset: preset.value })}
                style={{ width: '100%', justifyContent: 'flex-start' }}
              >
                <div style={{ width: 16, height: 16, borderRadius: 4, background: preset.value, border: '1px solid var(--border)', flexShrink: 0 }} />
                {preset.label}
              </Button>
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
