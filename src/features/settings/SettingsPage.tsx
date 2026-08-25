import { useState } from 'react'
import { Link } from 'react-router-dom'
import { resendVerification } from '../../api/auth'
import { useApp } from '../../app/AppProviders'
import type { SessionMode, TimerDisplayMode } from '../../domain/models'
import { ApiError } from '../../api/types'
import { Alert } from '../../ui/Alert'
import { Button } from '../../ui/Button'
import { Field } from '../../ui/Field'
import { PageHeader } from '../../ui/PageHeader'
import { Panel } from '../../ui/Panel'
import { Switch } from '../../ui/Switch'
import { SessionManager } from '../sessions/SessionManager'

const HOLD_PRESETS = [0, 250, 300, 500, 550, 1000] as const

export function SettingsPage() {
  const { settings, updateSettings, user, logout } = useApp()
  const [sessionOpen, setSessionOpen] = useState(false)
  const [gapDraft, setGapDraft] = useState(String(settings.inactivityGapMinutes))
  const [resendMessage, setResendMessage] = useState('')
  const [resendError, setResendError] = useState('')
  const [resending, setResending] = useState(false)

  const gapValue = Number(gapDraft)
  const gapInvalid = !Number.isFinite(gapValue) || gapValue < 5 || gapValue > 240

  async function sendVerification() {
    if (!user?.email) {
      return
    }
    setResending(true)
    setResendError('')
    setResendMessage('')
    try {
      await resendVerification(user.email)
      setResendMessage('Verification email sent. Check your inbox.')
    } catch (err) {
      setResendError(err instanceof ApiError ? err.message : 'Could not resend verification')
    } finally {
      setResending(false)
    }
  }

  return (
    <div className="stack">
      <PageHeader title="Settings" subtitle="Account, sessions, timer behavior, and appearance" />

      <Panel className="stack">
        <h2>Account</h2>
        {user ? (
          <>
            <p style={{ margin: 0 }}>{user.email}</p>
            {!user.email_verified ? (
              <div className="stack">
                <Alert tone="warning">Verify your email to enable sync.</Alert>
                {resendError ? <Alert tone="error">{resendError}</Alert> : null}
                {resendMessage ? <Alert tone="success" role="status">{resendMessage}</Alert> : null}
                <Button type="button" loading={resending} onClick={() => void sendVerification()}>
                  Resend verification email
                </Button>
              </div>
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                Email verified · sync enabled
              </p>
            )}
            <Button type="button" onClick={() => void logout()}>
              Log out
            </Button>
          </>
        ) : (
          <>
            <p className="muted" style={{ margin: 0 }}>
              Times are stored on this device until you sign in.
            </p>
            <div className="row wrap">
              <Link className="btn primary" to="/login">
                Sign in
              </Link>
              <Link className="btn" to="/register">
                Create account
              </Link>
            </div>
          </>
        )}
      </Panel>

      <Panel className="stack">
        <h2>Sessions</h2>
        <Field label="Session management">
          <select
            value={settings.sessionMode}
            onChange={(event) => void updateSettings({ sessionMode: event.target.value as SessionMode })}
          >
            <option value="automatic">Automatic</option>
            <option value="manual">Manual</option>
          </select>
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
          <select
            value={settings.timerDisplayMode ?? 'show'}
            onChange={(event) => void updateSettings({ timerDisplayMode: event.target.value as TimerDisplayMode })}
          >
            <option value="show">Show full time</option>
            <option value="hide_decimals">Hide decimals</option>
            <option value="hide">Hide completely</option>
          </select>
        </Field>
        <Switch
          label="Hide scramble during solve"
          checked={settings.hideScrambleDuringSolve}
          onChange={(checked) => void updateSettings({ hideScrambleDuringSolve: checked })}
        />
        <Switch
          label="Hide widgets during solve"
          checked={settings.hideWidgetsDuringSolve}
          onChange={(checked) => void updateSettings({ hideWidgetsDuringSolve: checked })}
        />
      </Panel>

      {sessionOpen ? <SessionManager onClose={() => setSessionOpen(false)} /> : null}
    </div>
  )
}
