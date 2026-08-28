import type { SyncStatus } from '../../sync/syncEngine'

export const SYNC_LABELS: Record<string, string> = {
  idle: 'Synced',
  pending: 'Waiting to sync',
  syncing: 'Syncing',
  offline: 'Offline',
  error: 'Sync error',
  conflict: 'Conflict',
}

export const SYNC_HINTS: Record<string, string> = {
  idle: 'Everything is up to date. Tap to sync again.',
  pending: 'Local changes are waiting to upload.',
  syncing: 'Syncing with the server…',
  offline: 'You are offline. Changes stay on this device until you reconnect.',
  error: 'Sync failed. Tap to retry.',
  conflict: 'A sync conflict needs your attention below.',
}

export function syncTone(status: SyncStatus): 'ok' | 'warn' | 'bad' {
  return status === 'error' || status === 'conflict' ? 'bad' : status === 'offline' || status === 'pending' ? 'warn' : 'ok'
}