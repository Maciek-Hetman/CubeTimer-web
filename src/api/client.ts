import { getApiBaseUrl } from '../config/env'
import { ApiError, type ApiErrorBody } from './types'

export interface RequestOptions {
  method?: string
  body?: unknown
  accessToken?: string | null
  headers?: Record<string, string>
}

export type AuthenticatedRequest = <T>(path: string, options?: Omit<RequestOptions, 'accessToken'>) => Promise<T>

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(options.headers ?? {}),
  }
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  if (options.accessToken) {
    headers.Authorization = `Bearer ${options.accessToken}`
  }
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
  if (response.status === 204) {
    return undefined as T
  }
  const text = await response.text()
  let payload: unknown
  if (text) {
    try {
      payload = JSON.parse(text) as unknown
    } catch {
      throw new ApiError(response.status, 'invalid_response', 'The server returned an invalid response')
    }
  }
  if (!response.ok) {
    const errorBody = payload as ApiErrorBody | undefined
    throw new ApiError(
      response.status,
      errorBody?.error?.code ?? 'unknown',
      errorBody?.error?.message ?? response.statusText,
    )
  }
  return payload as T
}
