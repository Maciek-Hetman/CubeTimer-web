import { Link } from 'react-router-dom'
import { useApp } from '../../app/AppProviders'
import type { SessionMode } from '../../domain/models'

export function SettingsPage() {
  const { settings, updateSettings, user, logout } = useApp()

  return (
    <div className="stack">
      <h1 style={{ margin: '8px 0' }}>Settings</h1>

      <section className="panel stack">
        <h2>Account</h2>
        {user ? (
          <>
            <p>{user.email}</p>
            {!user.email_verified ? <p className="muted">Verify your email to enable sync.</p> : null}
            <button type="button" className="btn" onClick={() => void logout()}>
              Log out
            </button>
          </>
        ) : (
          <>
            <p className="muted">Times are stored on this device until you sign in.</p>
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
      </section>

      <section className="panel stack">
        <h2>Sessions</h2>
        <label className="field">
          Session management
          <select
            value={settings.sessionMode}
            onChange={(event) => void updateSettings({ sessionMode: event.target.value as SessionMode })}
          >
            <option value="automatic">Automatic</option>
            <option value="manual">Manual</option>
          </select>
        </label>
        <label className="field">
          Inactivity gap (minutes)
          <input
            type="number"
            min={5}
            max={240}
            value={settings.inactivityGapMinutes}
            onChange={(event) =>
              void updateSettings({ inactivityGapMinutes: Number(event.target.value) || 60 })
            }
          />
        </label>
        <p className="muted">
          Automatic sessions group nearby solves and start a new one after this gap or after logout.
        </p>
      </section>

      <section className="panel stack">
        <h2>Timer</h2>
        <label className="field">
          Hold delay ({settings.timerStartDelayMs} ms)
          <input
            type="range"
            min={200}
            max={1000}
            step={50}
            value={settings.timerStartDelayMs}
            onChange={(event) => void updateSettings({ timerStartDelayMs: Number(event.target.value) })}
          />
        </label>
        <label className="row">
          <input
            type="checkbox"
            checked={settings.focusMode}
            onChange={(event) => void updateSettings({ focusMode: event.target.checked })}
          />
          Focus mode
        </label>
        <label className="row">
          <input
            type="checkbox"
            checked={settings.hideScrambleDuringSolve}
            onChange={(event) => void updateSettings({ hideScrambleDuringSolve: event.target.checked })}
          />
          Hide scramble during solve
        </label>
        <label className="row">
          <input
            type="checkbox"
            checked={settings.hideAveragesDuringSolve}
            onChange={(event) => void updateSettings({ hideAveragesDuringSolve: event.target.checked })}
          />
          Hide averages during solve
        </label>
        <label className="row">
          <input
            type="checkbox"
            checked={settings.hideLastResultsDuringSolve}
            onChange={(event) => void updateSettings({ hideLastResultsDuringSolve: event.target.checked })}
          />
          Hide last results during solve
        </label>
      </section>

      <section className="panel stack">
        <h2>Appearance</h2>
        <label className="field">
          Theme
          <select
            value={settings.theme}
            onChange={(event) =>
              void updateSettings({ theme: event.target.value as AppSettingsTheme })
            }
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
      </section>
    </div>
  )
}

type AppSettingsTheme = 'system' | 'light' | 'dark'
