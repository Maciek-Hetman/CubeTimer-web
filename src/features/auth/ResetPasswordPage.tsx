import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { resetPassword } from '../../api/auth'
import { useApp } from '../../app/AppProviders'
import { ApiError } from '../../api/types'

export function ResetPasswordPage() {
  const [params] = useSearchParams()
  const { applyAuthSession } = useApp()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const token = params.get('token') ?? ''

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    try {
      const session = await resetPassword(token, password)
      await applyAuthSession(session, { mergeGuest: true })
      navigate('/')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reset password')
    }
  }

  return (
    <form className="panel stack" style={{ maxWidth: 420, margin: '40px auto' }} onSubmit={(event) => void onSubmit(event)}>
      <h1>Choose a new password</h1>
      {error ? <p role="alert">{error}</p> : null}
      <label className="field">
        New password
        <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={10} />
      </label>
      <button type="submit" className="btn primary" disabled={!token}>
        Update password
      </button>
      <Link to="/login">Back to sign in</Link>
    </form>
  )
}
