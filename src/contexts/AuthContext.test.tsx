/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as authApi from '../api/auth'
import { ApiError, type AuthSession, type User } from '../api/types'
import { saveAuth, setCurrentOwnerId } from '../app/profile'
import { db, getMeta } from '../data/db'
import { AuthProvider } from './AuthProvider'
import { useAuth } from './AuthContext'

vi.mock('../api/auth', () => ({
  login: vi.fn(),
  register: vi.fn(),
  refresh: vi.fn(),
  logout: vi.fn(),
  forgotPassword: vi.fn(),
  resetPassword: vi.fn(),
  verifyEmail: vi.fn(),
  resendVerification: vi.fn(),
  changePassword: vi.fn(),
  deleteAccount: vi.fn(),
  federatedLogin: vi.fn(),
  linkFederatedIdentity: vi.fn(),
}))

function TestConsumer() {
  const { ready, ownerId, user, isAdmin, token, role } = useAuth()
  return (
    <div>
      <span data-testid="ready">{ready ? 'ready' : 'loading'}</span>
      <span data-testid="ownerId">{ownerId}</span>
      <span data-testid="user">{user?.email ?? 'anonymous'}</span>
      <span data-testid="isAdmin">{isAdmin ? 'admin' : 'user'}</span>
      <span data-testid="token">{token ?? 'none'}</span>
      <span data-testid="role">{role ?? 'none'}</span>
    </div>
  )
}

const storedUser: User = {
  id: 'u-stored',
  email: 'stored@example.com',
  email_verified: true,
  user_role: 'user',
}

async function seedStoredSession() {
  await saveAuth('ref-stored', storedUser)
  await setCurrentOwnerId(storedUser.id)
}

