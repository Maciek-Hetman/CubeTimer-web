import { describe, expect, it } from 'vitest'
import { isTokenExpired, shouldSkipSync } from './syncPolicy'

describe('isTokenExpired', () => {
  it('is not expired when no expiry is tracked', () => {
    expect(isTokenExpired(0, 1_000)).toBe(false)
  })

  it('is not expired while the token is still valid', () => {
    expect(isTokenExpired(100_000, 50_000)).toBe(false)
  })

  it('is expired after the skew window even if the TTL has not fully elapsed', () => {
    expect(isTokenExpired(100_000, 70_500)).toBe(true)
  })

  it('is expired once the token has expired', () => {
    expect(isTokenExpired(100_000, 110_000)).toBe(true)
  })
})

describe('shouldSkipSync', () => {
  const now = 1_000_000

  it('never skips when there are pending mutations', () => {
    expect(
      shouldSkipSync({ pendingMutations: 1, lastSyncedAt: new Date(now - 1_000).toISOString(), nowMs: now, minIntervalMs: 30_000 }),
    ).toBe(false)
  })

  it('syncs when there is no record of a prior sync', () => {
    expect(shouldSkipSync({ pendingMutations: 0, lastSyncedAt: null, nowMs: now, minIntervalMs: 30_000 })).toBe(false)
  })

  it('skips when the last sync is fresher than the minimum interval', () => {
    expect(
      shouldSkipSync({ pendingMutations: 0, lastSyncedAt: new Date(now - 5_000).toISOString(), nowMs: now, minIntervalMs: 30_000 }),
    ).toBe(true)
  })

  it('syncs when the last sync is older than the minimum interval', () => {
    expect(
      shouldSkipSync({ pendingMutations: 0, lastSyncedAt: new Date(now - 60_000).toISOString(), nowMs: now, minIntervalMs: 30_000 }),
    ).toBe(false)
  })
})