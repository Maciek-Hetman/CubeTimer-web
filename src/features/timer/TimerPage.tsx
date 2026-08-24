import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../../app/AppProviders'
import { EVENTS, eventLabel, type CubeEvent, type Penalty } from '../../domain/models'
import { averageOfN } from '../../domain/stats/averages'
import { formatAverage, formatDuration, formatSolveTime } from '../../domain/stats/formatTime'
import { Button } from '../../ui/Button'
import { Field } from '../../ui/Field'
import { RefreshIcon } from '../../ui/NavIcons'
import { Panel } from '../../ui/Panel'
import { Toast } from '../../ui/StatGrid'
import { generateScramble } from '../scramble/scrambleService'
import { SessionManager } from '../sessions/SessionManager'
import { createTimerEngine, isTimerBusy, IDLE_TIMER, type TimerSnapshot } from './timerMachine'

function isFormTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

type ScrambleState = 'loading' | 'ready' | 'error'

export function TimerPage({ variant = 'mobile' }: { variant?: 'mobile' | 'desktop' }) {
  const {
    settings,
    setEvent,
    solves,
    currentSession,
    saveSolve,
  } = useApp()
  const engineRef = useRef(createTimerEngine(() => settings.timerStartDelayMs))
  const [snapshot, setSnapshot] = useState<TimerSnapshot>(IDLE_TIMER)
  const snapshotRef = useRef(snapshot)
  const [scramble, setScramble] = useState('')
  const [scrambleState, setScrambleState] = useState<ScrambleState>('loading')
  const scrambleRequest = useRef(0)
  const [sessionOpen, setSessionOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [liveMessage, setLiveMessage] = useState('Timer ready')
  const busy = isTimerBusy(snapshot.phase) || snapshot.phase === 'finished'

  useEffect(() => {
    snapshotRef.current = snapshot
  }, [snapshot])

  const loadScramble = useCallback(async () => {
    const id = ++scrambleRequest.current
    setScrambleState('loading')
    setScramble('')
    try {
      const value = await generateScramble(settings.event)
      if (id === scrambleRequest.current) {
        setScramble(value)
        setScrambleState('ready')
      }
    } catch {
      if (id === scrambleRequest.current) {
        setScramble('')
        setScrambleState('error')
      }
    }
  }, [settings.event])

  useEffect(() => {
    engineRef.current = createTimerEngine(() => settings.timerStartDelayMs)
    setSnapshot(IDLE_TIMER)
  }, [settings.timerStartDelayMs])

  useEffect(() => {
    void loadScramble()
  }, [loadScramble])

  useEffect(() => {
    document.body.dataset.timerBusy = busy ? 'true' : 'false'
    return () => {
      delete document.body.dataset.timerBusy
    }
  }, [busy])

  useEffect(() => {
    let frame = 0
    const loop = (now: number) => {
      setSnapshot(engineRef.current.tick(now))
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [])

  const finish = useCallback(
    async (penalty: Penalty) => {
      const current = snapshotRef.current
      if (current.finishedMs === null) {
        return
      }
      const durationMs = current.finishedMs
      await saveSolve({
        durationMs,
        penalty,
        scramble: scramble || '—',
      })
      engineRef.current.reset()
      setSnapshot(IDLE_TIMER)
      setNotice(
        penalty === 'none'
          ? `Saved ${formatDuration(durationMs)}`
          : penalty === 'plus_two'
            ? `Saved ${formatDuration(durationMs)} (+2)`
            : 'Saved DNF',
      )
      await loadScramble()
    },
    [loadScramble, saveSolve, scramble],
  )

  const discard = useCallback(() => {
    engineRef.current.reset()
    setSnapshot(IDLE_TIMER)
  }, [])

  useEffect(() => {
    if (!notice) {
      return
    }
    const timer = window.setTimeout(() => setNotice(''), 1800)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    if (snapshot.phase === 'idle') {
      setLiveMessage('Timer ready. Hold Space or tap and hold to start.')
    } else if (snapshot.phase === 'holding') {
      setLiveMessage('Holding to start')
    } else if (snapshot.phase === 'ready') {
      setLiveMessage('Ready. Release to start.')
    } else if (snapshot.phase === 'finished') {
      setLiveMessage(`Finished ${formatDuration(snapshot.finishedMs ?? 0)}. Press Enter to save.`)
    }
  }, [snapshot.phase, snapshot.finishedMs])

  useEffect(() => {
    if (snapshot.phase !== 'running') {
      return
    }
    setLiveMessage(`Running ${formatDuration(snapshot.elapsedMs)}`)
    const timer = window.setInterval(() => {
      setLiveMessage(`Running ${formatDuration(snapshotRef.current.elapsedMs)}`)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [snapshot.phase])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isFormTarget(event.target)) {
        return
      }
      const current = snapshotRef.current
      if (current.phase === 'finished') {
        if (event.key === 'Enter' || event.code === 'KeyS') {
          event.preventDefault()
          void finish('none')
          return
        }
        if (event.code === 'Digit2' || event.code === 'Numpad2') {
          event.preventDefault()
          void finish('plus_two')
          return
        }
        if (event.code === 'KeyD') {
          event.preventDefault()
          void finish('dnf')
          return
        }
        if (event.key === 'Escape') {
          event.preventDefault()
          discard()
        }
        return
      }
      if (event.code !== 'Space' || event.repeat) {
        return
      }
      event.preventDefault()
      setSnapshot(engineRef.current.press(performance.now()))
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || isFormTarget(event.target)) {
        return
      }
      if (snapshotRef.current.phase === 'finished') {
        return
      }
      event.preventDefault()
      setSnapshot(engineRef.current.release(performance.now()))
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [discard, finish])

  const ao5 = useMemo(() => averageOfN(solves, 5), [solves])
  const ao12 = useMemo(() => averageOfN(solves, 12), [solves])
  const recent = solves.slice(0, 5)
  const hideChrome = settings.focusMode && snapshot.phase === 'running'
  const hideScramble = hideChrome || (settings.hideScrambleDuringSolve && snapshot.phase === 'running')
  const hideAverages = hideChrome || (settings.hideAveragesDuringSolve && snapshot.phase === 'running')
  const hideResults = hideChrome || (settings.hideLastResultsDuringSolve && snapshot.phase === 'running')

  const timeMs =
    snapshot.phase === 'running'
      ? snapshot.elapsedMs
      : snapshot.phase === 'finished'
        ? (snapshot.finishedMs ?? 0)
        : 0
  const colorClass =
    snapshot.phase === 'holding'
      ? 'timer-holding'
      : snapshot.phase === 'ready'
        ? 'timer-ready'
        : snapshot.phase === 'running' || snapshot.phase === 'finished'
          ? 'timer-running'
          : ''

  const hint =
    snapshot.phase === 'idle'
      ? 'Hold Space or tap and hold to start'
      : snapshot.phase === 'holding'
        ? 'Hold…'
        : snapshot.phase === 'ready'
          ? 'Release to start!'
          : snapshot.phase === 'running'
            ? 'Tap or press Space to stop'
            : 'Enter save · 2 +2 · D DNF · Esc discard'

  function cancelHold() {
    if (snapshotRef.current.phase === 'holding' || snapshotRef.current.phase === 'ready') {
      setSnapshot(engineRef.current.cancel())
    }
  }

  return (
    <div className={`stack timer-page${variant === 'desktop' ? ' desktop' : ''}`}>
      <h1 className="sr-only">Timer</h1>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {liveMessage}
      </div>

      {!hideChrome ? (
        <header className="row wrap" style={{ justifyContent: 'space-between' }}>
          <Field label="Event">
            <select
              value={settings.event}
              disabled={busy}
              onChange={(event) => void setEvent(event.target.value as CubeEvent)}
              style={{ minWidth: 140 }}
            >
              {EVENTS.map((item) => (
                <option key={item} value={item}>
                  {eventLabel(item)}
                </option>
              ))}
            </select>
          </Field>
          {settings.sessionMode === 'manual' ? (
            <Button type="button" disabled={busy} aria-label="Sessions" onClick={() => setSessionOpen(true)}>
              {currentSession?.name ?? 'Sessions'}
            </Button>
          ) : (
            <span className="muted">{currentSession?.name ?? 'Automatic session'}</span>
          )}
        </header>
      ) : null}

      {!hideScramble ? (
        <Panel muted className="scramble">
          <div className="scramble-row">
            {scrambleState === 'loading' ? <span className="muted scramble-text">Generating scramble…</span> : null}
            {scrambleState === 'error' ? (
              <>
                <span className="scramble-text" role="alert">
                  Could not generate scramble
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  className="icon"
                  disabled={busy}
                  aria-label="Retry"
                  title="Retry"
                  onClick={() => void loadScramble()}
                >
                  <RefreshIcon />
                </Button>
              </>
            ) : null}
            {scrambleState === 'ready' ? (
              <>
                <span className="scramble-text">{scramble}</span>
                <Button
                  type="button"
                  variant="ghost"
                  className="icon"
                  disabled={busy}
                  aria-label="New scramble"
                  title="New scramble"
                  onClick={() => void loadScramble()}
                >
                  <RefreshIcon />
                </Button>
              </>
            ) : null}
          </div>
        </Panel>
      ) : (
        <div style={{ minHeight: 48 }} />
      )}

      <button
        type="button"
        className={`timer-display ${colorClass}`}
        style={{
          flex: 1,
          width: '100%',
          border: 0,
          background: 'transparent',
          minHeight: variant === 'desktop' ? 380 : 240,
        }}
        aria-label="Timer"
        onPointerDown={(event) => {
          if (snapshot.phase === 'finished') {
            return
          }
          event.preventDefault()
          event.currentTarget.setPointerCapture?.(event.pointerId)
          setSnapshot(engineRef.current.press(performance.now()))
        }}
        onPointerUp={() => {
          if (snapshot.phase === 'finished') {
            return
          }
          setSnapshot(engineRef.current.release(performance.now()))
        }}
        onPointerCancel={cancelHold}
        onLostPointerCapture={cancelHold}
        onContextMenu={(event) => event.preventDefault()}
      >
        <TimeDigits ms={timeMs} />
        <div className="timer-hint">{hint}</div>
        {snapshot.phase === 'holding' ? (
          <div className="progress" aria-hidden="true">
            <span style={{ width: `${Math.round(snapshot.holdProgress * 100)}%` }} />
          </div>
        ) : null}
      </button>

      {snapshot.phase === 'finished' ? (
        <div className="stack">
          <Button type="button" variant="primary" onClick={() => void finish('none')}>
            Save time
          </Button>
          <div className="row wrap">
            <Button type="button" onClick={() => void finish('plus_two')}>
              +2
            </Button>
            <Button type="button" variant="danger" onClick={() => void finish('dnf')}>
              DNF
            </Button>
            <Button type="button" variant="ghost" onClick={discard}>
              Discard
            </Button>
          </div>
        </div>
      ) : null}

      {!hideAverages ? (
        <Panel muted className="row wrap" style={{ justifyContent: 'space-around' }}>
          <span>Ao5 {formatAverage(ao5)}</span>
          <span>Ao12 {formatAverage(ao12)}</span>
        </Panel>
      ) : null}

      {!hideResults ? (
        <div className="row wrap" style={{ justifyContent: 'center' }}>
          {recent.map((solve) => (
            <span key={solve.id} className="chip">
              {formatSolveTime(solve)}
            </span>
          ))}
        </div>
      ) : null}

      {sessionOpen ? <SessionManager onClose={() => setSessionOpen(false)} /> : null}
      {notice ? <Toast>{notice}</Toast> : null}
    </div>
  )
}

function TimeDigits({ ms }: { ms: number }) {
  const formatted = formatDuration(ms)
  const [main, decimals] = formatted.includes('.') ? formatted.split('.') : [formatted, '00']
  return (
    <span>
      {main}
      <span className="decimals">.{decimals}</span>
    </span>
  )
}
