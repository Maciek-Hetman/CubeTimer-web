import { describe, expect, it } from 'vitest'
import type { Solve } from '../models'
import { averageOfN, bestAverageOfN, bestSingle } from './averages'

function solve(durationMs: number, penalty: Solve['penalty'] = 'none'): Solve {
  return {
    id: crypto.randomUUID(),
    ownerId: 'guest',
    sessionId: null,
    durationMs,
    penalty,
    solvedAt: new Date().toISOString(),
    scramble: 'R U',
    event: '3x3',
    version: 0,
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  }
}

describe('averageOfN', () => {
  it('returns null until the window is full', () => {
    expect(averageOfN([solve(1000), solve(2000)], 5)).toBeNull()
  })

  it('drops best and worst for windows of 3+', () => {
    const solves = [solve(10000), solve(12000), solve(11000), solve(13000), solve(9000)]
    expect(averageOfN(solves, 5)).toBe(11000)
  })

  it('treats a single DNF as the worst result', () => {
    const solves = [solve(10000), solve(12000), solve(11000), solve(13000), solve(9000, 'dnf')]
    expect(averageOfN(solves, 5)).toBe(12000)
  })

  it('is DNF when more than one DNF is present', () => {
    const solves = [solve(10000, 'dnf'), solve(12000), solve(11000), solve(13000), solve(9000, 'dnf')]
    expect(averageOfN(solves, 5)).toBeNull()
  })

  it('adds two seconds for plus two penalties', () => {
    const solves = [solve(10000, 'plus_two'), solve(12000), solve(11000)]
    expect(averageOfN(solves, 3)).toBe(12000)
  })
})

describe('bestAverageOfN', () => {
  it('finds the lowest sliding window', () => {
    const solves = [
      solve(20000),
      solve(20000),
      solve(20000),
      solve(10000),
      solve(11000),
      solve(12000),
    ]
    expect(bestAverageOfN(solves, 3)).toBe(11000)
  })
})

describe('bestSingle', () => {
  it('ignores DNF and uses plus-two adjusted time', () => {
    expect(bestSingle([solve(9000, 'dnf'), solve(8000, 'plus_two'), solve(11000)])).toBe(10000)
  })
})
