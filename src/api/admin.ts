import type { AuthenticatedRequest } from './client'
import type {
  AdminErrorLogResponse,
  AdminOverviewStats,
  AdminRequestStats,
  AdminRequestTypeStats,
  AdminStatsQuery,
  StatsInterval,
} from './types'

const INTERVALS = new Set<StatsInterval>(['hour', 'day'])

export function buildAdminStatsSearch(query: AdminStatsQuery = {}): string {
  const params = new URLSearchParams()
  if (query.from !== undefined) {
    assertDateTime(query.from, 'from')
    params.set('from', query.from)
  }
  if (query.to !== undefined) {
    assertDateTime(query.to, 'to')
    params.set('to', query.to)
  }
  if (query.from && query.to && Date.parse(query.from) >= Date.parse(query.to)) {
    throw new Error('Stats range "from" must be earlier than "to"')
  }
  if (query.interval !== undefined) {
    if (!INTERVALS.has(query.interval)) {
      throw new Error('Stats interval must be hour or day')
    }
    params.set('interval', query.interval)
  }
  const search = params.toString()
  return search ? `?${search}` : ''
}

export function getOverviewStats(request: AuthenticatedRequest) {
  return request<AdminOverviewStats>('/v1/admin/stats/overview')
}

export function getRequestStats(request: AuthenticatedRequest, query: AdminStatsQuery = {}) {
  return request<AdminRequestStats>(`/v1/admin/stats/requests${buildAdminStatsSearch(query)}`)
}

export function getRequestTypeStats(request: AuthenticatedRequest, query: AdminStatsQuery = {}) {
  return request<AdminRequestTypeStats>(`/v1/admin/stats/request-types${buildAdminStatsSearch(query)}`)
}

export interface AdminErrorLogsQuery {
  before?: string
}

export function getErrorLogs(request: AuthenticatedRequest, query: AdminErrorLogsQuery = {}) {
  const params = new URLSearchParams()
  if (query.before) {
    assertDateTime(query.before, 'before')
    params.set('before', query.before)
  }
  const search = params.toString()
  return request<AdminErrorLogResponse>(`/v1/admin/stats/errors${search ? `?${search}` : ''}`)
}

function assertDateTime(value: string, name: string) {
  if (!Number.isFinite(Date.parse(value))) {
    throw new Error(`Stats range "${name}" must be a valid date-time`)
  }
}
