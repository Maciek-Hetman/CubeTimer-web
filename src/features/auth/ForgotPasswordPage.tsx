import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { forgotPassword } from '../../api/auth'
import { ApiError } from '../../api/types'
import { Alert } from '../../ui/Alert'
import { Button } from '../../ui/Button'
import { Field } from '../../ui/Field'
import { AuthLayout } from './AuthLayout'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (submitting) {
      return
    }
    setError('')
    setSubmitting(true)
    try {
      await forgotPassword(email)
      setMessage('If that account exists, a reset email is on the way.')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send reset email')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout title="Reset password">
      <form className="stack" onSubmit={(event) => void onSubmit(event)}>
        {error ? <Alert tone="error">{error}</Alert> : null}
        {message ? <Alert tone="success" role="status">{message}</Alert> : null}
        <Field label="Email">
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </Field>
        <Button type="submit" variant="primary" loading={submitting}>
          Send reset link
        </Button>
        <div className="auth-links">
          <Link to="/login">Back to sign in</Link>
        </div>
      </form>
    </AuthLayout>
  )
}
