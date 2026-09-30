import { describe, expect, it } from 'vitest'
import type { ChartPoint } from '../../data/repositories/solveStats'
import { formatAxisSeconds, formatChartSeconds, solveTicks } from './chartAxes'

function points(first: number, last: number): ChartPoint[] {
  return [first, last].map((index) => ({ index, time: 12, ao5: null, ao12: null }))
}

describe('solveTicks', () => {
  it('puts ticks on round solve numbers inside the plotted range', () => {
    expect(solveTicks(points(1, 1336))).toEqual([250, 500, 750, 1000, 1250])
    expect(solveTicks(points(1237, 1336))).toEqual([1240, 1260, 1280, 1300, 1320])
    expect(solveTicks(points(1087, 1336))).toEqual([1100, 1150, 1200, 1250, 1300])
  })

  it('never ticks between two solves', () => {
    expect(solveTicks(points(1, 5))).toEqual([1, 2, 3, 4, 5])
    for (const ticks of [solveTicks(points(1, 13)), solveTicks(points(3, 40))]) {
      expect(ticks?.every(Number.isInteger)).toBe(true)
    }
  })

  it('leaves a lone point to Recharts', () => {
    expect(solveTicks(points(1, 1).slice(0, 1))).toBeUndefined()
    expect(solveTicks([])).toBeUndefined()
  })
})

describe('formatChartSeconds', () => {
  it('reads like the other times on the page', () => {
    expect(formatChartSeconds(12.35)).toBe('12.35')
    expect(formatChartSeconds(65.4)).toBe('1:05.40')
  })

  it('truncates averages to centiseconds like formatAverage does', () => {
    expect(formatChartSeconds(11669.6 / 1000)).toBe('11.66')
    expect(formatChartSeconds(11666.666 / 1000)).toBe('11.66')
  })
})

describe('formatAxisSeconds', () => {
  it('shows seconds, then minutes past a minute', () => {
    expect(formatAxisSeconds(15)).toBe('15')
    expect(formatAxisSeconds(12.5)).toBe('12.5')
    expect(formatAxisSeconds(90)).toBe('1:30')
  })
})
