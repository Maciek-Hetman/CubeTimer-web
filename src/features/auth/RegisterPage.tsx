import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../../app/AppProviders'
import { ApiError } from '../../api/types'
import { Alert } from '../../ui/Alert'
import { Button } from '../../ui/Button'
import { Field } from '../../ui/Field'
import { AuthLayout } from './AuthLayout'

export function RegisterPage() {
  const { register } = useApp()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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
      await register(email, password)
      setMessage('Check your email for a verification link.')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not register')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout title="Create account">
      <form className="stack" onSubmit={(event) => void onSubmit(event)}>
        {error ? <Alert tone="error">{error}</Alert> : null}
        {message ? <Alert tone="success" role="status">{message}</Alert> : null}
        <Field label="Email">
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </Field>
        <Field label="Password (at least 10 characters)">
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={10}
          />
        </Field>
        <Button type="submit" variant="primary" loading={submitting}>
          Register
        </Button>
        <div className="auth-links">
          <Link to="/login">Already have an account</Link>
        </div>
      </form>
    </AuthLayout>
  )
}
