import { getApiBaseUrl } from '../config/env'
import { ApiError, type ApiErrorBody } from './types'

export interface RequestOptions {
  method?: string
  body?: unknown
  accessToken?: string | null
  retry?: boolean
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
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
  const payload = text ? (JSON.parse(text) as unknown) : undefined
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
