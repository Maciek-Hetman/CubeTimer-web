import { useApp } from '../../app/AppProviders'

const LABELS: Record<string, string> = {
  idle: 'Synced',
  pending: 'Waiting to sync',
  syncing: 'Syncing',
  offline: 'Offline',
  error: 'Sync error',
  conflict: 'Conflict',
}

export function SyncIndicator() {
  const { user, syncStatus, pendingMutations, requestSync } = useApp()
  if (!user) {
    return <div className="sync-pill">Local only</div>
  }
  return (
    <button type="button" className="sync-pill btn ghost" onClick={() => requestSync()}>
      {LABELS[syncStatus] ?? syncStatus}
      {pendingMutations > 0 ? ` · ${pendingMutations}` : ''}
    </button>
  )
}
