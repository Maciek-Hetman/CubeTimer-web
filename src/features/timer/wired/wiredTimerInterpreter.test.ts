import { describe, expect, it } from 'vitest'
import type { SmartTimerEvent } from '../bluetooth/types'
import type { StackmatHeader } from './signalDecoder'
import { createWiredTimerInterpreter } from './wiredTimerInterpreter'

/** Feeds `[header, timeMs]` packets and returns the events they produce. */
function run(packets: Array<[StackmatHeader | null, number]>): SmartTimerEvent[] {
  const events: SmartTimerEvent[] = []
  const interpreter = createWiredTimerInterpreter((event) => events.push(event))
  for (const [header, timeMs] of packets) {
    interpreter.push({ header, timeMs })
  }
  return events
}

/** A solve as a timer counts it: a packet about every 110 ms, then a few repeats of the final time. */
function solve(header: StackmatHeader | null, finalMs: number, stoppedHeader = header): Array<[StackmatHeader | null, number]> {
  const packets: Array<[StackmatHeader | null, number]> = []
  for (let t = 37; t < finalMs; t += 110) {
    packets.push([header, t])
  }
  return [...packets, [stoppedHeader, finalMs], [stoppedHeader, finalMs], [stoppedHeader, finalMs]]
}

const solves = (events: SmartTimerEvent[]) => events.filter((e) => e.state === 'running' || e.state === 'stopped')

describe('createWiredTimerInterpreter', () => {
  it('follows a Speed Stacks Gen 3 timer, which reports hands and stops explicitly', () => {
    const events = run([
      ['I', 0],
      ['L', 0],
      ['C', 0],
      ['A', 0],
      [' ', 20],
      [' ', 130],
      ['S', 190],
      ['S', 190],
    ])
    expect(events).toEqual([
      { state: 'idle' },
      { state: 'hands_on' },
      { state: 'ready' },
      { state: 'running', elapsedMs: 20 },
      { state: 'stopped', timeMs: 190 },
    ])
  })

  it("follows a Gen 4 timer, which only sends ' ' while running and 'I' otherwise", () => {
    const events = run([['I', 0], ['I', 0], ...solve(' ', 9_871, 'I'), ['I', 0]])
    expect(events).toEqual([
      { state: 'idle' },
      { state: 'running', elapsedMs: 37 },
      { state: 'stopped', timeMs: 9_871 },
      { state: 'idle' },
    ])
  })

  it("follows a GAN Halo, which sends 'I' throughout", () => {
    expect(solves(run([['I', 0], ...solve('I', 12_340)]))).toEqual([
      { state: 'running', elapsedMs: 37 },
      { state: 'stopped', timeMs: 12_340 },
    ])
  })

  it("follows a clone that sends 'S' throughout", () => {
    expect(solves(run([['S', 0], ...solve('S', 8_000)]))).toEqual([
      { state: 'running', elapsedMs: 37 },
      { state: 'stopped', timeMs: 8_000 },
    ])
  })

  it('follows a MoYu timer, which has no status at all', () => {
    expect(solves(run([[null, 0], ...solve(null, 6_543)]))).toEqual([
      { state: 'running', elapsedMs: 37 },
      { state: 'stopped', timeMs: 6_543 },
    ])
  })

  it('picks up a solve already running when the cable is plugged in', () => {
    expect(solves(run([['I', 5_000], ['I', 5_110], ['I', 5_220], ['I', 7_000], ['I', 7_000]]))).toEqual([
      { state: 'running', elapsedMs: 5_220 },
      { state: 'stopped', timeMs: 7_000 },
    ])
  })

  it('ignores a corrupted packet while the timer shows a finished time', () => {
    expect(solves(run([['I', 12_340], ['I', 12_340], ['I', 12_430], ['I', 12_340], ['I', 12_340]]))).toEqual([])
  })

  it('ignores a corrupted packet during a solve', () => {
    expect(solves(run([['I', 0], ['I', 50], ['I', 160], ['I', 71], ['I', 270], ['I', 300], ['I', 300]]))).toEqual([
      { state: 'running', elapsedMs: 50 },
      { state: 'stopped', timeMs: 300 },
    ])
  })

  it('drops the solve when the timer is reset mid-solve', () => {
    const events = run([['I', 0], ['I', 50], ['I', 160], ['I', 0], ['I', 0]])
    expect(events).toEqual([{ state: 'idle' }, { state: 'running', elapsedMs: 50 }, { state: 'idle' }])
  })

  it('never saves a zero time', () => {
    expect(solves(run([['I', 0], ['I', 30], ['I', 0], ['I', 0]]))).toEqual([{ state: 'running', elapsedMs: 30 }])
  })

  it('treats the next packet after reset() as a fresh start', () => {
    const events: SmartTimerEvent[] = []
    const interpreter = createWiredTimerInterpreter((event) => events.push(event))
    interpreter.push({ header: 'I', timeMs: 0 })
    interpreter.push({ header: 'I', timeMs: 40 })
    interpreter.reset()
    interpreter.push({ header: 'I', timeMs: 400 })
    interpreter.push({ header: 'I', timeMs: 400 })
    expect(events).toEqual([{ state: 'idle' }, { state: 'running', elapsedMs: 40 }, { state: 'idle' }])
  })
})
