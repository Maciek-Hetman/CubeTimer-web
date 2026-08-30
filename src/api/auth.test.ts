import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  changePassword,
  deleteAccount,
  federatedLogin,
  forgotPassword,
  getMe,
  linkFederatedIdentity,
  login,
  logout,
  refresh,
  register,
  resendVerification,
  resetPassword,
  verifyEmail,
} from './auth'
import type { AuthenticatedRequest } from './client'

describe('auth & account API clients', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    globalThis.fetch = vi.fn()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('register calls POST /v1/auth/register with credentials', async () => {
    const mockFetch = vi.mocked(globalThis.fetch)
    mockFetch.mockResolvedValueOnce({
      status: 202,
      ok: true,
      text: async () => JSON.stringify({ status: 'pending_verification' }),
    } as Response)

    const res = await register('test@example.com', 'password1234')
    expect(res).toEqual({ status: 'pending_verification' })
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/auth/register'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'test@example.com', password: 'password1234' }),
      }),
    )
  })

  it('resendVerification calls POST /v1/auth/email/resend', async () => {
    const mockFetch = vi.mocked(globalThis.fetch)
    mockFetch.mockResolvedValueOnce({
      status: 202,
      ok: true,
      text: async () => JSON.stringify({ status: 'sent' }),
    } as Response)

    const res = await resendVerification('test@example.com')
    expect(res).toEqual({ status: 'sent' })
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/auth/email/resend'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'test@example.com' }),
      }),
    )
  })

  it('verifyEmail calls POST /v1/auth/email/verify with token', async () => {
    const mockFetch = vi.mocked(globalThis.fetch)
    const mockSession = {
      access_token: 'acc-1',
      refresh_token: 'ref-1',
      token_type: 'Bearer',
      expires_in: 3600,
      user: { id: 'u1', email: 'test@example.com', email_verified: true, user_role: 'user' },
    }
    mockFetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
      text: async () => JSON.stringify(mockSession),
    } as Response)

    const res = await verifyEmail('verify-token-123')
    expect(res).toEqual(mockSession)
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/auth/email/verify'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ token: 'verify-token-123' }),
      }),
    )
  })

  it('login calls POST /v1/auth/login with credentials', async () => {
    const mockFetch = vi.mocked(globalThis.fetch)
    const mockSession = {
      access_token: 'acc-1',
      refresh_token: 'ref-1',
      token_type: 'Bearer',
      expires_in: 3600,
      user: { id: 'u1', email: 'test@example.com', email_verified: true, user_role: 'user' },
    }
    mockFetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
      text: async () => JSON.stringify(mockSession),
    } as Response)

    const res = await login('test@example.com', 'password123')
    expect(res).toEqual(mockSession)
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/auth/login'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'test@example.com', password: 'password123' }),
      }),
    )
  })

  it('refresh calls POST /v1/auth/refresh with refresh_token', async () => {
    const mockFetch = vi.mocked(globalThis.fetch)
    const mockSession = {
      access_token: 'acc-2',
      refresh_token: 'ref-2',
      token_type: 'Bearer',
      expires_in: 3600,
      user: { id: 'u1', email: 'test@example.com', email_verified: true, user_role: 'user' },
    }
    mockFetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
      text: async () => JSON.stringify(mockSession),
    } as Response)

    const res = await refresh('ref-1')
    expect(res).toEqual(mockSession)
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/auth/refresh'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ refresh_token: 'ref-1' }),
      }),
    )
  })

  it('logout calls POST /v1/auth/logout with refresh_token', async () => {
    const mockFetch = vi.mocked(globalThis.fetch)
    mockFetch.mockResolvedValueOnce({
      status: 204,
      ok: true,
      text: async () => '',
    } as Response)

    await logout('ref-token')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/auth/logout'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ refresh_token: 'ref-token' }),
      }),
    )
  })

  it('forgotPassword calls POST /v1/auth/password/forgot', async () => {
    const mockFetch = vi.mocked(globalThis.fetch)
    mockFetch.mockResolvedValueOnce({
      status: 202,
      ok: true,
      text: async () => JSON.stringify({ status: 'sent' }),
    } as Response)

    const res = await forgotPassword('test@example.com')
    expect(res).toEqual({ status: 'sent' })
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/auth/password/forgot'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'test@example.com' }),
      }),
    )
  })

  it('resetPassword calls POST /v1/auth/password/reset with token and new password', async () => {
    const mockFetch = vi.mocked(globalThis.fetch)
    const mockSession = {
      access_token: 'acc-1',
      refresh_token: 'ref-1',
      token_type: 'Bearer',
      expires_in: 3600,
      user: { id: 'u1', email: 'test@example.com', email_verified: true, user_role: 'user' },
    }
    mockFetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
      text: async () => JSON.stringify(mockSession),
    } as Response)

    const res = await resetPassword('token-123', 'newSecretPassword123')
    expect(res).toEqual(mockSession)
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/auth/password/reset'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ token: 'token-123', new_password: 'newSecretPassword123' }),
      }),
    )
  })

  it('federatedLogin calls POST /v1/auth/federated/google with input payload', async () => {
    const mockFetch = vi.mocked(globalThis.fetch)
    const mockSession = {
      access_token: 'acc-fed',
      refresh_token: 'ref-fed',
      token_type: 'Bearer',
      expires_in: 3600,
      user: { id: 'u-fed', email: 'fed@example.com', email_verified: true, user_role: 'user' },
    }
    mockFetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
      text: async () => JSON.stringify(mockSession),
    } as Response)

    const input = { client_id: 'cid', nonce: 'nonce123', id_token: 'google-jwt' }
    const res = await federatedLogin('google', input)
    expect(res).toEqual(mockSession)
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/auth/federated/google'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(input),
      }),
    )
  })

  it('linkFederatedIdentity calls POST /v1/auth/link/google with input payload', async () => {
    const calls: Array<{ path: string; method?: string; body?: unknown }> = []
    const request: AuthenticatedRequest = async (path, options) => {
      calls.push({ path, method: options?.method, body: options?.body })
      return {} as never
    }
    const input = { client_id: 'cid', nonce: 'nonce123', id_token: 'google-jwt' }
    await linkFederatedIdentity(request, 'google', input)
    expect(calls).toEqual([
      {
        path: '/v1/auth/link/google',
        method: 'POST',
        body: input,
      },
    ])
  })

  it('getMe calls GET /v1/me with accessToken', async () => {
    const mockFetch = vi.mocked(globalThis.fetch)
    const mockUser = { id: 'u1', email: 'test@example.com', email_verified: true, user_role: 'user' }
    mockFetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
      text: async () => JSON.stringify(mockUser),
    } as Response)

    const res = await getMe('my-access-token')
    expect(res).toEqual(mockUser)
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/me'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer my-access-token',
        }),
      }),
    )
  })

  it('changes the password on the documented path', async () => {
    const calls: Array<{ path: string; method?: string; body?: unknown }> = []
    const request: AuthenticatedRequest = async (path, options) => {
      calls.push({ path, method: options?.method, body: options?.body })
      return {} as never
    }
    await changePassword(request, 'old-pass', 'new-pass')
    expect(calls).toEqual([
      {
        path: '/v1/me/password',
        method: 'PUT',
        body: { current_password: 'old-pass', new_password: 'new-pass' },
      },
    ])
  })

  it('deletes the account on the documented path', async () => {
    const calls: Array<{ path: string; method?: string }> = []
    const request: AuthenticatedRequest = async (path, options) => {
      calls.push({ path, method: options?.method })
      return {} as never
    }
    await deleteAccount(request)
    expect(calls).toEqual([{ path: '/v1/me', method: 'DELETE' }])
  })
})