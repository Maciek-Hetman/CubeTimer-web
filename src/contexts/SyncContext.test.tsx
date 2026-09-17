/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../data/db'
import { AuthContext, type AuthContextValue } from './AuthContext'
import { AuthProvider } from './AuthProvider'
import { SettingsProvider } from './SettingsProvider'
import { SyncProvider } from './SyncProvider'
import { useSync } from './SyncContext'

const mocks = vi.hoisted(() => ({
  runSync: vi.fn(),
}))

vi.mock('../sync/syncEngine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../sync/syncEngine')>()),
  runSync: mocks.runSync,
}))

function authWrapper(auth: Partial<AuthContextValue>) {
  const value = {
    ready: true,
    ownerId: 'u-1',
    user: { id: 'u-1', email: 'me@example.com', email_verified: true, user_role: 'user' },
    token: null,
    refreshAccessToken: vi.fn(),
    ...auth,
  } as AuthContextValue
  return ({ children }: { children: ReactNode }) => (
    <AuthContext.Provider value={value}>
      <SyncProvider>{children}</SyncProvider>
    </AuthContext.Provider>
  )
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

describe('SyncContext & SyncProvider', () => {
  beforeEach(async () => {
    await db.conflicts.clear()
    await db.rejections.clear()
    await db.outbox.clear()
    await db.settings.clear()
    await db.meta.clear()
    mocks.runSync.mockReset()
    mocks.runSync.mockResolvedValue({ status: 'idle', conflicts: 0, rejected: 0 })
  })

  afterEach(() => {
    cleanup()
  })

  it('throws error when useSync is used outside of SyncProvider', () => {
    expect(() => renderHook(() => useSync())).toThrow('useSync must be used within a SyncProvider')
  })

  it('initializes with idle sync status for guest', async () => {
    const { result } = renderHook(() => useSync(), {
      wrapper: ({ children }) => (
        <AuthProvider>
          <SettingsProvider>
            <SyncProvider>{children}</SyncProvider>
          </SettingsProvider>
        </AuthProvider>
      ),
    })

    expect(result.current.syncStatus).toBe('idle')
    expect(result.current.isOnline).toBe(true)
    expect(result.current.pendingMutations).toBe(0)
    expect(result.current.conflicts).toBe(0)
    expect(result.current.rejectedCount).toBe(0)
  })

  it('handles conflict resolution functions', async () => {
    const { result } = renderHook(() => useSync(), {
      wrapper: ({ children }) => (
        <AuthProvider>
          <SettingsProvider>
            <SyncProvider>{children}</SyncProvider>
          </SettingsProvider>
        </AuthProvider>
      ),
    })

    await db.conflicts.put({
      id: 'conflict-1',
      ownerId: 'u-1',
      entity: 'session',
      entityId: 'sess-1',
      message: 'Version conflict',
      createdAt: '2026-01-01T00:00:00Z',
      local: {
        id: 'sess-1',
        ownerId: 'u-1',
        name: 'Local',
        event: '3x3',
        kind: 'manual',
        startedAt: '2026-01-01T00:00:00Z',
        endedAt: null,
        archived: false,
        updatedAt: '2026-01-01T00:00:00Z',
        deletedAt: null,
        version: 1,
      },
      current: {
        id: 'sess-1',
        ownerId: 'u-1',
        name: 'Server',
        event: '3x3',
        kind: 'manual',
        startedAt: '2026-01-01T00:00:00Z',
        endedAt: null,
        archived: false,
        updatedAt: '2026-01-01T00:00:00Z',
        deletedAt: null,
        version: 2,
      },
    })

    await act(async () => {
      await result.current.resolveConflictKeepServer('conflict-1')
    })

    const remaining = await db.conflicts.get('conflict-1')
    expect(remaining).toBeUndefined()
  })

  it('dismisses all rejected mutations', async () => {
    const { result } = renderHook(() => useSync(), {
      wrapper: ({ children }) => (
        <AuthProvider>
          <SettingsProvider>
            <SyncProvider>{children}</SyncProvider>
          </SettingsProvider>
        </AuthProvider>
      ),
    })

    await act(async () => {
      await result.current.dismissAllRejected()
    })

    expect(result.current.rejectedCount).toBe(0)
  })

  it('reuses a valid access token without refreshing', async () => {
    const refreshAccessToken = vi.fn().mockResolvedValue('refreshed-token')
    renderHook(() => useSync(), {
      wrapper: authWrapper({ token: 'current-token', refreshAccessToken }),
    })

    await waitFor(() => expect(mocks.runSync).toHaveBeenCalledTimes(1))
    expect(mocks.runSync.mock.calls[0][0].accessToken).toBe('current-token')
    expect(refreshAccessToken).not.toHaveBeenCalled()
  })

  it('refreshes the access token when none is available', async () => {
    const refreshAccessToken = vi.fn().mockResolvedValue('refreshed-token')
    renderHook(() => useSync(), {
      wrapper: authWrapper({ token: null, refreshAccessToken }),
    })

    await waitFor(() => expect(mocks.runSync).toHaveBeenCalledTimes(1))
    expect(refreshAccessToken).toHaveBeenCalledTimes(1)
    expect(mocks.runSync.mock.calls[0][0].accessToken).toBe('refreshed-token')
  })

  it('does not run overlapping syncs concurrently and reruns afterwards', async () => {
    let active = 0
    let maxActive = 0
    let finishFirstSync = () => {}
    mocks.runSync.mockImplementationOnce(async () => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise<void>((resolve) => {
        finishFirstSync = resolve
      })
      active -= 1
      return { status: 'idle', conflicts: 0, rejected: 0 }
    })
    let resolveFirstRefresh: (token: string) => void = () => {}
    const refreshAccessToken = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            resolveFirstRefresh = resolve
          }),
      )
      .mockResolvedValue('second-token')
    renderHook(() => useSync(), {
      wrapper: authWrapper({ token: null, refreshAccessToken }),
    })

    await waitFor(() => expect(refreshAccessToken).toHaveBeenCalledTimes(1))
    // A second trigger lands while the first sync is still awaiting its token.
    await act(async () => {
      window.dispatchEvent(new Event('focus'))
      await delay(600)
    })
    expect(refreshAccessToken).toHaveBeenCalledTimes(1)
    expect(mocks.runSync).not.toHaveBeenCalled()

    await act(async () => {
      resolveFirstRefresh('first-token')
    })
    await waitFor(() => expect(mocks.runSync).toHaveBeenCalledTimes(1))
    await act(async () => {
      finishFirstSync()
    })
    await waitFor(() => expect(mocks.runSync).toHaveBeenCalledTimes(2))
    expect(maxActive).toBe(1)
  })
})
