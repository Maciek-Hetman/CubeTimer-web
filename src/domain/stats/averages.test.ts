import { describe, expect, it } from 'vitest'
import type { Solve } from '../models'
import { averageFromValues, averageOfN, bestAverageOfN, bestSingle, trimCount } from './averages'

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

describe('averageFromValues trimming', () => {
  const cases = [
    [5, 1],
    [12, 1],
    [25, 2],
    [50, 3],
    [100, 5],
  ] as const

  it.each(cases)('trims ceil(5%%) from each end of Ao%i: %i', (n, trim) => {
    expect(trimCount(n)).toBe(trim)
  })

  it.each(cases)('Ao%i ignores %i outliers per end but not one more', (n, trim) => {
    const middle = Array<number>(n - 2 * trim).fill(10000)
    const fast = Array<number>(trim).fill(1)
    const slow = Array<number>(trim).fill(1_000_000)
    expect(averageFromValues([...slow, ...middle, ...fast], n)).toBe(10000)

    const extra = [1, ...Array<number>(n - 2 * trim - 2).fill(10000), 1_000_000]
    expect(averageFromValues([...slow, ...extra, ...fast], n)).not.toBe(10000)
  })

  it('computes a hand-checked Ao25', () => {
    const middle = Array.from({ length: 21 }, (_, i) => 10000 + i * 1000)
    const values = [50000, ...middle.slice(0, 10), 8000, 40000, ...middle.slice(10), 9000]
    expect(values).toHaveLength(25)
    // drops 8000, 9000, 40000, 50000 and averages 10000..30000
    expect(averageFromValues(values, 25)).toBe(20000)
  })

  it('keeps Ao25 valid with 2 DNFs', () => {
    const values = Array.from({ length: 25 }, (_, i) => 10000 + i * 1000) as Array<number | null>
    values[3] = null
    values[17] = null
    // DNFs fill the 2 worst slots; drops 10000 and 11000; (550000 - 10000 - 11000 - 13000 - 27000) / 21
    expect(averageFromValues(values, 25)).toBeCloseTo(489000 / 21, 6)
  })

  it('is DNF for Ao25 with 3 DNFs', () => {
    const values = Array<number | null>(25).fill(10000)
    values[0] = null
    values[10] = null
    values[24] = null
    expect(averageFromValues(values, 25)).toBeNull()
  })

  it('allows 5 DNFs in Ao100 but not 6', () => {
    const five = Array<number | null>(100).fill(10000)
    for (const i of [0, 20, 40, 60, 80]) {
      five[i] = null
    }
    expect(averageFromValues(five, 100)).toBe(10000)

    const six = [...five]
    six[99] = null
    expect(averageFromValues(six, 100)).toBeNull()
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
