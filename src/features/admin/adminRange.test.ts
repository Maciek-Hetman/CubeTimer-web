import { describe, expect, it } from 'vitest'
import { adminStatsQueryForRange } from './adminRange'

describe('adminStatsQueryForRange', () => {
  const now = new Date('2026-08-25T12:00:00.000Z')

  it('uses hourly buckets for 24 hours', () => {
    expect(adminStatsQueryForRange('24h', now)).toEqual({
      from: '2026-08-24T12:00:00.000Z',
      to: '2026-08-25T12:00:00.000Z',
      interval: 'hour',
    })
  })

  it('uses daily buckets for 7 and 30 days', () => {
    expect(adminStatsQueryForRange('7d', now)).toEqual({
      from: '2026-08-18T12:00:00.000Z',
      to: '2026-08-25T12:00:00.000Z',
      interval: 'day',
    })
    expect(adminStatsQueryForRange('30d', now)).toEqual({
      from: '2026-07-26T12:00:00.000Z',
      to: '2026-08-25T12:00:00.000Z',
      interval: 'day',
    })
  })
})
