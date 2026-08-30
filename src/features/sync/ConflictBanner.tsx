import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../data/db'
import { useAuth } from '../../contexts/AuthContext'
import { useSync } from '../../contexts/SyncContext'
import { Alert } from '../../ui/Alert'
import { Button } from '../../ui/Button'

export function ConflictBanner() {
  const { ownerId } = useAuth()
  const { resolveConflictKeepLocal, resolveConflictKeepServer } = useSync()
  const conflicts =
    useLiveQuery(async () => (ownerId ? db.conflicts.where('ownerId').equals(ownerId).toArray() : []), [ownerId]) ??
    []
  const conflict = conflicts[0]
  if (!conflict) {
    return null
  }
  return (
    <Alert tone="warning">
      <strong>Sync conflict{conflicts.length > 1 ? ` · ${conflicts.length} remaining` : ''}</strong>
      <p className="muted" style={{ margin: '6px 0 10px' }}>
        {conflict.message}
      </p>
      <div className="row wrap">
        <Button type="button" onClick={() => void resolveConflictKeepServer(conflict.id)}>
          Keep server
        </Button>
        <Button type="button" variant="primary" onClick={() => void resolveConflictKeepLocal(conflict.id)}>
          Keep mine
        </Button>
      </div>
    </Alert>
  )
}
