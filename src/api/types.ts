export interface ApiErrorBody {
  error: {
    code: string
    message: string
  }
}

export interface User {
  id: string
  email: string
  email_verified: boolean
  user_role: 'user' | 'admin'
}

export interface AuthSession {
  access_token: string
  refresh_token: string
  token_type: 'Bearer'
  expires_in: number
  user: User
}

export interface Device {
  id: string
  name: string
  platform: string
}

export interface Mutation {
  id: string
  entity: 'session' | 'solve'
  entity_id: string
  operation: 'upsert' | 'delete'
  base_version: number
  data?: Record<string, unknown>
}

export interface MutationOutcome {
  mutation_id: string
  status: 'accepted' | 'rejected' | 'conflict'
  version?: number
  code?: string
  message?: string
  current?: Record<string, unknown>
}

export interface Change {
  cursor: number
  entity: 'session' | 'solve'
  entity_id: string
  operation: 'upsert' | 'delete'
  version: number
  data: Record<string, unknown>
  changed_at: string
}

export interface SyncRequest {
  cursor: number
  device: Device
  mutations: Mutation[]
  limit?: number
}

export interface SyncResponse {
  outcomes: MutationOutcome[]
  changes: Change[]
  next_cursor: number
  has_more: boolean
}

export type StatsInterval = 'hour' | 'day'

export interface AdminStatsQuery {
  from?: string
  to?: string
  interval?: StatsInterval
}

export interface AdminOverviewStats {
  total_users: number
  verified_users: number
  new_users_24h: number
  new_users_7d: number
  new_users_30d: number
  active_users_24h: number
  active_users_7d: number
  active_users_30d: number
  total_devices: number
  total_sessions: number
  total_solves: number
}

export interface AdminRequestStatsPoint {
  bucket: string
  request_count: number
  status_2xx: number
  status_3xx: number
  status_4xx: number
  status_5xx: number
  average_duration_ms: number
  max_duration_ms: number
}

export interface AdminRequestStats {
  from: string
  to: string
  interval: StatsInterval
  points: AdminRequestStatsPoint[]
}

export interface AdminErrorStatsPoint {
  bucket: string
  method: string
  route: string
  status_code: number
  request_count: number
}

export interface AdminErrorStats {
  from: string
  to: string
  interval: StatsInterval
  points: AdminErrorStatsPoint[]
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}
