import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { ApiError, type FederatedInput } from '../../api/types'
import { Alert } from '../../ui/Alert'
import { Button } from '../../ui/Button'
import { Field } from '../../ui/Field'
import { AuthLayout } from './AuthLayout'
import { GoogleSignInButton } from './GoogleSignInButton'
import { googleAuthErrorMessage } from './googleIdentity'

export function LoginPage() {
  const { login, loginWithGoogle } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function redirectAfterSignIn() {
    const from = (location.state as { from?: string } | null)?.from
    navigate(from && from.startsWith('/') && !from.startsWith('//') ? from : '/')
  }

  async function onGoogleCredential(input: FederatedInput) {
    if (submitting) {
      return
    }
    setError('')
    setSubmitting(true)
    try {
      await loginWithGoogle(input)
      redirectAfterSignIn()
    } catch (err) {
      setError(googleAuthErrorMessage(err, 'Could not sign in with Google'))
    } finally {
      setSubmitting(false)
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (submitting) {
      return
    }
    setError('')
    setSubmitting(true)
    try {
      await login(email, password)
      redirectAfterSignIn()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign in')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout title="Sign in">
      <form className="stack" onSubmit={(event) => void onSubmit(event)}>
        {error ? <Alert tone="error">{error}</Alert> : null}
        <GoogleSignInButton divider text="signin_with" onCredential={onGoogleCredential} />
        <Field label="Email">
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </Field>
        <Field label="Password">
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={10}
          />
        </Field>
        <Button type="submit" variant="primary" loading={submitting}>
          Sign in
        </Button>
        <div className="auth-links">
          <Link to="/forgot-password">Forgot password</Link>
          <Link to="/register">Create account</Link>
        </div>
      </form>
    </AuthLayout>
  )
}
