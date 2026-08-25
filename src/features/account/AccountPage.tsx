import { useState } from 'react'
import { Link } from 'react-router-dom'
import { resendVerification } from '../../api/auth'
import { useApp } from '../../app/AppProviders'
import { ApiError } from '../../api/types'
import { Alert } from '../../ui/Alert'
import { Button } from '../../ui/Button'
import { PageHeader } from '../../ui/PageHeader'
import { Panel } from '../../ui/Panel'

export function AccountPage() {
  const { user, logout } = useApp()
  const [resendMessage, setResendMessage] = useState('')
  const [resendError, setResendError] = useState('')
  const [resending, setResending] = useState(false)

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
    </div>
  )
}
