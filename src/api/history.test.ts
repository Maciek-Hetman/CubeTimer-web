import { describe, expect, it } from 'vitest'
import {
  buildHistorySearch,
  getServerSessions,
  getServerSolves,
  listSessions,
  listSessionSolves,
} from './history'
import type { AuthenticatedRequest } from './client'
import type { PaginatedSessionsResponse, PaginatedSolvesResponse } from './types'

describe('history API clients', () => {
  it('buildHistorySearch builds empty string for empty query', () => {
    expect(buildHistorySearch({})).toBe('')
  })

  it('buildHistorySearch formats limit and cursor', () => {
    expect(buildHistorySearch({ limit: 25, cursor: 'cursor-123' })).toBe('?limit=25&cursor=cursor-123')
  })

  it('getServerSessions calls /v1/sessions with pagination parameters', async () => {
    const calls: Array<{ path: string }> = []
    const mockSessions: PaginatedSessionsResponse = {
      sessions: [
        {
          id: 'sess-1',
          name: 'Morning 3x3',
          event: '3x3',
          kind: 'manual',
          started_at: '2026-08-29T08:00:00Z',
          archived: false,
          solve_count: 12,
        },
      ],
      next_cursor: 'cursor-next',
      has_more: true,
    }

    const request: AuthenticatedRequest = async (path) => {
      calls.push({ path })
      return mockSessions as never
    }

    const res = await getServerSessions(request, { limit: 10, cursor: 'c1' })
    expect(res).toEqual(mockSessions)
    expect(calls).toEqual([{ path: '/v1/sessions?limit=10&cursor=c1' }])
  })

  it('getServerSolves calls /v1/sessions/{id}/solves with pagination', async () => {
    const calls: Array<{ path: string }> = []
    const mockSolves: PaginatedSolvesResponse = {
      solves: [
        {
          id: 'solve-1',
          session_id: 'sess-1',
          duration_ms: 12500,
          penalty: 'none',
          solved_at: '2026-08-29T08:05:00Z',
          scramble: "R U R' U'",
          event: '3x3',
          version: 1,
          updated_at: '2026-08-29T08:05:00Z',
        },
      ],
      next_cursor: undefined,
      has_more: false,
    }

    const request: AuthenticatedRequest = async (path) => {
      calls.push({ path })
      return mockSolves as never
    }

    const res = await getServerSolves(request, 'sess-1', { limit: 50 })
    expect(res).toEqual(mockSolves)
    expect(calls).toEqual([{ path: '/v1/sessions/sess-1/solves?limit=50' }])
  })

  it('aliases listSessions and listSessionSolves work identically', async () => {
    const calls: Array<{ path: string }> = []
    const request: AuthenticatedRequest = async (path) => {
      calls.push({ path })
      return {} as never
    }

    await listSessions(request)
    await listSessionSolves(request, 'sess-abc')

    expect(calls).toEqual([{ path: '/v1/sessions' }, { path: '/v1/sessions/sess-abc/solves' }])
  })
})
