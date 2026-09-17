import { averageFromValues, trimCount } from './averages'

// Integers up to 2^46 keep any sum of 100 of them exact (< 2^53)
const EXACT_LIMIT = 2 ** 46

function isExact(value: number): boolean {
  return Number.isInteger(value) && Math.abs(value) <= EXACT_LIMIT
}

/**
 * Sliding window over the last n values (null = DNF) that returns exactly what
 * `averageFromValues(window, n)` would, without copying or sorting per step. Valid
 * values are kept sorted via binary-search insert/remove in a fixed buffer.
 *
 * When every value in the window is a (bounded) integer, all partial sums are exact,
 * so the trimmed sum is derived from a running total minus the few trimmed values.
 * Otherwise it falls back to summing the kept values in ascending order, the same
 * order the reference uses, so floating results are identical either way.
 */
export class RollingAverage {
  readonly n: number
  private readonly trim: number
  private readonly ring: Float64Array
  private readonly dnf: Uint8Array
  private readonly sorted: Float64Array
  private head = 0
  private size = 0
  private validCount = 0
  private exactCount = 0
  private exactTotal = 0

  constructor(n: number) {
    this.n = n
    this.trim = trimCount(n)
    this.ring = new Float64Array(Math.max(n, 0))
    this.dnf = new Uint8Array(Math.max(n, 0))
    this.sorted = new Float64Array(Math.max(n, 0))
  }

  push(value: number | null): void {
    const n = this.n
    if (n <= 0) {
      return
    }
    let slot: number
    if (this.size === n) {
      slot = this.head
      if (this.dnf[slot] === 0) {
        this.removeSorted(this.ring[slot])
      }
      this.head = (this.head + 1) % n
    } else {
      slot = (this.head + this.size) % n
      this.size += 1
    }
    this.ring[slot] = value ?? 0
    this.dnf[slot] = value === null ? 1 : 0
    if (value !== null) {
      this.insertSorted(value)
    }
  }

  get full(): boolean {
    return this.n > 0 && this.size === this.n
  }

  average(): number | null {
    const n = this.n
    if (!this.full) {
      return null
    }
    if (n < 3) {
      return averageFromValues(this.values(), n)
    }
    const trim = this.trim
    const validCount = this.validCount
    if (n - validCount > trim) {
      return null
    }
    const sorted = this.sorted
    let sum = 0
    if (this.exactCount === validCount) {
      sum = this.exactTotal
      for (let i = 0; i < trim; i += 1) {
        sum -= sorted[i]
      }
      for (let i = n - trim; i < validCount; i += 1) {
        sum -= sorted[i]
      }
    } else {
      for (let i = trim; i < n - trim; i += 1) {
        sum += sorted[i]
      }
    }
    return sum / (n - 2 * trim)
  }

  private values(): Array<number | null> {
    const out: Array<number | null> = []
    for (let i = 0; i < this.size; i += 1) {
      const slot = (this.head + i) % this.n
      out.push(this.dnf[slot] === 1 ? null : this.ring[slot])
    }
    return out
  }

  private lowerBound(value: number): number {
    let lo = 0
    let hi = this.validCount
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (this.sorted[mid] < value) {
        lo = mid + 1
      } else {
        hi = mid
      }
    }
    return lo
  }

  private insertSorted(value: number): void {
    const at = this.lowerBound(value)
    this.sorted.copyWithin(at + 1, at, this.validCount)
    this.sorted[at] = value
    this.validCount += 1
    if (isExact(value)) {
      this.exactCount += 1
      this.exactTotal += value
    }
  }

  private removeSorted(value: number): void {
    const at = this.lowerBound(value)
    this.sorted.copyWithin(at, at + 1, this.validCount)
    this.validCount -= 1
    if (isExact(value)) {
      this.exactCount -= 1
      this.exactTotal -= value
    }
  }
}
