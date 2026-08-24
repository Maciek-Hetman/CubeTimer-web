import { useApp } from '../../app/AppProviders'

const LABELS: Record<string, string> = {
  idle: 'Synced',
  pending: 'Waiting to sync',
  syncing: 'Syncing',
  offline: 'Offline',
  error: 'Sync error',
  conflict: 'Conflict',
}

const HINTS: Record<string, string> = {
  idle: 'Everything is up to date. Tap to sync again.',
  pending: 'Local changes are waiting to upload.',
  syncing: 'Syncing with the server…',
  offline: 'You are offline. Changes stay on this device until you reconnect.',
  error: 'Sync failed. Tap to retry.',
  conflict: 'A sync conflict needs your attention below.',
}

export function SyncIndicator() {
  const { user, syncStatus, pendingMutations, requestSync } = useApp()
  if (!user) {
    return (
      <div className="sync-pill" title="Times stay on this device until you sign in">
        <span className="sync-dot" />
        Local only
      </div>
    )
  }

  const tone = syncStatus === 'error' || syncStatus === 'conflict' ? 'bad' : syncStatus === 'offline' || syncStatus === 'pending' ? 'warn' : 'ok'
  const label = LABELS[syncStatus] ?? syncStatus
  const hint = HINTS[syncStatus] ?? 'Tap to sync'

  return (
    <button
      type="button"
      className="sync-pill btn ghost"
      onClick={() => requestSync()}
      title={hint}
      aria-label={`${label}. ${hint}`}
    >
      <span className={`sync-dot ${tone}`} />
      {label}
      {pendingMutations > 0 ? ` · ${pendingMutations}` : ''}
    </button>
  )
}
