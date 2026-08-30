import { describe, expect, it } from 'vitest'
import { getServerStats, getStats } from './stats'
import type { AuthenticatedRequest } from './client'
import type { StatsResponse } from './types'

describe('stats API clients', () => {
  it('getServerStats calls GET /v1/stats when no event is specified', async () => {
    const calls: Array<{ path: string; method?: string }> = []
    const mockStats: StatsResponse = {
      total_count: 50,
      counted_count: 48,
      dnf_count: 2,
      min_ms: 8250,
      max_ms: 19400,
      mean_ms: 12450.5,
      stddev_ms: 1820.3,
      total_ms: 597624,
      ao5: 11200,
      ao12: 11850,
    }

    const request: AuthenticatedRequest = async (path, options) => {
      calls.push({ path, method: options?.method })
      return mockStats as never
    }

    const res = await getServerStats(request)
    expect(res).toEqual(mockStats)
    expect(calls).toEqual([{ path: '/v1/stats', method: undefined }])
  })

  it('getServerStats includes encoded event query parameter', async () => {
    const calls: Array<{ path: string }> = []
    const request: AuthenticatedRequest = async (path) => {
      calls.push({ path })
      return {} as never
    }

    await getServerStats(request, '3x3')
    expect(calls).toEqual([{ path: '/v1/stats?event=3x3' }])
  })

  it('getStats alias works identically', async () => {
    const calls: Array<{ path: string }> = []
    const request: AuthenticatedRequest = async (path) => {
      calls.push({ path })
      return {} as never
    }

    await getStats(request, 'pyraminx')
    expect(calls).toEqual([{ path: '/v1/stats?event=pyraminx' }])
  })
})
