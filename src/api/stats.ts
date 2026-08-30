import type { AuthenticatedRequest } from './client'
import type { StatsResponse } from './types'

export function getServerStats(request: AuthenticatedRequest, event?: string): Promise<StatsResponse> {
  const query = event ? `?event=${encodeURIComponent(event)}` : ''
  return request<StatsResponse>(`/v1/stats${query}`)
}

export const getStats = getServerStats
