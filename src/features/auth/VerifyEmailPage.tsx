import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { verifyEmail } from '../../api/auth'
import { useApp } from '../../app/AppProviders'
import { ApiError } from '../../api/types'

export function VerifyEmailPage() {
  const [params] = useSearchParams()
  const { applyAuthSession } = useApp()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const token = params.get('token') ?? ''

  useEffect(() => {
    if (!token) {
      setError('Missing verification token')
      return
    }
    void verifyEmail(token)
      .then(async (session) => {
        await applyAuthSession(session, { mergeGuest: true })
        navigate('/')
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'Verification failed')
      })
  }, [applyAuthSession, navigate, token])

  return (
    <div className="panel stack" style={{ maxWidth: 420, margin: '40px auto' }}>
      <h1>Verify email</h1>
      {error ? <p role="alert">{error}</p> : <p>Verifying…</p>}
      <Link to="/login">Back to sign in</Link>
    </div>
  )
}
