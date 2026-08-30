import type { AuthenticatedRequest } from './client'
import type { PaginatedSessionsResponse, PaginatedSolvesResponse } from './types'

export interface HistoryPaginationQuery {
  limit?: number
  cursor?: string
}

export function buildHistorySearch(query: HistoryPaginationQuery = {}): string {
  const params = new URLSearchParams()
  if (query.limit !== undefined) {
    params.set('limit', String(query.limit))
  }
  if (query.cursor !== undefined) {
    params.set('cursor', query.cursor)
  }
  const search = params.toString()
  return search ? `?${search}` : ''
}

export function getServerSessions(
  request: AuthenticatedRequest,
  query: HistoryPaginationQuery = {},
): Promise<PaginatedSessionsResponse> {
  return request<PaginatedSessionsResponse>(`/v1/sessions${buildHistorySearch(query)}`)
}

export function getServerSolves(
  request: AuthenticatedRequest,
  sessionId: string,
  query: HistoryPaginationQuery = {},
): Promise<PaginatedSolvesResponse> {
  return request<PaginatedSolvesResponse>(
    `/v1/sessions/${encodeURIComponent(sessionId)}/solves${buildHistorySearch(query)}`,
  )
}

export const listSessions = getServerSessions
export const listSessionSolves = getServerSolves
