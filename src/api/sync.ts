import { apiRequest } from './client'
import type { SnapshotRequest, SnapshotResponse, SyncRequest, SyncResponse } from './types'

export interface SyncClientOptions {
  protocolVersion?: number
}

export function sync(
  accessToken: string,
  request: SyncRequest,
  options?: SyncClientOptions,
) {
  const headers: Record<string, string> = {}
  if (options?.protocolVersion !== undefined) {
    headers['X-Sync-Protocol'] = String(options.protocolVersion)
  }
  return apiRequest<SyncResponse>('/v1/sync', {
    method: 'POST',
    body: request,
    accessToken,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
  })
}

export function snapshot(accessToken: string, request: SnapshotRequest) {
  return apiRequest<SnapshotResponse>('/v1/snapshot', {
    method: 'POST',
    body: request,
    accessToken,
  })
}
