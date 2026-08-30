/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as authApi from '../api/auth'
import type { AuthSession } from '../api/types'
import { db } from '../data/db'
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
})
