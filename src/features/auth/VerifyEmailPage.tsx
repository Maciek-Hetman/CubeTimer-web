import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { verifyEmail } from '../../api/auth'
import { useApp } from '../../app/AppProviders'
import { ApiError } from '../../api/types'
import { Alert } from '../../ui/Alert'
import { AuthLayout } from './AuthLayout'

export function VerifyEmailPage() {
  const [params] = useSearchParams()
  const { applyAuthSession } = useApp()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const token = params.get('token') ?? ''

  useEffect(() => {
    if (!token) {
      setError('Missing verification token')
      return
    }
    let cancelled = false
    void verifyEmail(token)
      .then(async (session) => {
        await applyAuthSession(session, { mergeGuest: true })
        if (cancelled) {
          return
        }
        setSuccess(true)
        window.setTimeout(() => {
          if (!cancelled) {
            navigate('/')
          }
        }, 1200)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Verification failed')
        }
      })
    return () => {
      cancelled = true
    }
  }, [applyAuthSession, navigate, token])

  return (
    <AuthLayout title="Verify email">
      {error ? <Alert tone="error">{error}</Alert> : null}
      {success ? <Alert tone="success" role="status">Email verified. Taking you to the timer…</Alert> : null}
      {!error && !success ? <p className="muted">Verifying…</p> : null}
      <div className="auth-links">
        <Link to="/login">Back to sign in</Link>
      </div>
    </AuthLayout>
  )
}
