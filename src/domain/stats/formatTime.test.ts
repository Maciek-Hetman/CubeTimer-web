import { describe, expect, it } from 'vitest'
import { formatAverage, formatDuration, formatSolveTime } from './formatTime'

describe('formatDuration', () => {
  it('formats sub-minute times', () => {
    expect(formatDuration(12340)).toBe('12.34')
  })

  it('formats minute times', () => {
    expect(formatDuration(65000)).toBe('1:05.00')
  })
})

describe('formatSolveTime', () => {
  it('marks plus two and dnf', () => {
    expect(formatSolveTime({ durationMs: 10000, penalty: 'plus_two' })).toBe('12.00+')
    expect(formatSolveTime({ durationMs: 10000, penalty: 'dnf' })).toBe('DNF')
  })
})

describe('formatAverage', () => {
  it('uses DNF for null averages', () => {
    expect(formatAverage(null)).toBe('DNF')
  })
})
