const DEFAULT_API_URL = 'http://127.0.0.1:43781'

export function getApiBaseUrl(): string {
  const value = import.meta.env.VITE_CUBESYNC_URL
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.replace(/\/$/, '')
  }
  return DEFAULT_API_URL
}
