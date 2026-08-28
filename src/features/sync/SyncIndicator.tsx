import { useApp } from '../../app/AppProviders'
import { SYNC_HINTS, SYNC_LABELS, syncTone } from './syncStatus'

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

  if (!user.email_verified) {
    return (
      <div className="sync-pill" title="Verify your email to enable sync">
        <span className="sync-dot warn" />
        Verify email to sync
      </div>
    )
  }

  const tone = syncTone(syncStatus)
  const label = SYNC_LABELS[syncStatus] ?? syncStatus
  const hint = SYNC_HINTS[syncStatus] ?? 'Tap to sync'

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