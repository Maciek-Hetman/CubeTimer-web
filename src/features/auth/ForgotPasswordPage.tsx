import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { forgotPassword } from '../../api/auth'
import { ApiError } from '../../api/types'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    try {
      await forgotPassword(email)
      setMessage('If that account exists, a reset email is on the way.')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send reset email')
    }
  }

  return (
    <form className="panel stack" style={{ maxWidth: 420, margin: '40px auto' }} onSubmit={(event) => void onSubmit(event)}>
      <h1>Reset password</h1>
      {error ? <p role="alert">{error}</p> : null}
      {message ? <p>{message}</p> : null}
      <label className="field">
        Email
        <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
      </label>
      <button type="submit" className="btn primary">
        Send reset link
      </button>
      <Link to="/login">Back to sign in</Link>
    </form>
  )
}
