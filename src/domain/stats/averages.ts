import { effectiveTimeMs, type Solve } from '../models'

export function averageOfN(solves: Solve[], n: number): number | null {
  if (n <= 0 || solves.length < n) {
    return null
  }
  return averageWindow(solves.slice(0, n), n)
}

export function bestAverageOfN(solves: Solve[], n: number): number | null {
  if (solves.length < n) {
    return null
  }
  let best: number | null = null
  for (let i = 0; i <= solves.length - n; i += 1) {
    const value = averageWindow(solves.slice(i, i + n), n)
    if (value === null) {
      continue
    }
    if (best === null || value < best) {
      best = value
    }
  }
  return best
}

export function bestSingle(solves: Solve[]): number | null {
  let best: number | null = null
  for (const solve of solves) {
    const value = effectiveTimeMs(solve)
    if (value === null) {
      continue
    }
    if (best === null || value < best) {
      best = value
    }
  }
  return best
}

export function meanOfSolves(solves: Solve[]): number | null {
  const values = solves
    .map((solve) => effectiveTimeMs(solve))
    .filter((value): value is number => value !== null)
  if (values.length === 0) {
    return null
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function worstSingle(solves: Solve[]): number | null {
  let worst: number | null = null
  for (const solve of solves) {
    const value = effectiveTimeMs(solve)
    if (value === null) {
      continue
    }
    if (worst === null || value > worst) {
      worst = value
    }
  }
  return worst
}

function averageWindow(window: Solve[], n: number): number | null {
  const values = window.map((solve) => effectiveTimeMs(solve))
  const dnfCount = values.filter((value) => value === null).length
  if (n < 3) {
    const valid = values.filter((value): value is number => value !== null)
    if (valid.length === 0) {
      return null
    }
    return valid.reduce((sum, value) => sum + value, 0) / valid.length
  }
  if (dnfCount > 1) {
    return null
  }
  const ranked = [...values]
  ranked.sort((a, b) => {
    if (a === null && b === null) {
      return 0
    }
    if (a === null) {
      return 1
    }
    if (b === null) {
      return -1
    }
    return a - b
  })
  const trimmed = ranked.slice(1, -1)
  if (trimmed.some((value) => value === null)) {
    return null
  }
  const numbers = trimmed as number[]
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length
}
