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
