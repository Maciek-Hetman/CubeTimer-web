export type TimerPhase = 'idle' | 'holding' | 'ready' | 'running' | 'finished'

export interface TimerSnapshot {
  phase: TimerPhase
  holdProgress: number
  elapsedMs: number
  finishedMs: number | null
}

export const IDLE_TIMER: TimerSnapshot = {
  phase: 'idle',
  holdProgress: 0,
  elapsedMs: 0,
  finishedMs: null,
}

export interface TimerEngine {
  getSnapshot(): TimerSnapshot
  press(now: number): TimerSnapshot
  release(now: number): TimerSnapshot
  cancel(): TimerSnapshot
  tick(now: number): TimerSnapshot
  reset(): TimerSnapshot
}

export function createTimerEngine(getHoldMs: () => number): TimerEngine {
  let phase: TimerPhase = 'idle'
  let holdStartedAt = 0
  let runStartedAt = 0
  let holdProgress = 0
  let elapsedMs = 0
  let finishedMs: number | null = null

  function snapshot(): TimerSnapshot {
    return { phase, holdProgress, elapsedMs, finishedMs }
  }

  return {
    getSnapshot: snapshot,
    press(now) {
      if (phase === 'idle') {
        phase = 'holding'
        holdStartedAt = now
        holdProgress = 0
        return snapshot()
      }
      if (phase === 'running') {
        phase = 'finished'
        finishedMs = Math.max(0, now - runStartedAt)
        elapsedMs = finishedMs
        return snapshot()
      }
      return snapshot()
    },
    release(now) {
      if (phase === 'holding') {
        phase = 'idle'
        holdProgress = 0
        return snapshot()
      }
      if (phase === 'ready') {
        phase = 'running'
        runStartedAt = now
        elapsedMs = 0
        holdProgress = 1
        return snapshot()
      }
      return snapshot()
    },
    cancel() {
      if (phase === 'holding' || phase === 'ready') {
        phase = 'idle'
        holdProgress = 0
        return snapshot()
      }
      return snapshot()
    },
    tick(now) {
      if (phase === 'holding') {
        const holdMs = Math.max(1, getHoldMs())
        holdProgress = Math.min(1, (now - holdStartedAt) / holdMs)
        if (holdProgress >= 1) {
          phase = 'ready'
          holdProgress = 1
        }
        return snapshot()
      }
      if (phase === 'running') {
        elapsedMs = Math.max(0, now - runStartedAt)
        return snapshot()
      }
      return snapshot()
    },
    reset() {
      phase = 'idle'
      holdProgress = 0
      elapsedMs = 0
      finishedMs = null
      return snapshot()
    },
  }
}

export function isTimerBusy(phase: TimerPhase): boolean {
  return phase === 'holding' || phase === 'ready' || phase === 'running'
}
