import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { resetPassword } from '../../api/auth'
import { useAuth } from '../../contexts/AuthContext'
import { ApiError } from '../../api/types'
import { Alert } from '../../ui/Alert'
import { Button } from '../../ui/Button'
import { Field } from '../../ui/Field'
import { AuthLayout } from './AuthLayout'

export function ResetPasswordPage() {
  const [params] = useSearchParams()
  const { applyAuthSession } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const token = params.get('token') ?? ''

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (submitting) {
      return
    }
    setError('')
    setSubmitting(true)
    try {
      const session = await resetPassword(token, password)
      await applyAuthSession(session, { mergeGuest: true })
      navigate('/')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reset password')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout title="Choose a new password">
      <form className="stack" onSubmit={(event) => void onSubmit(event)}>
        {error ? <Alert tone="error">{error}</Alert> : null}
        <Field label="New password">
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={10}
          />
        </Field>
        <Button type="submit" variant="primary" loading={submitting} disabled={!token}>
          Update password
        </Button>
        <div className="auth-links">
          <Link to="/login">Back to sign in</Link>
        </div>
      </form>
    </AuthLayout>
  )
}
