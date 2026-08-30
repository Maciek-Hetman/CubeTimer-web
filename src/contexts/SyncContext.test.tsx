/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../data/db'
import { AuthProvider } from './AuthProvider'
import { SettingsProvider } from './SettingsProvider'
import { SyncProvider } from './SyncProvider'
import { useSync } from './SyncContext'

describe('SyncContext & SyncProvider', () => {
  beforeEach(async () => {
    await db.conflicts.clear()
    await db.rejections.clear()
    await db.outbox.clear()
    await db.settings.clear()
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
})
