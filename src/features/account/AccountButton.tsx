import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useSync } from '../../contexts/SyncContext'
import { UserIcon } from '../../ui/NavIcons'

export function AccountButton() {
  const { user } = useAuth()
  const { syncStatus } = useSync()
  const navigate = useNavigate()

  if (!user) {
    return (
      <Link to="/login" className="btn ghost compact">
        Sign in
      </Link>
    )
  }

  const tone = syncStatus === 'error' || syncStatus === 'conflict' ? 'bad' : syncStatus === 'offline' || syncStatus === 'pending' ? 'warn' : 'ok'

  return (
    <button
      type="button"
      className="btn ghost icon"
      style={{ position: 'relative' }}
      onClick={() => navigate('/account')}
      title="Account"
      aria-label="Account"
    >
      <UserIcon />
      <span className={`sync-dot ${tone}`} style={{ position: 'absolute', bottom: '6px', right: '6px', border: '1.5px solid var(--surface)' }} />
    </button>
  )
}

export function AccountTabIcon() {
  const { user } = useAuth()
  const { syncStatus } = useSync()
  
  if (!user) {
    return <UserIcon />
  }

  const tone = syncStatus === 'error' || syncStatus === 'conflict' ? 'bad' : syncStatus === 'offline' || syncStatus === 'pending' ? 'warn' : 'ok'

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <UserIcon />
      <span className={`sync-dot ${tone}`} style={{ position: 'absolute', bottom: '-2px', right: '-2px', border: '1.5px solid var(--surface)' }} />
    </div>
  )
}
