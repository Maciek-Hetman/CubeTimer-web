import { describe, expect, it } from 'vitest'
import { buildAdminStatsSearch, getErrorStats, getOverviewStats, getRequestStats } from './admin'
import type { AuthenticatedRequest } from './client'

describe('buildAdminStatsSearch', () => {
  it('returns an empty string when no query is provided', () => {
    expect(buildAdminStatsSearch()).toBe('')
  })

  it('encodes a valid range', () => {
    expect(
      buildAdminStatsSearch({
        from: '2026-08-01T00:00:00.000Z',
        to: '2026-08-08T00:00:00.000Z',
        interval: 'day',
      }),
    ).toBe('?from=2026-08-01T00%3A00%3A00.000Z&to=2026-08-08T00%3A00%3A00.000Z&interval=day')
  })

  it('rejects an inverted range', () => {
    expect(() =>
      buildAdminStatsSearch({
        from: '2026-08-08T00:00:00.000Z',
        to: '2026-08-01T00:00:00.000Z',
      }),
    ).toThrow(/from/)
  })

  it('rejects an invalid interval', () => {
    expect(() =>
      buildAdminStatsSearch({
        interval: 'week' as 'hour',
      }),
    ).toThrow(/interval/)
  })
})

describe('admin stats clients', () => {
  it('calls the documented admin paths', async () => {
    const paths: string[] = []
    const request: AuthenticatedRequest = async (path) => {
      paths.push(path)
      return {} as never
    }
    await getOverviewStats(request)
    await getRequestStats(request, { from: '2026-08-24T00:00:00.000Z', to: '2026-08-25T00:00:00.000Z', interval: 'hour' })
    await getErrorStats(request)
    expect(paths).toEqual([
      '/v1/admin/stats/overview',
      '/v1/admin/stats/requests?from=2026-08-24T00%3A00%3A00.000Z&to=2026-08-25T00%3A00%3A00.000Z&interval=hour',
      '/v1/admin/stats/errors',
    ])
  })
})
