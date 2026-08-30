type TimerPhase = 'idle' | 'holding' | 'ready' | 'running' | 'finished'

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
  start(now: number): TimerSnapshot
  stop(now: number): TimerSnapshot
  press(now: number): TimerSnapshot
  release(now: number): TimerSnapshot
  cancel(): TimerSnapshot
  tick(now: number): TimerSnapshot
  reset(): TimerSnapshot
  setHoldDelay?(ms: number): void
}

export function createTimerEngine(getHoldMs?: () => number): TimerEngine {
  let holdMsValue = 500
  let phase: TimerPhase = 'idle'
  let holdStartedAt = 0
  let runStartedAt = 0
  let holdProgress = 0
  let elapsedMs = 0
  let finishedMs: number | null = null

  function snapshot(): TimerSnapshot {
    return { phase, holdProgress, elapsedMs, finishedMs }
  }

  function holdDurationMs(): number {
    const duration = getHoldMs ? getHoldMs() : holdMsValue
    return Number.isFinite(duration) ? Math.max(0, duration) : 0
  }

  function normalizeTime(now?: number): number {
    if (typeof now === 'number' && Number.isFinite(now) && now >= 0) {
      return now
    }
    return typeof performance !== 'undefined' ? performance.now() : Date.now()
  }

  function beginRun(now: number): void {
    phase = 'running'
    runStartedAt = normalizeTime(now)
    elapsedMs = 0
    finishedMs = null
    holdProgress = 1
  }

  function finishRun(now: number): void {
    const t = normalizeTime(now)
    phase = 'finished'
    finishedMs = Math.max(0, t - runStartedAt)
    elapsedMs = finishedMs
  }

  function startHold(now: number): void {
    holdStartedAt = normalizeTime(now)
    holdProgress = 0
    if (holdDurationMs() === 0) {
      phase = 'ready'
      holdProgress = 1
      return
    }
    phase = 'holding'
  }

  return {
    getSnapshot: snapshot,
    start(now) {
      if (phase === 'idle' || phase === 'finished') {
        beginRun(now)
      }
      return snapshot()
    },
    stop(now) {
      if (phase === 'running') {
        finishRun(now)
      }
      return snapshot()
    },
    press(now) {
      if (phase === 'idle') {
        startHold(now)
        return snapshot()
      }
      if (phase === 'running') {
        finishRun(now)
        return snapshot()
      }
      if (phase === 'finished') {
        startHold(now)
        elapsedMs = 0
        finishedMs = null
        return snapshot()
      }
      return snapshot()
    },
    release(now) {
      const t = normalizeTime(now)
      if (phase === 'holding') {
        const holdMs = holdDurationMs()
        if (holdMs === 0 || t - holdStartedAt >= holdMs) {
          beginRun(t)
        } else {
          phase = 'idle'
          holdProgress = 0
        }
        return snapshot()
      }
      if (phase === 'ready') {
        beginRun(t)
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
      const t = normalizeTime(now)
      if (phase === 'holding') {
        const holdMs = holdDurationMs()
        if (holdMs === 0) {
          phase = 'ready'
          holdProgress = 1
          return snapshot()
        }
        holdProgress = Math.max(0, Math.min(1, (t - holdStartedAt) / holdMs))
        if (holdProgress >= 1) {
          phase = 'ready'
          holdProgress = 1
        }
        return snapshot()
      }
      if (phase === 'running') {
        elapsedMs = Math.max(0, t - runStartedAt)
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
    setHoldDelay(ms: number) {
      holdMsValue = ms
    },
  }
}

export function isTimerBusy(phase: TimerPhase): boolean {
  return phase === 'holding' || phase === 'ready' || phase === 'running'
}
