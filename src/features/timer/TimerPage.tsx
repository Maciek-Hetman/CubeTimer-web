import confetti from 'canvas-confetti'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../../app/AppProviders'
import {
  EVENTS,
  effectiveTimeMs,
  eventLabel,
  type CubeEvent,
  type Solve,
  type TimerDisplayMode,
  type TimerFont,
  type TimerSize,
} from '../../domain/models'
import { averageFromValues } from '../../domain/stats/averages'
import { formatAverage, formatDuration, formatSolveTime } from '../../domain/stats/formatTime'
import { Button } from '../../ui/Button'
import { ListIcon, RefreshIcon } from '../../ui/NavIcons'
import { Panel } from '../../ui/Panel'
import { Toast } from '../../ui/StatGrid'
import { Select } from '../../ui/Select'
import { SessionManager } from '../sessions/SessionManager'
import { createTimerEngine, isTimerBusy, IDLE_TIMER, type TimerSnapshot } from './timerMachine'
import { getAccentColor } from '../../styles/accents'
import { loadTimerFont } from '../../styles/timerFonts'

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

function getFontFamily(font?: TimerFont): string | undefined {
  return font && TIMER_FONT_FAMILIES[font] ? TIMER_FONT_FAMILIES[font] : undefined
}

function getFontStyles(font?: TimerFont): Record<string, string> | undefined {
  if (font !== 'dseg7') {
    return undefined
  }
  return {
    fontStyle: 'italic',
    letterSpacing: '0',
    fontSynthesis: 'none',
  }
}

function getSizeStyles(size?: TimerSize, isDesktop = false): string | undefined {
  return size ? TIMER_SIZE_STYLES[isDesktop ? 'desktop' : 'mobile'][size] : undefined
}

const TIMER_FONT_FAMILIES: Record<TimerFont, string> = {
  jetbrains: "'JetBrains Mono Variable', var(--mono)",
  fira: "'Fira Code Variable', var(--mono)",
  digital: "'Share Tech Mono', var(--mono)",
  dseg7: "'DSEG7 Classic', var(--mono)",
  inter: 'var(--font)',
  roboto: "'Roboto Variable', var(--font)",
  'open-sans': "'Open Sans Variable', var(--font)",
  system: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
}

const TIMER_SIZE_STYLES: Record<'mobile' | 'desktop', Record<TimerSize, string>> = {
  mobile: {
    small: 'clamp(3rem, 13vw, 4.5rem)',
    medium: 'clamp(3.75rem, 16vw, 5.75rem)',
    large: 'clamp(4.75rem, 20vw, 7.25rem)',
    xlarge: 'clamp(5.75rem, 24vw, 9rem)',
  },
  desktop: {
    small: 'clamp(3.5rem, 10vw, 6rem)',
    medium: 'clamp(4.25rem, 12vw, 7.5rem)',
    large: 'clamp(5.25rem, 15vw, 9.5rem)',
    xlarge: 'clamp(6.25rem, 18vw, 11.5rem)',
  },
}

