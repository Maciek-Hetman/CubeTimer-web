import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { snapshot, sync } from './sync'
import type { SnapshotRequest, SyncRequest } from './types'

describe('sync API clients', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    globalThis.fetch = vi.fn()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('sync calls POST /v1/sync with request body and Bearer token', async () => {
    const mockFetch = vi.mocked(globalThis.fetch)
    const mockResponse = {
      outcomes: [],
      changes: [],
      next_cursor: 42,
      has_more: false,
    }
    mockFetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
      text: async () => JSON.stringify(mockResponse),
    } as Response)

    const syncReq: SyncRequest = {
      cursor: 10,
      device: { id: 'dev-1', name: 'Browser', platform: 'web' },
      mutations: [],
      limit: 1000,
    }

    const res = await sync('jwt-token-123', syncReq)
    expect(res).toEqual(mockResponse)
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/sync'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer jwt-token-123',
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify(syncReq),
      }),
    )
  })

  it('sync attaches X-Sync-Protocol header when protocolVersion is specified', async () => {
    const mockFetch = vi.mocked(globalThis.fetch)
    mockFetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
      text: async () => JSON.stringify({ outcomes: [], changes: [], next_cursor: 1, has_more: false }),
    } as Response)

    const syncReq: SyncRequest = {
      cursor: 0,
      device: { id: 'dev-1', name: 'Browser', platform: 'web' },
      mutations: [],
    }

    await sync('jwt-token-123', syncReq, { protocolVersion: 2 })
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/sync'),
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Sync-Protocol': '2',
        }),
      }),
    )
  })

  it('snapshot calls POST /v1/snapshot with request body and Bearer token', async () => {
    const mockFetch = vi.mocked(globalThis.fetch)
    const mockResponse = {
      sessions: [],
      solves: [],
      cursor: 100,
      has_more: false,
    }
    mockFetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
      text: async () => JSON.stringify(mockResponse),
    } as Response)

    const snapReq: SnapshotRequest = {
      device: { id: 'dev-1', name: 'Browser', platform: 'web' },
      cursor: 0,
      after_id: '00000000-0000-0000-0000-000000000000',
      entity: 'session',
      page_size: 500,
    }

    const res = await snapshot('jwt-token-123', snapReq)
    expect(res).toEqual(mockResponse)
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/snapshot'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer jwt-token-123',
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify(snapReq),
      }),
    )
  })
})
