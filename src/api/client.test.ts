import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiRequest } from './client'
import { ApiError } from './types'

describe('apiRequest client', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    globalThis.fetch = vi.fn()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('performs a default GET request with Accept header', async () => {
    const mockFetch = vi.mocked(globalThis.fetch)
    mockFetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
      text: async () => JSON.stringify({ status: 'ok' }),
    } as Response)

    const result = await apiRequest<{ status: string }>('/test')
    expect(result).toEqual({ status: 'ok' })
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/test'),
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Accept: 'application/json',
        }),
      }),
    )
  })

  it('handles 204 No Content by returning undefined', async () => {
    const mockFetch = vi.mocked(globalThis.fetch)
    mockFetch.mockResolvedValueOnce({
      status: 204,
      ok: true,
      text: async () => '',
    } as Response)

    const result = await apiRequest<void>('/v1/me', { method: 'DELETE' })
    expect(result).toBeUndefined()
  })

  it('includes Authorization header when accessToken is provided', async () => {
    const mockFetch = vi.mocked(globalThis.fetch)
    mockFetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
      text: async () => JSON.stringify({ id: 'user-1' }),
    } as Response)

    await apiRequest('/v1/me', { accessToken: 'secret-token' })
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/me'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer secret-token',
        }),
      }),
    )
  })

  it('includes Content-Type and serialized body for POST/PUT requests', async () => {
    const mockFetch = vi.mocked(globalThis.fetch)
    mockFetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
      text: async () => JSON.stringify({ success: true }),
    } as Response)

    await apiRequest('/v1/auth/login', {
      method: 'POST',
      body: { email: 'user@example.com', password: 'password123' },
    })

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/auth/login'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({ email: 'user@example.com', password: 'password123' }),
      }),
    )
  })

  it('merges custom headers when provided in options', async () => {
    const mockFetch = vi.mocked(globalThis.fetch)
    mockFetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
      text: async () => JSON.stringify({ outcomes: [], changes: [], next_cursor: 1, has_more: false }),
    } as Response)

    await apiRequest('/v1/sync', {
      method: 'POST',
      body: {},
      headers: { 'X-Sync-Protocol': '2' },
    })

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/sync'),
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Sync-Protocol': '2',
          Accept: 'application/json',
          'Content-Type': 'application/json',
        }),
      }),
    )
  })

  it('throws ApiError with structured error payload on non-ok responses', async () => {
    const mockFetch = vi.mocked(globalThis.fetch)
    mockFetch.mockResolvedValueOnce({
      status: 409,
      ok: false,
      statusText: 'Conflict',
      text: async () =>
        JSON.stringify({
          error: {
            code: 'cursor_expired',
            message: 'The sync cursor has expired and must be refreshed via snapshot.',
          },
        }),
    } as Response)

    await expect(apiRequest('/v1/sync', { method: 'POST', body: {} })).rejects.toThrow(
      new ApiError(409, 'cursor_expired', 'The sync cursor has expired and must be refreshed via snapshot.'),
    )
  })

  it('throws ApiError with invalid_response code on non-JSON payload text', async () => {
    const mockFetch = vi.mocked(globalThis.fetch)
    mockFetch.mockResolvedValueOnce({
      status: 502,
      ok: false,
      statusText: 'Bad Gateway',
      text: async () => '<html>502 Bad Gateway</html>',
    } as Response)

    await expect(apiRequest('/v1/sync')).rejects.toThrow(ApiError)
  })

  it('falls back to statusText when error body is not structured', async () => {
    const mockFetch = vi.mocked(globalThis.fetch)
    mockFetch.mockResolvedValueOnce({
      status: 500,
      ok: false,
      statusText: 'Internal Server Error',
      text: async () => JSON.stringify({}),
    } as Response)

    await expect(apiRequest('/v1/me')).rejects.toThrow(
      new ApiError(500, 'unknown', 'Internal Server Error'),
    )
  })
})
