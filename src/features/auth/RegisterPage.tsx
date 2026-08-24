import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../../app/AppProviders'
import { ApiError } from '../../api/types'

export function RegisterPage() {
  const { register } = useApp()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    try {
      await register(email, password)
      setMessage('Check your email for a verification link.')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not register')
    }
  }

  return (
    <form className="panel stack" style={{ maxWidth: 420, margin: '40px auto' }} onSubmit={(event) => void onSubmit(event)}>
      <h1>Create account</h1>
      {error ? <p role="alert">{error}</p> : null}
      {message ? <p>{message}</p> : null}
      <label className="field">
        Email
        <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
      </label>
      <label className="field">
        Password (at least 10 characters)
        <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={10} />
      </label>
      <button type="submit" className="btn primary">
        Register
      </button>
      <Link to="/login">Already have an account</Link>
    </form>
  )
}
