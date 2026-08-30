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

export interface HealthResponse {
  status: string
}

export type Health = HealthResponse

export interface StatusResponse {
  status: string
}

export type Status = StatusResponse

export interface ChangePasswordRequest {
  current_password?: string
  new_password: string
}

export interface PasswordCredentials {
  email: string
  password: string
}

export interface RefreshTokenRequest {
  refresh_token: string
}

export type RefreshToken = RefreshTokenRequest

export type FederatedProvider = 'google'

export interface FederatedInput {
  client_id: string
  nonce: string
  id_token?: string
  code?: string
  redirect_uri?: string
  code_verifier?: string
}

export interface Device {
  id: string
  name: string
  platform: string
}

export interface ApiSession {
  id: string
  name: string
  event: string
  kind: string
  started_at: string
  ended_at?: string | null
  archived: boolean
  version: number
  updated_at: string
  deleted_at?: string | null
}

export interface ApiSolve {
  id: string
  session_id?: string | null
  duration_ms: number
  penalty: string
  solved_at: string
  scramble: string
  event: string
  version: number
  updated_at: string
  deleted_at?: string | null
}

export interface Mutation {
  id: string
  entity: 'session' | 'solve'
  entity_id: string
  operation: 'upsert' | 'delete'
  base_version: number
  data?: Record<string, unknown>
}

export interface DeleteStub {
  id: string
  version: number
  deleted_at: string | null
}

export interface ConflictStub {
  id: string
  version: number
  updated_at: string
}

export interface MutationOutcome {
  mutation_id: string
  status: 'accepted' | 'rejected' | 'conflict'
  version?: number
  code?: string
  message?: string
  current?: Record<string, unknown> | DeleteStub | ConflictStub | ApiSession | ApiSolve
}

export interface Change {
  cursor: number
  entity: 'session' | 'solve'
  entity_id: string
  operation: 'upsert' | 'delete'
  version: number
  data: Record<string, unknown> | DeleteStub | ApiSession | ApiSolve
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

export interface SnapshotRequest {
  device: Device
  cursor?: number
  after_id?: string
  entity?: 'session' | 'solve'
  page_size?: number
}

export interface SnapshotResponse {
  sessions?: ApiSession[]
  solves?: ApiSolve[]
  cursor: number
  has_more: boolean
  next_entity?: 'session' | 'solve'
  next_after_id?: string
}

export interface StatsResponse {
  total_count: number
  counted_count: number
  dnf_count: number
  min_ms: number
  max_ms: number
  mean_ms: number
  stddev_ms: number
  total_ms: number
  ao5?: number
  ao12?: number
  ao50?: number
  ao100?: number
}

export interface SessionSummary {
  id: string
  name?: string
  event?: string
  kind?: string
  started_at?: string
  ended_at?: string | null
  archived?: boolean
  solve_count?: number
}

export interface PaginatedSessionsResponse {
  sessions?: SessionSummary[]
  next_cursor?: string
  has_more?: boolean
}

export interface PaginatedSolvesResponse {
  solves?: ApiSolve[]
  next_cursor?: string
  has_more?: boolean
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

export interface AdminRequestTypeCount {
  type: 'auth' | 'account' | 'sync' | 'snapshot' | 'sessions' | 'stats' | 'other'
  request_count: number
}

export interface AdminRequestTypeStats {
  from: string
  to: string
  interval: StatsInterval
  types: AdminRequestTypeCount[]
}

export interface ErrorLog {
  id: number
  created_at: string
  user_id?: string | null
  method: string
  route: string
  status: number
  code: string
  message: string
}

export type AdminErrorLog = ErrorLog

export interface ErrorLogResponse {
  errors: ErrorLog[]
  next_cursor?: string
}

export type AdminErrorLogResponse = ErrorLogResponse
export type { AuthenticatedRequest } from './client'

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
