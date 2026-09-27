import captureWorkletUrl from './captureWorklet.js?url'
import type { WiredTimerProtocol } from '../../../domain/models'
import type { SmartTimerListener } from '../bluetooth/types'
import { createWiredTimerDecoder } from './signalDecoder'
import { createWiredTimerInterpreter } from './wiredTimerInterpreter'

/** With no valid packet for this long, the timer is off, unplugged, or in its memory mode. */
const SIGNAL_TIMEOUT_MS = 1000
const RESUME_EVENTS = ['pointerdown', 'keydown'] as const

export interface AudioInput {
  deviceId: string
  label: string
}

export interface WiredTimerConnection {
  /** Label of the audio input actually in use. */
  inputLabel: string
  disconnect(): Promise<void>
}

export interface WiredTimerOptions {
  protocol: WiredTimerProtocol
  /** Audio input to use; empty for the system default. */
  inputId: string
  onEvent: SmartTimerListener
  /** Called when timer packets start or stop arriving. */
  onSignalChange: (hasSignal: boolean) => void
  /** Called when the input goes away by itself, e.g. a USB adapter was unplugged. */
  onEnded: () => void
}

export function isWiredTimerSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function' &&
    typeof AudioContext !== 'undefined'
  )
}

/** Resolves true when the page may use the microphone without prompting. */
export async function hasMicrophonePermission(): Promise<boolean> {
  try {
    const status = await navigator.permissions?.query({ name: 'microphone' as PermissionName })
    return status?.state === 'granted'
  } catch {
    return false
  }
}

/** Audio inputs to choose from. Browsers hide them until microphone access is granted. */
export async function listAudioInputs(): Promise<AudioInput[]> {
  if (typeof navigator.mediaDevices?.enumerateDevices !== 'function') {
    return []
  }
  const devices = await navigator.mediaDevices.enumerateDevices()
  return devices
    // Chrome adds "default" and "communications" aliases; the empty choice already covers them.
    .filter((d) => d.kind === 'audioinput' && d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications')
    .map((d, index) => ({ deviceId: d.deviceId, label: d.label || `Audio input ${index + 1}` }))
}

/** Feeds every captured sample to `onSamples`. Returns a function that stops the capture. */
async function startCapture(
  context: AudioContext,
  source: MediaStreamAudioSourceNode,
  onSamples: (samples: Float32Array) => void,
): Promise<() => void> {
  // Mix down to mono: depending on the cable, the signal is on one channel or both.
  const mono = { channelCount: 1, channelCountMode: 'explicit' as const }
  if (context.audioWorklet) {
    try {
      await context.audioWorklet.addModule(captureWorkletUrl)
      const node = new AudioWorkletNode(context, 'wired-timer-capture', mono)
      node.port.onmessage = (event: MessageEvent<Float32Array>) => onSamples(event.data)
      source.connect(node)
      // Nodes only run while connected to the output. This one writes nothing, so it's silent.
      node.connect(context.destination)
      return () => {
        node.port.onmessage = null
        source.disconnect()
        node.disconnect()
      }
    } catch (error) {
      console.warn('[WiredTimer] audio worklet unavailable, using ScriptProcessorNode', error)
    }
  }
  const processor = context.createScriptProcessor(2048, 1, 1)
  processor.onaudioprocess = (event) => onSamples(event.inputBuffer.getChannelData(0))
  source.connect(processor)
  processor.connect(context.destination)
  return () => {
    processor.onaudioprocess = null
    source.disconnect()
    processor.disconnect()
  }
}

/** Opens the audio input and starts decoding the timer signal on it. */
export async function connectWiredTimer(options: WiredTimerOptions): Promise<WiredTimerConnection> {
  if (!isWiredTimerSupported()) {
    throw new Error("This browser can't read audio input, which wired timers need.")
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      // `ideal` falls back to another input when the saved one is gone, instead of failing.
      ...(options.inputId ? { deviceId: { ideal: options.inputId } } : {}),
      // Voice processing mangles the timer's square wave.
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  })
  const track = stream.getAudioTracks()[0]
  const context = new AudioContext()
  const interpreter = createWiredTimerInterpreter(options.onEvent)
  let hasSignal = false
  let lastPacketAt = 0

  const decoder = createWiredTimerDecoder({
    protocol: options.protocol,
    sampleRate: context.sampleRate,
    onPacket: (packet) => {
      lastPacketAt = performance.now()
      if (!hasSignal) {
        hasSignal = true
        options.onSignalChange(true)
      }
      interpreter.push(packet)
    },
  })

  let stopCapture: () => void
  try {
    stopCapture = await startCapture(context, context.createMediaStreamSource(stream), (samples) =>
      decoder.process(samples),
    )
  } catch (error) {
    stream.getTracks().forEach((t) => t.stop())
    void context.close()
    throw error
  }

  const watchdog = window.setInterval(() => {
    if (hasSignal && performance.now() - lastPacketAt > SIGNAL_TIMEOUT_MS) {
      hasSignal = false
      interpreter.reset()
      options.onEvent({ state: 'disconnected' })
      options.onSignalChange(false)
    }
  }, 250)

  // Browsers keep an AudioContext suspended until the page gets a click or key press, e.g.
  // when reconnecting on page load. Resume on the first one.
  const resume = () => void context.resume().catch(() => undefined)
  const removeResumeListeners = () => RESUME_EVENTS.forEach((type) => window.removeEventListener(type, resume, true))
  const onStateChange = () => {
    if (context.state === 'running') {
      removeResumeListeners()
    }
  }
  if (context.state !== 'running') {
    RESUME_EVENTS.forEach((type) => window.addEventListener(type, resume, true))
    context.addEventListener('statechange', onStateChange)
    resume()
  }

  let closed = false
  const close = async () => {
    if (closed) {
      return
    }
    closed = true
    window.clearInterval(watchdog)
    removeResumeListeners()
    context.removeEventListener('statechange', onStateChange)
    track?.removeEventListener('ended', onTrackEnded)
    stopCapture()
    stream.getTracks().forEach((t) => t.stop())
    await context.close().catch(() => undefined)
  }
  function onTrackEnded() {
    void close()
    options.onEnded()
  }
  track?.addEventListener('ended', onTrackEnded)

  return { inputLabel: track?.label || 'Audio input', disconnect: close }
}
