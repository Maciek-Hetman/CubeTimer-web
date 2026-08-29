import { useState, type CSSProperties } from 'react'
import { useApp } from '../../app/AppProviders'
import type { AppSettings, SessionMode, TimerDisplayMode, TimerFont } from '../../domain/models'
import { WIDGET_SCALE_MAX, WIDGET_SCALE_MIN, WIDGET_SCALE_PRESETS, WIDGET_SCALE_STEP } from '../../domain/models'
import { Button } from '../../ui/Button'
import { Field } from '../../ui/Field'
import { Select } from '../../ui/Select'
import { PageHeader } from '../../ui/PageHeader'
import { Panel } from '../../ui/Panel'
import { Switch } from '../../ui/Switch'
import { SessionManager } from '../sessions/SessionManager'
import { ACCENT_COLORS } from '../../styles/accents'

const HOLD_PRESETS = [100, 200, 300, 500, 750, 1000] as const

const rangeFill = (value: number, min: number, max: number): CSSProperties =>
  ({ '--fill': `${((value - min) / (max - min)) * 100}%` }) as CSSProperties

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
  const { settings, updateSettings } = useApp()
  const [sessionOpen, setSessionOpen] = useState(false)

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
        <Field label={`Inactivity gap (${settings.inactivityGapMinutes} min)`}>
          <input
            type="range"
            min={5}
            max={240}
            step={5}
            value={settings.inactivityGapMinutes}
            style={rangeFill(settings.inactivityGapMinutes, 5, 240)}
            onChange={(event) => void updateSettings({ inactivityGapMinutes: Number(event.target.value) })}
          />
        </Field>
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

        <Field label="Main color">
          <SwatchGrid
            options={ACCENT_COLORS.map((color) => ({
              id: color.id,
              label: color.label,
              swatch: color.light,
            }))}
            selected={settings.accentColor}
            onSelect={(id) => void updateSettings({ accentColor: id })}
          />
        </Field>

        <Switch
          label="Colored background"
          checked={settings.coloredBackground}
          onChange={(checked) => void updateSettings({ coloredBackground: checked })}
        />
      </Panel>

      {sessionOpen ? <SessionManager onClose={() => setSessionOpen(false)} /> : null}
    </div>
  )
}