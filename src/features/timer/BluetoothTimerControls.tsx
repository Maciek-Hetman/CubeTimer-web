import { useBluetoothTimer } from '../../contexts/BluetoothTimerContext'
import { Button } from '../../ui/Button'

/** Connection status and connect/disconnect button for the Bluetooth timer. */
export function BluetoothTimerControls({ compact = false }: { compact?: boolean }) {
  const { status, deviceName, error, connect, disconnect } = useBluetoothTimer()

  if (status === 'unsupported') {
    return (
      <span className="bt-timer-status" role="alert">
        <span className="sync-dot bad" aria-hidden="true" />
        Bluetooth isn't supported in this browser. Use Chrome or Edge.
      </span>
    )
  }

  const connected = status === 'connected'
  return (
    <span className="bt-timer-status">
      <span
        className={`sync-dot ${connected ? 'ok' : status === 'connecting' ? 'warn' : 'bad'}`}
        aria-hidden="true"
      />
      <span>
        {connected
          ? (deviceName ?? 'Timer connected')
          : status === 'connecting'
            ? 'Connecting…'
            : compact
              ? 'Timer not connected'
              : 'No timer connected'}
      </span>
      <Button
        type="button"
        variant={connected ? 'ghost' : 'primary'}
        loading={status === 'connecting'}
        onClick={() => void (connected ? disconnect() : connect())}
      >
        {connected ? 'Disconnect' : 'Connect timer'}
      </Button>
      {error ? (
        <span className="bt-timer-error" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  )
}
