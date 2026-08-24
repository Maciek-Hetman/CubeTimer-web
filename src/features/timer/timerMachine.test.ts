import { describe, expect, it } from 'vitest'
import { createTimerEngine } from './timerMachine'

describe('timer machine', () => {
  it('cancels a hold released too early', () => {
    const engine = createTimerEngine(() => 500)
    engine.press(0)
    engine.tick(200)
    const snapshot = engine.release(200)
    expect(snapshot.phase).toBe('idle')
  })

  it('starts after a completed hold and records elapsed time on stop', () => {
    const engine = createTimerEngine(() => 500)
    engine.press(0)
    expect(engine.tick(500).phase).toBe('ready')
    expect(engine.release(500).phase).toBe('running')
    expect(engine.tick(1500).elapsedMs).toBe(1000)
    const finished = engine.press(1625)
    expect(finished.phase).toBe('finished')
    expect(finished.finishedMs).toBe(1125)
  })

  it('ignores extra presses while finished', () => {
    const engine = createTimerEngine(() => 100)
    engine.press(0)
    engine.tick(100)
    engine.release(100)
    engine.press(200)
    const again = engine.press(250)
    expect(again.phase).toBe('finished')
  })
})
