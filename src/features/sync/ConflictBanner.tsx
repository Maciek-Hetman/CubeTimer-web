import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../data/db'
import { useApp } from '../../app/AppProviders'

export function ConflictBanner() {
  const { ownerId, resolveConflictKeepLocal, resolveConflictKeepServer } = useApp()
  const conflicts = useLiveQuery(
    async () => (ownerId ? db.conflicts.where('ownerId').equals(ownerId).toArray() : []),
    [ownerId],
  ) ?? []
  const conflict = conflicts[0]
  if (!conflict) {
    return null
  }
  return (
    <div className="panel" role="alert" style={{ marginBottom: 12 }}>
      <strong>Sync conflict</strong>
      <p className="muted">{conflict.message}</p>
      <div className="row wrap">
        <button type="button" className="btn" onClick={() => void resolveConflictKeepServer(conflict.id)}>
          Keep server
        </button>
        <button type="button" className="btn primary" onClick={() => void resolveConflictKeepLocal(conflict.id)}>
          Keep mine
        </button>
      </div>
    </div>
  )
}
