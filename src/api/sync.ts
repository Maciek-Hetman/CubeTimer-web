import { apiRequest } from './client'
import type { SyncRequest, SyncResponse } from './types'

export function sync(accessToken: string, request: SyncRequest) {
  return apiRequest<SyncResponse>('/v1/sync', {
    method: 'POST',
    body: request,
    accessToken,
  })
}
