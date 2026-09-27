import { useWiredTimer } from '../../contexts/WiredTimerContext'
import { Button } from '../../ui/Button'

/** Connection status and connect/disconnect button for a timer plugged into an audio input. */
export function WiredTimerControls() {
  const { status, error, connect, disconnect } = useWiredTimer()

  if (status === 'unsupported') {
    return (
      <span className="bt-timer-status" role="alert">
        <span className="sync-dot bad" aria-hidden="true" />
        This browser can't read audio input, which wired timers need.
      </span>
    )
  }

  const open = status === 'listening' || status === 'connected'
  return (
    <span className="bt-timer-status">
      <span
        className={`sync-dot ${status === 'connected' ? 'ok' : status === 'disconnected' ? 'bad' : 'warn'}`}
        aria-hidden="true"
      />
      <span>
        {status === 'connected'
          ? 'Timer connected'
          : status === 'listening'
            ? 'No signal. Turn the timer on and check the cable.'
            : status === 'connecting'
              ? 'Connecting…'
              : 'Timer not connected'}
      </span>
      <Button
        type="button"
        variant={open ? 'ghost' : 'primary'}
        loading={status === 'connecting'}
        onClick={() => void (open ? disconnect() : connect())}
      >
        {open ? 'Disconnect' : 'Connect timer'}
      </Button>
      {error ? (
        <span className="bt-timer-error" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  )
}
