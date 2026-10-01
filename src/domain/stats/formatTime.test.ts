import { describe, expect, it } from 'vitest'
import { formatAverage, formatDuration, formatSolveTime, formatTimeSpent } from './formatTime'

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

describe('formatTimeSpent', () => {
  it('drops seconds once it reaches an hour', () => {
    expect(formatTimeSpent(178_151_000)).toBe('49h 29m')
    expect(formatTimeSpent(7_200_000)).toBe('2h')
  })

  it('keeps seconds under an hour', () => {
    expect(formatTimeSpent(3_599_000)).toBe('59m 59s')
    expect(formatTimeSpent(45_000)).toBe('45s')
    expect(formatTimeSpent(0)).toBe('0s')
  })
})
