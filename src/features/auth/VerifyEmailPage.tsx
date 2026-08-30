import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { verifyEmail } from '../../api/auth'
import { useAuth } from '../../contexts/AuthContext'
import { ApiError } from '../../api/types'
import { Alert } from '../../ui/Alert'
import { AuthLayout } from './AuthLayout'

export function VerifyEmailPage() {
  const [params] = useSearchParams()
  const { applyAuthSession } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const token = params.get('token') ?? ''
  const verificationRef = useRef<{ token: string; promise: Promise<void> } | null>(null)

  useEffect(() => {
    if (!token) {
      return
    }
    let verification = verificationRef.current
    if (!verification || verification.token !== token) {
      verification = {
        token,
        promise: verifyEmail(token).then((session) => applyAuthSession(session, { mergeGuest: true })),
      }
      verificationRef.current = verification
    }
    let cancelled = false
    let timeout: number | undefined
    void verification.promise
      .then(() => {
        if (cancelled) {
          return
        }
        setSuccess(true)
        timeout = window.setTimeout(() => {
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
      if (timeout !== undefined) {
        window.clearTimeout(timeout)
      }
    }
  }, [applyAuthSession, navigate, token])

  return (
    <AuthLayout title="Verify email">
      {error || !token ? <Alert tone="error">{error || 'Missing verification token'}</Alert> : null}
      {success ? <Alert tone="success" role="status">Email verified. Taking you to the timer…</Alert> : null}
      {!error && token && !success ? <p className="muted">Verifying…</p> : null}
      <div className="auth-links">
        <Link to="/login">Back to sign in</Link>
      </div>
    </AuthLayout>
  )
}
