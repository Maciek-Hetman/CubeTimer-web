import { describe, expect, it } from 'vitest'
import type { Penalty, Solve } from '../models'
import { effectiveTimeMs } from '../models'
import { averageFromValues, averageOfN, bestAverageOfN } from './averages'
import { RollingAverage } from './rollingAverage'

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Profile {
  dnfRate: number
  plusTwoRate: number
  // Small ranges force ties; fractional durations exercise the non-integer path
  range: number
  fractional: boolean
}

const PROFILES: Profile[] = [
  { dnfRate: 0, plusTwoRate: 0, range: 20000, fractional: false },
  { dnfRate: 0.05, plusTwoRate: 0.1, range: 20000, fractional: false },
  { dnfRate: 0.2, plusTwoRate: 0.1, range: 4, fractional: false },
  { dnfRate: 0.5, plusTwoRate: 0.2, range: 3000, fractional: false },
  { dnfRate: 0.05, plusTwoRate: 0.1, range: 20000, fractional: true },
  { dnfRate: 0.1, plusTwoRate: 0, range: 3, fractional: true },
]

const WINDOWS = [1, 2, 3, 4, 5, 12, 25, 50, 100]

function makeSolves(rand: () => number, count: number, profile: Profile): Solve[] {
  const solves: Solve[] = []
  for (let i = 0; i < count; i += 1) {
    const roll = rand()
    const penalty: Penalty =
      roll < profile.dnfRate ? 'dnf' : roll < profile.dnfRate + profile.plusTwoRate ? 'plus_two' : 'none'
    const base = 5000 + Math.floor(rand() * profile.range)
    const durationMs = profile.fractional ? base + Math.floor(rand() * 3) * 0.1 : base
    solves.push({
      id: `solve-${i}`,
      ownerId: 'owner',
      sessionId: null,
      durationMs,
      penalty,
      solvedAt: new Date(Date.UTC(2026, 0, 1) + i * 1000).toISOString(),
      scramble: '',
      event: '3x3',
      version: 0,
      updatedAt: '2026-01-01T00:00:00.000Z',
      deletedAt: null,
    })
  }
  return solves
}

describe('RollingAverage', () => {
  it('matches averageFromValues on every step for randomized sequences', () => {
    const rand = mulberry32(20260917)
    for (const profile of PROFILES) {
      for (const n of WINDOWS) {
        for (const length of [n - 1, n, n + 1, 2 * n + 3, 400]) {
          const values = makeSolves(rand, Math.max(length, 0), profile).map((solve) => effectiveTimeMs(solve))
          const rolling = new RollingAverage(n)
          for (let i = 0; i < values.length; i += 1) {
            rolling.push(values[i])
            const expected = i + 1 >= n ? averageFromValues(values.slice(i + 1 - n, i + 1), n) : null
            expect(rolling.average()).toBe(expected)
          }
        }
      }
    }
  })

  it('reproduces averageOfN and bestAverageOfN over solve lists', () => {
    const rand = mulberry32(42)
    for (const profile of PROFILES) {
      for (const n of WINDOWS) {
        for (const length of [n - 1, n, n + 1, 3 * n + 7]) {
          // Newest-first, as the averages helpers expect
          const solves = makeSolves(rand, Math.max(length, 0), profile).reverse()
          const rolling = new RollingAverage(n)
          let best: number | null = null
          let current: number | null = null
          solves.forEach((solve, i) => {
            rolling.push(effectiveTimeMs(solve))
            const value = rolling.average()
            if (i === n - 1) {
              current = value
            }
            if (value !== null && (best === null || value < best)) {
              best = value
            }
          })
          expect(current).toBe(averageOfN(solves, n))
          expect(best).toBe(bestAverageOfN(solves, n))
        }
      }
    }
  })

  it('treats values that are not exact integers without drift after they leave the window', () => {
    const values = [1e15 + 0.5, 0.1, 0.2, 0.3, 0.7, 11, 12, 13, 14, 15, 16]
    const rolling = new RollingAverage(5)
    values.forEach((value, i) => {
      rolling.push(value)
      const expected = i >= 4 ? averageFromValues(values.slice(i - 4, i + 1), 5) : null
      expect(rolling.average()).toBe(expected)
    })
  })

  it('returns null for non-positive window sizes', () => {
    const rolling = new RollingAverage(0)
    rolling.push(1000)
    expect(rolling.full).toBe(false)
    expect(rolling.average()).toBeNull()
  })
})
