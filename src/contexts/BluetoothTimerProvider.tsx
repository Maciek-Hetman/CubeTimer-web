import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  connectBluetoothTimer,
  isWebBluetoothSupported,
  type BluetoothTimerConnection,
} from '../features/timer/bluetooth/bluetoothTimer'
import type { SmartTimerEvent, SmartTimerListener } from '../features/timer/bluetooth/types'
import {
  BluetoothTimerContext,
  type BluetoothTimerContextValue,
  type BluetoothTimerStatus,
} from './BluetoothTimerContext'
import { useSettings } from './SettingsContext'

function requestMacFromUser(suggested: string | null): string | null {
  const hint =
    'On macOS, chrome://bluetooth-internals does not show the real address. Instead, enable ' +
    'chrome://flags/#enable-experimental-web-platform-features and reconnect so it can be detected automatically.'
  return window.prompt(
    suggested
      ? `The timer didn't respond to MAC address ${suggested}.\nEnter the timer's MAC address.\n\n${hint}`
      : `Couldn't detect the timer's MAC address. Enter it (e.g. CC:A8:12:34:56:78).\n\n${hint}`,
    suggested ?? '',
  )
}

function describeError(error: unknown): string | null {
  if (error instanceof DOMException && error.name === 'NotFoundError') {
    return null // user closed the device picker
  }
  if (error instanceof Error) {
    return error.message
  }
  return 'Could not connect to the timer'
}

export function BluetoothTimerProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings()
  const [supported] = useState(isWebBluetoothSupported)
  const [status, setStatus] = useState<Exclude<BluetoothTimerStatus, 'unsupported'>>('disconnected')
  const [deviceName, setDeviceName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const connectionRef = useRef<BluetoothTimerConnection | null>(null)
  const listenersRef = useRef(new Set<SmartTimerListener>())

  const emit = useCallback((event: SmartTimerEvent) => {
    if (event.state === 'disconnected') {
      connectionRef.current = null
      setStatus('disconnected')
    }
    listenersRef.current.forEach((listener) => listener(event))
  }, [])

  const disconnect = useCallback(async () => {
    const connection = connectionRef.current
    connectionRef.current = null
    setStatus('disconnected')
    if (connection) {
      await connection.disconnect()
      listenersRef.current.forEach((listener) => listener({ state: 'disconnected' }))
    }
  }, [])

  const connect = useCallback(async () => {
    if (connectionRef.current) {
      return
    }
    setError(null)
    setStatus('connecting')
    try {
      const connection = await connectBluetoothTimer(emit, { requestMac: requestMacFromUser })
      connectionRef.current = connection
      setDeviceName(connection.deviceName)
      setStatus('connected')
    } catch (err) {
      setError(describeError(err))
      setStatus('disconnected')
    }
  }, [emit])

  const subscribe = useCallback((listener: SmartTimerListener) => {
    listenersRef.current.add(listener)
    return () => {
      listenersRef.current.delete(listener)
    }
  }, [])

  useEffect(() => {
    if (settings.timingDevice !== 'external_timer' && connectionRef.current) {
      void disconnect()
    }
  }, [disconnect, settings.timingDevice])

  useEffect(() => () => void connectionRef.current?.disconnect(), [])

  const value = useMemo<BluetoothTimerContextValue>(
    () => ({
      status: supported ? status : 'unsupported',
      deviceName,
      error,
      connect,
      disconnect,
      subscribe,
    }),
    [supported, status, deviceName, error, connect, disconnect, subscribe],
  )

  return <BluetoothTimerContext.Provider value={value}>{children}</BluetoothTimerContext.Provider>
}
