import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../../app/AppProviders'
import { EVENTS, eventLabel, type CubeEvent, type Penalty } from '../../domain/models'
import { averageOfN } from '../../domain/stats/averages'
import { formatAverage, formatDuration, formatSolveTime } from '../../domain/stats/formatTime'
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
  const [scramble, setScramble] = useState('Generating scramble…')
  const scrambleRequest = useRef(0)
  const pendingPenalty = useRef<Penalty>('none')
  const [sessionOpen, setSessionOpen] = useState(false)
  const busy = isTimerBusy(snapshot.phase) || snapshot.phase === 'finished'

  useEffect(() => {
    engineRef.current = createTimerEngine(() => settings.timerStartDelayMs)
    setSnapshot(IDLE_TIMER)
  }, [settings.timerStartDelayMs])

  useEffect(() => {
    const id = ++scrambleRequest.current
    void generateScramble(settings.event)
      .then((value) => {
        if (id === scrambleRequest.current) {
          setScramble(value)
        }
      })
      .catch(() => {
        if (id === scrambleRequest.current) {
          setScramble('Could not generate scramble')
        }
      })
  }, [settings.event])

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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat || isFormTarget(event.target)) {
        return
      }
      event.preventDefault()
      setSnapshot(engineRef.current.press(performance.now()))
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || isFormTarget(event.target)) {
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
  }, [])

  const ao5 = useMemo(() => averageOfN(solves, 5), [solves])
  const ao12 = useMemo(() => averageOfN(solves, 12), [solves])
  const recent = solves.slice(0, 5)
  const hideChrome = settings.focusMode && snapshot.phase === 'running'
  const hideScramble = hideChrome || (settings.hideScrambleDuringSolve && snapshot.phase === 'running')
  const hideAverages = hideChrome || (settings.hideAveragesDuringSolve && snapshot.phase === 'running')
  const hideResults = hideChrome || (settings.hideLastResultsDuringSolve && snapshot.phase === 'running')

  async function finish(penalty: Penalty) {
    if (snapshot.finishedMs === null) {
      return
    }
    pendingPenalty.current = penalty
    await saveSolve({
      durationMs: snapshot.finishedMs,
      penalty,
      scramble,
    })
    engineRef.current.reset()
    setSnapshot(IDLE_TIMER)
    const id = ++scrambleRequest.current
    const next = await generateScramble(settings.event)
    if (id === scrambleRequest.current) {
      setScramble(next)
    }
  }

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
      ? 'Tap and hold to start'
      : snapshot.phase === 'holding'
        ? 'Hold…'
        : snapshot.phase === 'ready'
          ? 'Release to start!'
          : snapshot.phase === 'running'
            ? 'Tap to stop'
            : 'Save or apply a penalty'

  return (
    <div className="stack" style={{ minHeight: variant === 'desktop' ? '100%' : 'calc(100dvh - 120px)' }}>
      {!hideChrome ? (
        <header className="row wrap" style={{ justifyContent: 'space-between' }}>
          <label className="field" style={{ minWidth: 140 }}>
            <span className="muted">Event</span>
            <select
              value={settings.event}
              disabled={busy}
              onChange={(event) => void setEvent(event.target.value as CubeEvent)}
            >
              {EVENTS.map((item) => (
                <option key={item} value={item}>
                  {eventLabel(item)}
                </option>
              ))}
            </select>
          </label>
          {settings.sessionMode === 'manual' ? (
            <button type="button" className="btn" disabled={busy} onClick={() => setSessionOpen(true)}>
              {currentSession?.name ?? 'Sessions'}
            </button>
          ) : (
            <span className="muted">{currentSession?.name ?? 'Automatic session'}</span>
          )}
        </header>
      ) : null}

      {!hideScramble ? (
        <div className="panel panel-muted scramble">
          {scramble}
          <div>
            <button
              type="button"
              className="btn ghost"
              disabled={busy}
              onClick={() => {
                const id = ++scrambleRequest.current
                void generateScramble(settings.event).then((value) => {
                  if (id === scrambleRequest.current) {
                    setScramble(value)
                  }
                })
              }}
            >
              New scramble
            </button>
          </div>
        </div>
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
          minHeight: variant === 'desktop' ? 280 : 240,
        }}
        aria-label="Timer"
        onPointerDown={(event) => {
          if (snapshot.phase === 'finished') {
            return
          }
          event.preventDefault()
          event.currentTarget.setPointerCapture(event.pointerId)
          setSnapshot(engineRef.current.press(performance.now()))
        }}
        onPointerUp={() => {
          if (snapshot.phase === 'finished') {
            return
          }
          setSnapshot(engineRef.current.release(performance.now()))
        }}
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
          <button type="button" className="btn primary" onClick={() => void finish('none')}>
            Save time
          </button>
          <div className="row wrap">
            <button type="button" className="btn" onClick={() => void finish('plus_two')}>
              +2
            </button>
            <button type="button" className="btn danger" onClick={() => void finish('dnf')}>
              DNF
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                engineRef.current.reset()
                setSnapshot(IDLE_TIMER)
              }}
            >
              Discard
            </button>
          </div>
        </div>
      ) : null}

      {!hideAverages ? (
        <div className="panel panel-muted row wrap" style={{ justifyContent: 'space-around' }}>
          <span>Ao5 {formatAverage(ao5)}</span>
          <span>Ao12 {formatAverage(ao12)}</span>
        </div>
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