export function TimerPage({ variant = 'mobile' }: { variant?: 'mobile' | 'desktop' }) {
  const {
    settings,
    setEvent,
    recentSolves,
    solveStats,
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
  const isSolvingOrPreparing = isTimerBusy(snapshot.phase)

  useEffect(() => {
    snapshotRef.current = snapshot
  }, [snapshot])

  useEffect(() => {
    loadTimerFont(settings.timerFont ?? 'jetbrains')
  }, [settings.timerFont])

  useEffect(() => {
    engineRef.current = createTimerEngine(() => settings.timerStartDelayMs)
    setSnapshot(IDLE_TIMER)
  }, [settings.timerStartDelayMs])

  useEffect(() => {
    let frame = 0
    const loop = (now: number) => {
      const next = engineRef.current.tick(now)
      if (next.phase !== 'idle' && next.phase !== 'finished') {
        setSnapshot(next)
      }
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

      const prevSingle = solveStats.best
      const prevAo5 = solveStats.bestAo5
      const prevAo12 = solveStats.bestAo12
      const prevAo25 = solveStats.bestAo25

      const savedSolve = await saveSolve({
        durationMs,
        penalty: 'none',
        scramble: scramble || '—',
      })

      const newSingle = bestWithNew(prevSingle, savedSolve)
      const currentAo5 = bestWindowWithNew(prevAo5, recentSolves, savedSolve, 5)
      const currentAo12 = bestWindowWithNew(prevAo12, recentSolves, savedSolve, 12)
      const currentAo25 = bestWindowWithNew(prevAo25, recentSolves, savedSolve, 25)

      const broken: string[] = []
      if (prevSingle !== null && newSingle !== null && newSingle < prevSingle) {
        broken.push(`Single: ${formatDuration(newSingle)}`)
      }
      if (prevAo5 !== null && currentAo5 !== null && currentAo5 < prevAo5) {
        broken.push(`Ao5: ${formatAverage(currentAo5)}`)
      }
      if (prevAo12 !== null && currentAo12 !== null && currentAo12 < prevAo12) {
        broken.push(`Ao12: ${formatAverage(currentAo12)}`)
      }
      if (prevAo25 !== null && currentAo25 !== null && currentAo25 < prevAo25) {
        broken.push(`Ao25: ${formatAverage(currentAo25)}`)
      }

      if (broken.length > 0) {
        const palette = getAccentColor(settings.accentColor || 'blue')
        const colors = [palette.light, palette.dark]

        confetti({
          particleCount: 120,
          spread: 70,
          origin: { y: 0.6 },
          colors,
        })
        setNotice(`New PB! ${broken.join(' & ')}`)
      } else {
        setNotice(`Saved ${formatDuration(durationMs)}`)
      }

      await loadScramble()
    },
    [loadScramble, recentSolves, saveSolve, scramble, solveStats, settings.accentColor],
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
    void finish().catch(() => {
      setNotice('Could not save solve')
    })
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
    const updateLiveMessage = () => {
      setLiveMessage(`Running ${formatDuration(snapshotRef.current.elapsedMs)}`)
    }
    updateLiveMessage()
    const timer = window.setInterval(updateLiveMessage, 1000)
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
      const next = isSystemKey(event)
        ? engineRef.current.cancel()
        : engineRef.current.release(performance.now())
      setSnapshot(next)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [variant])

  const ao5 = useMemo(() => solveStats.ao5, [solveStats])
  const ao12 = useMemo(() => solveStats.ao12, [solveStats])
  const recent = recentSolves.slice(0, 5)
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

      <div className="row wrap timer-toolbar">
        <Select
          size="small"
          aria-label="Event"
          value={settings.event}
          disabled={isSolvingOrPreparing}
          onChange={(val) => void setEvent(val as CubeEvent)}
          style={{ width: 92 }}
          options={EVENTS.map((item) => ({ value: item, label: eventLabel(item) }))}
        />
        <span className="scramble">
          {hideScramble ? null : scrambleState === 'loading' ? (
            <span className="muted">Generating scramble…</span>
          ) : scrambleState === 'error' ? (
            <span role="alert">Could not generate scramble</span>
          ) : (
            scramble
          )}
        </span>
        {settings.sessionMode === 'manual' ? (
          <Button
            type="button"
            className="icon"
            disabled={isSolvingOrPreparing}
            aria-label="Sessions"
            title="Sessions"
            onClick={() => setSessionOpen(true)}
          >
            <ListIcon />
          </Button>
        ) : null}
        {!hideScramble ? (
          <Button
            type="button"
            className="icon"
            disabled={isSolvingOrPreparing}
            aria-label={scrambleState === 'error' ? 'Retry' : 'New scramble'}
            title={scrambleState === 'error' ? 'Retry' : 'New scramble'}
            onClick={() => void loadScramble()}
          >
            <RefreshIcon />
          </Button>
        ) : null}
      </div>

      <button
        type="button"
        className={`timer-display ${colorClass}`}
        aria-label="Timer"
        aria-describedby={`timer-hint-${variant}`}
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
          paddingBottom: '8vh',
          fontFamily: getFontFamily(settings.timerFont),
          fontSize: getSizeStyles(settings.timerSize, variant === 'desktop'),
          ...getFontStyles(settings.timerFont),
        }}
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
        <TimeDigits
          ms={timeMs}
          mode={settings.timerDisplayMode ?? 'show'}
          isRunning={snapshot.phase === 'running'}
          font={settings.timerFont}
        />
        <div id={`timer-hint-${variant}`} className="timer-hint">
          {hint}
        </div>
        {snapshot.phase === 'holding' ? (
          <div className="progress" aria-hidden="true">
            <span style={{ animation: `fill-progress ${settings.timerStartDelayMs}ms linear forwards` }} />
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

function bestWithNew(prev: number | null, solve: Solve): number | null {
  const effective = effectiveTimeMs(solve)
  if (effective === null) {
    return prev
  }
  return prev === null ? effective : Math.min(prev, effective)
}

function bestWindowWithNew(
  prevBest: number | null,
  latest: Solve[],
  newest: Solve,
  n: number,
): number | null {
  const window = [newest, ...latest.slice(0, n - 1)].map(effectiveTimeMs)
  const current = averageFromValues(window, n)
  if (prevBest === null) {
    return current
  }
  if (current === null) {
    return prevBest
  }
  return Math.min(prevBest, current)
}

function TimeDigits({
  ms,
  mode,
  isRunning,
  font,
}: {
  ms: number
  mode: TimerDisplayMode
  isRunning: boolean
  font?: TimerFont
}) {
  const formatted = formatDuration(ms)
  const [main, decimals] = formatted.includes('.') ? formatted.split('.') : [formatted, '00']
  const sevenSeg = font === 'dseg7'

  const renderDecimals = () =>
    sevenSeg ? (
      <>
        <span className="dot" aria-hidden="true" />
        {decimals}
      </>
    ) : (
      <>.{decimals}</>
    )

  if (isRunning && mode === 'hide') {
    return (
      <span style={{ visibility: 'hidden' }}>
        {main}
        <span className="decimals">{renderDecimals()}</span>
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
      <span className={`decimals${sevenSeg ? ' dseg7' : ''}`}>{renderDecimals()}</span>
    </span>
  )
}