describe('AuthContext & AuthProvider', () => {
  beforeEach(async () => {
    cleanup()
    vi.clearAllMocks()
    await db.delete()
    await db.open()
  })

  afterEach(async () => {
    cleanup()
  })

  it('throws error when useAuth is used outside of AuthProvider', () => {
    expect(() => renderHook(() => useAuth())).toThrow('useAuth must be used within an AuthProvider')
  })

  it('initializes in guest mode when no stored session exists', async () => {
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('ready')).toHaveTextContent('ready')
    })
    expect(screen.getByTestId('user')).toHaveTextContent('anonymous')
    expect(screen.getByTestId('isAdmin')).toHaveTextContent('user')
    expect(screen.getByTestId('token')).toHaveTextContent('none')
  })

  it('logs in successfully and updates user state', async () => {
    const mockUser = {
      id: 'u-123',
      email: 'cubist@example.com',
      email_verified: true,
      user_role: 'admin' as const,
      created_at: '2026-01-01T00:00:00Z',
    }
    const mockSession: AuthSession = {
      access_token: 'acc-123',
      refresh_token: 'ref-123',
      token_type: 'Bearer',
      expires_in: 3600,
      user: mockUser,
    }
    vi.mocked(authApi.login).mockResolvedValueOnce(mockSession)

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    })

    await waitFor(() => {
      expect(result.current.ready).toBe(true)
    })

    await act(async () => {
      await result.current.login('cubist@example.com', 'password1234')
    })

    expect(authApi.login).toHaveBeenCalledWith('cubist@example.com', 'password1234')
    expect(result.current.user).toEqual(mockUser)
    expect(result.current.token).toBe('acc-123')
    expect(result.current.isAdmin).toBe(true)
    expect(result.current.role).toBe('admin')
    expect(result.current.ownerId).toBe('u-123')
  })

  it('signs in with Google and adopts the session', async () => {
    const mockUser = {
      id: 'u-google',
      email: 'google@example.com',
      email_verified: true,
      user_role: 'user' as const,
      created_at: '2026-01-01T00:00:00Z',
    }
    vi.mocked(authApi.federatedLogin).mockResolvedValueOnce({
      access_token: 'acc-google',
      refresh_token: 'ref-google',
      token_type: 'Bearer',
      expires_in: 3600,
      user: mockUser,
    })

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    })
    await waitFor(() => {
      expect(result.current.ready).toBe(true)
    })

    const input = { client_id: 'cid', nonce: 'n1', id_token: 'jwt' }
    await act(async () => {
      await result.current.loginWithGoogle(input)
    })

    expect(authApi.federatedLogin).toHaveBeenCalledWith('google', input)
    expect(result.current.user).toEqual(mockUser)
    expect(result.current.token).toBe('acc-google')
    expect(result.current.ownerId).toBe('u-google')
  })

  it('executes register, forgotPassword, resetPassword, and verifyEmail', async () => {
    vi.mocked(authApi.register).mockResolvedValueOnce({ status: 'ok' })
    vi.mocked(authApi.forgotPassword).mockResolvedValueOnce({ status: 'ok' })
    vi.mocked(authApi.resendVerification).mockResolvedValueOnce({ status: 'ok' })

    const mockUser = {
      id: 'u-456',
      email: 'newuser@example.com',
      email_verified: true,
      user_role: 'user' as const,
      created_at: '2026-01-01T00:00:00Z',
    }
    const mockSession: AuthSession = {
      access_token: 'acc-456',
      refresh_token: 'ref-456',
      token_type: 'Bearer',
      expires_in: 3600,
      user: mockUser,
    }
    vi.mocked(authApi.resetPassword).mockResolvedValueOnce(mockSession)
    vi.mocked(authApi.verifyEmail).mockResolvedValueOnce(mockSession)

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    })

    await waitFor(() => expect(result.current.ready).toBe(true))

    await act(async () => {
      await result.current.register('newuser@example.com', 'secretpassword')
      await result.current.requestPasswordReset('newuser@example.com')
      await result.current.resendVerificationEmail('newuser@example.com')
      await result.current.resetPassword('reset-tok', 'newpass1234')
    })

    expect(authApi.register).toHaveBeenCalledWith('newuser@example.com', 'secretpassword')
    expect(authApi.forgotPassword).toHaveBeenCalledWith('newuser@example.com')
    expect(authApi.resendVerification).toHaveBeenCalledWith('newuser@example.com')
    expect(authApi.resetPassword).toHaveBeenCalledWith('reset-tok', 'newpass1234')
    expect(result.current.user).toEqual(mockUser)
  })

  it('logs out and transitions back to guest', async () => {
    vi.mocked(authApi.logout).mockResolvedValueOnce()

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    })

    await waitFor(() => expect(result.current.ready).toBe(true))

    await act(async () => {
      await result.current.logout()
    })

    expect(result.current.user).toBeNull()
    expect(result.current.token).toBeNull()
    expect(result.current.isAdmin).toBe(false)
  })

  it('keeps the stored account signed in when startup refresh fails offline', async () => {
    await seedStoredSession()
    vi.mocked(authApi.refresh).mockRejectedValueOnce(new TypeError('Failed to fetch'))

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    })

    await waitFor(() => expect(result.current.ready).toBe(true))

    expect(authApi.refresh).toHaveBeenCalledWith('ref-stored')
    expect(result.current.ownerId).toBe('u-stored')
    expect(result.current.user).toEqual(storedUser)
    expect(result.current.token).toBeNull()
    expect(result.current.enqueueWrites).toBe(true)
    expect(await getMeta('auth.refresh', null)).toBe('ref-stored')
    expect(await getMeta('owner.current', null)).toBe('u-stored')

    vi.mocked(authApi.refresh).mockResolvedValueOnce({
      access_token: 'acc-recovered',
      refresh_token: 'ref-recovered',
      token_type: 'Bearer',
      expires_in: 3600,
      user: storedUser,
    })

    await act(async () => {
      await result.current.refreshAccessToken()
    })

    expect(authApi.refresh).toHaveBeenLastCalledWith('ref-stored')
    expect(result.current.token).toBe('acc-recovered')
    expect(result.current.ownerId).toBe('u-stored')
  })

  it('transitions to guest when startup refresh is rejected', async () => {
    await seedStoredSession()
    vi.mocked(authApi.refresh).mockRejectedValueOnce(
      new ApiError(401, 'invalid_refresh_token', 'Refresh token revoked'),
    )

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    })

    await waitFor(() => expect(result.current.ready).toBe(true))

    expect(result.current.user).toBeNull()
    expect(result.current.token).toBeNull()
    expect(result.current.ownerId).toMatch(/^guest:/)
    expect(await getMeta('auth.refresh', null)).toBeNull()
    expect(await getMeta('auth.user', null)).toBeNull()
  })
})
