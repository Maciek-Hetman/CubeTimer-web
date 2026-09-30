import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { SmartTimerEvent, SmartTimerListener } from '../features/timer/bluetooth/types'
import {
  connectWiredTimer,
  hasMicrophonePermission,
  isWiredTimerSupported,
  type WiredTimerConnection,
} from '../features/timer/wired/wiredTimer'
import { appUpdater } from '../app/appUpdate'
import { useSettings } from './SettingsContext'
import { WiredTimerContext, type WiredTimerContextValue, type WiredTimerStatus } from './WiredTimerContext'

function describeError(error: unknown): string {
  if (error instanceof DOMException) {
    switch (error.name) {
      case 'NotAllowedError':
      case 'SecurityError':
        return 'Microphone access is blocked. Allow it for this site to use a wired timer.'
      case 'NotFoundError':
      case 'OverconstrainedError':
        return 'No audio input found. Plug in the timer cable and try again.'
      case 'NotReadableError':
        return 'The audio input is busy or unavailable. Close other apps using it and try again.'
    }
  }
  return error instanceof Error ? error.message : 'Could not open the audio input'
}

export function WiredTimerProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings()
  const active = settings.timingDevice === 'external_timer' && settings.externalTimer === 'wired'
  const protocol = settings.wiredTimerProtocol
  const inputId = settings.wiredTimerInputId
  const [supported] = useState(isWiredTimerSupported)
  const [status, setStatus] = useState<Exclude<WiredTimerStatus, 'unsupported'>>('disconnected')
  const [inputLabel, setInputLabel] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const connectionRef = useRef<WiredTimerConnection | null>(null)
  const connectingRef = useRef(false)
  // Bumped by every connect and disconnect, so a slower earlier attempt knows it's stale.
  const attemptRef = useRef(0)
  const listenersRef = useRef(new Set<SmartTimerListener>())

  const emit = useCallback((event: SmartTimerEvent) => {
    listenersRef.current.forEach((listener) => listener(event))
  }, [])

  const disconnect = useCallback(async () => {
    attemptRef.current++
    const connection = connectionRef.current
    connectionRef.current = null
    setStatus('disconnected')
    if (connection) {
      await connection.disconnect()
      emit({ state: 'disconnected' })
    }
  }, [emit])

  const connect = useCallback(async () => {
    if (connectionRef.current) {
      return
    }
    const attempt = ++attemptRef.current
    const isCurrent = () => attemptRef.current === attempt
    setError(null)
    setStatus('connecting')
    connectingRef.current = true
    try {
      const connection = await connectWiredTimer({
        protocol,
        inputId,
        onEvent: emit,
        onSignalChange: (hasSignal) => {
          if (isCurrent()) {
            setStatus(hasSignal ? 'connected' : 'listening')
          }
        },
        onEnded: () => {
          if (!isCurrent()) {
            return
          }
          connectionRef.current = null
          setStatus('disconnected')
          setError('The audio input was disconnected.')
          emit({ state: 'disconnected' })
        },
      })
      if (!isCurrent()) {
        await connection.disconnect()
        return
      }
      connectionRef.current = connection
      setInputLabel(connection.inputLabel)
      setStatus((current) => (current === 'connecting' ? 'listening' : current))
    } catch (err) {
      if (isCurrent()) {
        setError(describeError(err))
        setStatus('disconnected')
      }
    } finally {
      if (isCurrent()) {
        connectingRef.current = false
      }
    }
  }, [emit, inputId, protocol])

  const subscribe = useCallback((listener: SmartTimerListener) => {
    listenersRef.current.add(listener)
    return () => {
      listenersRef.current.delete(listener)
    }
  }, [])

  // Release the microphone, or abandon opening it, when another timing device is picked.
  useEffect(() => {
    if (!active && (connectionRef.current || connectingRef.current)) {
      connectingRef.current = false
      void disconnect()
    }
  }, [active, disconnect])

  // Reopen the input when its settings change, and reconnect on load if the microphone was
  // already allowed, so a wired timer works like a keyboard: no clicks needed.
  useEffect(() => {
    if (!active || !supported) {
      return
    }
    let cancelled = false
    void (async () => {
      if (connectionRef.current) {
        await disconnect()
      } else if (!(await hasMicrophonePermission())) {
        return
      }
      if (!cancelled) {
        await connect()
      }
    })()
    return () => {
      cancelled = true
    }
  }, [active, supported, connect, disconnect])

  // A reload would drop the audio connection (and the mic grant), so hold updates while it is open.
  const holdingUpdate = status !== 'disconnected'
  useEffect(() => (holdingUpdate ? appUpdater.hold() : undefined), [holdingUpdate])

  useEffect(() => () => void connectionRef.current?.disconnect(), [])

  const value = useMemo<WiredTimerContextValue>(
    () => ({
      status: supported ? status : 'unsupported',
      inputLabel,
      error,
      connect,
      disconnect,
      subscribe,
    }),
    [supported, status, inputLabel, error, connect, disconnect, subscribe],
  )

  return <WiredTimerContext.Provider value={value}>{children}</WiredTimerContext.Provider>
}
