import { describe, expect, it } from 'vitest'
import { formatSecondsTick, integerTicks, niceStep, niceValueScale } from './chartAxis'

describe('niceStep', () => {
  it('snaps to 1, 2 or 5 times a power of ten', () => {
    expect(niceStep(10, 5)).toBe(2)
    expect(niceStep(640, 6)).toBe(100)
    expect(niceStep(99, 4)).toBe(20)
    expect(niceStep(0.8, 5)).toBeCloseTo(0.2)
    expect(niceStep(30, 5)).toBe(5)
  })

  it('falls back to 1 for an empty span', () => {
    expect(niceStep(0, 5)).toBe(1)
  })
})

describe('niceValueScale', () => {
  it('pads the data range and ends on round ticks', () => {
    const scale = niceValueScale(8.6, 29.4)
    expect(scale.step).toBe(5)
    expect(scale.domain).toEqual([5, 30])
    expect(scale.ticks).toEqual([5, 10, 15, 20, 25, 30])
  })

  it('zooms into a tight range with fractional steps', () => {
    const scale = niceValueScale(14.21, 14.93)
    expect(scale.step).toBeCloseTo(0.2)
    expect(scale.domain[0]).toBeLessThan(14.21)
    expect(scale.domain[1]).toBeGreaterThan(14.93)
    expect(scale.ticks).toEqual([14, 14.2, 14.4, 14.6, 14.8, 15])
  })

  it('keeps the tick count near the target', () => {
    for (const [min, max] of [[14.21, 14.93], [9.7, 10.3], [8.6, 29.4], [55, 125], [0.5, 3.2]]) {
      expect(niceValueScale(min, max, 5).ticks.length).toBeLessThanOrEqual(7)
    }
  })

  it('never goes below zero', () => {
    expect(niceValueScale(0.2, 3).domain[0]).toBe(0)
  })

  it('gives a flat series some room', () => {
    const scale = niceValueScale(12, 12)
    expect(scale.domain[0]).toBeLessThan(12)
    expect(scale.domain[1]).toBeGreaterThan(12)
  })
})

describe('integerTicks', () => {
  it('stays inside the range', () => {
    expect(integerTicks(1, 640, 6)).toEqual([100, 200, 300, 400, 500, 600])
    expect(integerTicks(541, 640, 4)).toEqual([560, 580, 600, 620, 640])
  })

  it('never uses fractional steps', () => {
    expect(integerTicks(1, 3, 8)).toEqual([1, 2, 3])
  })

  it('handles a single point', () => {
    expect(integerTicks(7, 7)).toEqual([7])
  })
})

describe('formatSecondsTick', () => {
  it('uses only the decimals the step needs', () => {
    expect(formatSecondsTick(15, 5)).toBe('15')
    expect(formatSecondsTick(14.4, 0.2)).toBe('14.4')
    expect(formatSecondsTick(14.25, 0.05)).toBe('14.25')
  })

  it('switches to m:ss past a minute', () => {
    expect(formatSecondsTick(60, 20)).toBe('1:00')
    expect(formatSecondsTick(125, 5)).toBe('2:05')
    expect(formatSecondsTick(62.5, 0.5)).toBe('1:02.5')
  })
})
