import { getApiBaseUrl } from '../config/env'
import { ApiError, type ApiErrorBody } from './types'

export interface RequestOptions {
  method?: string
  body?: unknown
  accessToken?: string | null
  headers?: Record<string, string>
  /** Gives up after this long, including reading the body. */
  timeoutMs?: number
}

export type AuthenticatedRequest = <T>(path: string, options?: Omit<RequestOptions, 'accessToken'>) => Promise<T>

// Without a limit, one stalled connection leaves sync (and the cross-tab auth lock) waiting forever.
const DEFAULT_TIMEOUT_MS = 30_000

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
  const signal = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  let response: Response
  let text: string
  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal,
    })
    if (response.status === 204) {
      return undefined as T
    }
    text = await response.text()
  } catch (error) {
    if (signal.aborted && (signal.reason as Error | undefined)?.name === 'TimeoutError') {
      throw new ApiError(0, 'timeout', 'The server took too long to respond')
    }
    throw error
  }
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
