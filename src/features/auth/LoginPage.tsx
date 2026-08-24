import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApp } from '../../app/AppProviders'
import { ApiError } from '../../api/types'

export function LoginPage() {
  const { login } = useApp()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    try {
      await login(email, password)
      navigate('/')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign in')
    }
  }

  return (
    <form className="panel stack" style={{ maxWidth: 420, margin: '40px auto' }} onSubmit={(event) => void onSubmit(event)}>
      <h1>Sign in</h1>
      {error ? <p role="alert">{error}</p> : null}
      <label className="field">
        Email
        <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
      </label>
      <label className="field">
        Password
        <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={10} />
      </label>
      <button type="submit" className="btn primary">
        Sign in
      </button>
      <Link to="/forgot-password">Forgot password</Link>
      <Link to="/register">Create account</Link>
    </form>
  )
}
