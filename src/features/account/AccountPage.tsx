import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { changePassword, resendVerification } from '../../api/auth'
import { useApp } from '../../app/AppProviders'
import { ApiError } from '../../api/types'
import { getApiBaseUrl } from '../../config/env'
import { SYNC_HINTS, SYNC_LABELS, syncTone } from '../sync/syncStatus'
import { Alert } from '../../ui/Alert'
import { Button } from '../../ui/Button'
import { Dialog } from '../../ui/Dialog'
import { Field } from '../../ui/Field'
import { PageHeader } from '../../ui/PageHeader'
import { Panel } from '../../ui/Panel'

function timeAgo(iso: string, nowMs: number): string {
  const seconds = Math.max(0, Math.round((nowMs - new Date(iso).getTime()) / 1000))
  if (seconds < 60) {
    return 'just now'
  }
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) {
    return `${minutes} min ago`
  }
  const hours = Math.round(minutes / 60)
  if (hours < 24) {
    return `${hours} hr ago`
  }
  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

export function AccountPage() {
  const {
    user,
    logout,
    deleteAccount,
    authenticatedRequest,
    syncStatus,
    pendingMutations,
    conflicts,
    lastSyncedAt,
    deviceName,
    deviceId,
    requestSync,
  } = useApp()
  const [resendMessage, setResendMessage] = useState('')
  const [resendError, setResendError] = useState('')
  const [resending, setResending] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [passwordMessage, setPasswordMessage] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [passwordSubmitting, setPasswordSubmitting] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [serverStatus, setServerStatus] = useState<'idle' | 'checking' | 'online' | 'offline'>('idle')
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [])

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

  async function submitPassword(event: FormEvent) {
    event.preventDefault()
    if (passwordSubmitting) {
      return
    }
    setPasswordError('')
    setPasswordMessage('')
    setPasswordSubmitting(true)
    try {
      await changePassword(authenticatedRequest, currentPassword, newPassword)
      setCurrentPassword('')
      setNewPassword('')
      setPasswordMessage('Password updated.')
    } catch (err) {
      setPasswordError(err instanceof ApiError ? err.message : 'Could not change password')
    } finally {
      setPasswordSubmitting(false)
    }
  }

  async function checkServer() {
    setServerStatus('checking')
    try {
      const response = await fetch(`${getApiBaseUrl()}/health/live`)
      setServerStatus(response.ok ? 'online' : 'offline')
    } catch {
      setServerStatus('offline')
    }
  }

  async function confirmDelete() {
    if (deleting) {
      return
    }
    setDeleteError('')
    setDeleting(true)
    try {
      await deleteAccount()
      setDeleteOpen(false)
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'Could not delete account')
      setDeleting(false)
    }
  }

  return (
    <div className="stack narrow-page">
      <PageHeader title="Account" subtitle="Manage your account details and authentication" />

      <Panel className="stack">
        <h2>Profile</h2>
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

      {user ? (
        <>
          <Panel className="stack">
            <h2>Password</h2>
            <p className="muted" style={{ margin: 0 }}>
              Update the password used to sign in to this account.
            </p>
            <form className="stack" onSubmit={(event) => void submitPassword(event)}>
              {passwordError ? <Alert tone="error">{passwordError}</Alert> : null}
              {passwordMessage ? <Alert tone="success" role="status">{passwordMessage}</Alert> : null}
              <Field label="Current password">
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  required
                  autoComplete="current-password"
                />
              </Field>
              <Field label="New password (at least 10 characters)">
                <input
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  required
                  minLength={10}
                  autoComplete="new-password"
                />
              </Field>
              <Button type="submit" variant="primary" loading={passwordSubmitting}>
                Update password
              </Button>
            </form>
          </Panel>

          <Panel className="stack">
            <h2>Server & sync</h2>
            <div className="row wrap">
              <span className="sync-pill" title={SYNC_HINTS[syncStatus]}>
                <span className={`sync-dot ${syncTone(syncStatus)}`} />
                {SYNC_LABELS[syncStatus] ?? syncStatus}
              </span>
              <Button type="button" variant="ghost" onClick={requestSync}>
                Sync now
              </Button>
            </div>
            <dl className="info-list">
              <div>
                <dt>Pending changes</dt>
                <dd>{pendingMutations}</dd>
              </div>
              <div>
                <dt>Conflicts</dt>
                <dd>{conflicts}</dd>
              </div>
              <div>
                <dt>Last synced</dt>
                <dd>{lastSyncedAt ? timeAgo(lastSyncedAt, now) : 'Never'}</dd>
              </div>
              <div>
                <dt>Device</dt>
                <dd title={deviceId ?? undefined}>{deviceName ?? '—'}</dd>
              </div>
              <div>
                <dt>Network</dt>
                <dd>{navigator.onLine ? 'Online' : 'Offline'}</dd>
              </div>
              <div>
                <dt>Server</dt>
                <dd>{getApiBaseUrl()}</dd>
              </div>
            </dl>
            <div className="row wrap">
              <Button type="button" variant="ghost" loading={serverStatus === 'checking'} onClick={() => void checkServer()}>
                Check server
              </Button>
              {serverStatus === 'online' ? (
                <span className="muted">Server reachable</span>
              ) : serverStatus === 'offline' ? (
                <Alert tone="error">Server unreachable</Alert>
              ) : null}
            </div>
          </Panel>

          <Panel className="stack">
            <h2>Delete account</h2>
            <p className="muted" style={{ margin: 0 }}>
              Permanently deletes your account and all synced times from the server and this device. This cannot be undone.
            </p>
            <div>
              <Button
                type="button"
                variant="danger"
                onClick={() => {
                  setDeleteConfirmation('')
                  setDeleteError('')
                  setDeleteOpen(true)
                }}
              >
                Delete account
              </Button>
            </div>
          </Panel>

          {deleteOpen ? (
            <Dialog
              title="Delete your account?"
              onClose={() => setDeleteOpen(false)}
              footer={
                <div className="row wrap">
                  <Button
                    type="button"
                    variant="danger"
                    loading={deleting}
                    disabled={deleteConfirmation !== user.email}
                    onClick={() => void confirmDelete()}
                  >
                    Delete account
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setDeleteOpen(false)}>
                    Cancel
                  </Button>
                </div>
              }
            >
              <p style={{ margin: 0 }}>
                This permanently deletes <strong>{user.email}</strong> and removes all of its times from the
                server and this device. This cannot be undone.
              </p>
              {deleteError ? <Alert tone="error">{deleteError}</Alert> : null}
              <Field label={`Type ${user.email} to confirm`}>
                <input
                  type="text"
                  value={deleteConfirmation}
                  onChange={(event) => setDeleteConfirmation(event.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
              </Field>
            </Dialog>
          ) : null}
        </>
      ) : null}
    </div>
  )
}