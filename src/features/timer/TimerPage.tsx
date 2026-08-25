import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../../app/AppProviders'
import { EVENTS, eventLabel, type CubeEvent } from '../../domain/models'
import { averageOfN } from '../../domain/stats/averages'
import { formatAverage, formatDuration, formatSolveTime } from '../../domain/stats/formatTime'
import { Button } from '../../ui/Button'
import { RefreshIcon } from '../../ui/NavIcons'
import { Panel } from '../../ui/Panel'
import { Toast } from '../../ui/StatGrid'
import { Select } from '../../ui/Select'
import { ThemeToggle } from '../../ui/ThemeToggle'
import { useMediaQuery } from '../../ui/useMediaQuery'
import { SessionManager } from '../sessions/SessionManager'
import { createTimerEngine, isTimerBusy, IDLE_TIMER, type TimerSnapshot } from './timerMachine'

function isFormTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

const SYSTEM_KEYS = new Set([
  'Alt',
  'AltGraph',
  'CapsLock',
  'Control',
  'Fn',
  'Meta',
  'NumLock',
  'OS',
  'ScrollLock',
  'Shift',
])

function isSystemKey(event: KeyboardEvent): boolean {
  return (
    SYSTEM_KEYS.has(event.key) ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey
  )
}

export function TimerPage({ variant = 'mobile' }: { variant?: 'mobile' | 'desktop' }) {
  const {
    settings,
    setEvent,
    solves,
    currentSession,
    saveSolve,
    scramble,
    scrambleState,
    loadScramble,
  } = useApp()
  const engineRef = useRef(createTimerEngine(() => settings.timerStartDelayMs))
  const [snapshot, setSnapshot] = useState<TimerSnapshot>(IDLE_TIMER)
  const snapshotRef = useRef(snapshot)
  const [sessionOpen, setSessionOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [liveMessage, setLiveMessage] = useState('Timer ready')
  const autoSavedRef = useRef(false)
  const activeKeyRef = useRef<string | null>(null)
  const activePointerRef = useRef<number | null>(null)
  const isWide = useMediaQuery('(min-width: 768px)')
  const busy = isTimerBusy(snapshot.phase)

  useEffect(() => {
    snapshotRef.current = snapshot
  }, [snapshot])

  useEffect(() => {
    engineRef.current = createTimerEngine(() => settings.timerStartDelayMs)
    setSnapshot(IDLE_TIMER)
  }, [settings.timerStartDelayMs])

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
    async () => {
      const current = snapshotRef.current
      if (current.finishedMs === null) {
        return
      }
      const durationMs = current.finishedMs
      await saveSolve({
        durationMs,
        penalty: 'none',
        scramble: scramble || '—',
      })
      setNotice(`Saved ${formatDuration(durationMs)}`)
      await loadScramble()
    },
    [loadScramble, saveSolve, scramble],
  )

  useEffect(() => {
    if (snapshot.phase !== 'finished' || snapshot.finishedMs === null) {
      autoSavedRef.current = false
      return
    }
    if (autoSavedRef.current) {
      return
    }
    autoSavedRef.current = true
    void finish()
  }, [finish, snapshot.finishedMs, snapshot.phase])

  useEffect(() => {
    if (!notice) {
      return
    }
    const timer = window.setTimeout(() => setNotice(''), 1800)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    if (snapshot.phase === 'idle') {
      setLiveMessage(
        variant === 'desktop'
          ? 'Timer ready. Hold any key to start.'
          : 'Timer ready. Hold Space or tap and hold to start.',
      )
    } else if (snapshot.phase === 'holding') {
      setLiveMessage('Holding to start')
    } else if (snapshot.phase === 'ready') {
      setLiveMessage('Ready. Release to start.')
    } else if (snapshot.phase === 'finished') {
      setLiveMessage(`Saved ${formatDuration(snapshot.finishedMs ?? 0)}`)
    }
  }, [snapshot.finishedMs, snapshot.phase, variant])

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
      if (isFormTarget(event.target) || isSystemKey(event)) {
        return
      }
      if (variant !== 'desktop' && event.code !== 'Space') {
        return
      }
      event.preventDefault()
      if (event.repeat) {
        return
      }
      if (activeKeyRef.current !== null) {
        return
      }
      activeKeyRef.current = event.code
      setSnapshot(engineRef.current.press(performance.now()))
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (isFormTarget(event.target) || (variant !== 'desktop' && event.code !== 'Space')) {
        return
      }
      if (activeKeyRef.current !== event.code) {
        return
      }
      activeKeyRef.current = null
      event.preventDefault()
      setSnapshot(isSystemKey(event) ? engineRef.current.cancel() : engineRef.current.release(performance.now()))
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [variant])

  const ao5 = useMemo(() => averageOfN(solves, 5), [solves])
  const ao12 = useMemo(() => averageOfN(solves, 12), [solves])
  const recent = solves.slice(0, 5)
  const isSolvingOrPreparing = snapshot.phase === 'running' || snapshot.phase === 'ready' || snapshot.phase === 'holding'
  const hideScramble = settings.hideScrambleDuringSolve && isSolvingOrPreparing

  useEffect(() => {
    if (settings.hideWidgetsDuringSolve && isSolvingOrPreparing) {
      document.body.classList.add('hide-widgets')
    } else {
      document.body.classList.remove('hide-widgets')
    }
    return () => document.body.classList.remove('hide-widgets')
  }, [settings.hideWidgetsDuringSolve, isSolvingOrPreparing])

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
      ? variant === 'desktop'
        ? 'Hold any key to start'
        : 'Hold Space or tap and hold to start'
      : snapshot.phase === 'holding'
        ? 'Hold…'
        : snapshot.phase === 'ready'
          ? 'Release to start!'
          : snapshot.phase === 'running'
            ? variant === 'desktop'
              ? 'Press any key to stop'
              : 'Tap or press Space to stop'
            : variant === 'desktop'
              ? 'Hold any key to start'
              : 'Hold Space or tap and hold to start'

  function cancelHold() {
    activePointerRef.current = null
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

      <header className="row wrap" style={{ justifyContent: 'space-between', padding: '0 8px', marginTop: '-8px' }}>
        <Select
          aria-label="Event"
          value={settings.event}
          disabled={busy}
          onChange={(val) => void setEvent(val as CubeEvent)}
          style={{ minWidth: 100 }}
          variant="ghost"
          size="small"
          options={EVENTS.map((item) => ({
            value: item,
            label: eventLabel(item)
          }))}
        />
        {settings.sessionMode === 'manual' ? (
          <Button type="button" disabled={busy} aria-label="Sessions" onClick={() => setSessionOpen(true)} variant="ghost" style={{ minHeight: 32, padding: '6px 10px', fontSize: 'var(--text-xs)' }}>
            {currentSession?.name ?? 'Sessions'}
          </Button>
        ) : (
          <span className="muted" style={{ fontSize: 'var(--text-xs)', fontWeight: 600, padding: '6px 10px' }}>{currentSession?.name ?? 'Automatic session'}</span>
        )}
        {!isWide && variant !== 'desktop' ? <ThemeToggle /> : null}
      </header>

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
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          paddingBottom: '8vh'
        }}
        aria-label="Timer"
        onPointerDown={(event) => {
          if (event.button !== 0 || activePointerRef.current !== null) {
            return
          }
          event.preventDefault()
          activePointerRef.current = event.pointerId
          event.currentTarget.setPointerCapture?.(event.pointerId)
          setSnapshot(engineRef.current.press(performance.now()))
        }}
        onPointerUp={(event) => {
          if (activePointerRef.current !== event.pointerId) {
            return
          }
          activePointerRef.current = null
          setSnapshot(engineRef.current.release(performance.now()))
        }}
        onPointerCancel={cancelHold}
        onLostPointerCapture={cancelHold}
        onContextMenu={(event) => event.preventDefault()}
      >
        <TimeDigits ms={timeMs} mode={settings.timerDisplayMode ?? 'show'} isRunning={snapshot.phase === 'running'} />
        <div className="timer-hint">{hint}</div>
        {snapshot.phase === 'holding' ? (
          <div className="progress" aria-hidden="true">
            <span style={{ width: `${Math.round(snapshot.holdProgress * 100)}%` }} />
          </div>
        ) : null}
      </button>

      {variant !== 'desktop' ? (
        <Panel muted className="row wrap" style={{ justifyContent: 'space-around' }}>
          <span>Ao5 {formatAverage(ao5)}</span>
          <span>Ao12 {formatAverage(ao12)}</span>
        </Panel>
      ) : null}

      {variant !== 'desktop' ? (
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

function TimeDigits({ ms, mode, isRunning }: { ms: number; mode: string; isRunning: boolean }) {
  const formatted = formatDuration(ms)
  const [main, decimals] = formatted.includes('.') ? formatted.split('.') : [formatted, '00']

  if (isRunning && mode === 'hide') {
    return (
      <span style={{ visibility: 'hidden' }}>
        {main}
        <span className="decimals">.{decimals}</span>
      </span>
    )
  }

  if (isRunning && mode === 'hide_decimals') {
    return (
      <span>
        {main}
      </span>
    )
  }

  return (
    <span>
      {main}
      <span className="decimals">.{decimals}</span>
    </span>
  )
}
