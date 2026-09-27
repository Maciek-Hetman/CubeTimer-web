import { useEffect, useState } from 'react'
import { useSettings } from '../../contexts/SettingsContext'
import { useWiredTimer } from '../../contexts/WiredTimerContext'
import type { WiredTimerProtocol } from '../../domain/models'
import { Field } from '../../ui/Field'
import { Select } from '../../ui/Select'
import { WiredTimerControls } from '../timer/WiredTimerControls'
import { listAudioInputs, type AudioInput } from '../timer/wired/wiredTimer'

/** Protocol and audio input for a timer plugged in by cable. */
export function WiredTimerSettings() {
  const { settings, updateSettings } = useSettings()
  const { status, inputLabel } = useWiredTimer()
  const [inputs, setInputs] = useState<AudioInput[]>([])
  const inputId = settings.wiredTimerInputId

  // Browsers only name inputs once the microphone is allowed, so list them again after connecting.
  const hasAccess = status === 'listening' || status === 'connected'
  useEffect(() => {
    let cancelled = false
    const refresh = () => {
      listAudioInputs()
        .then((list) => {
          if (!cancelled) {
            setInputs(list)
          }
        })
        .catch(() => undefined)
    }
    refresh()
    navigator.mediaDevices?.addEventListener?.('devicechange', refresh)
    return () => {
      cancelled = true
      navigator.mediaDevices?.removeEventListener?.('devicechange', refresh)
    }
  }, [hasAccess])

  const inputOptions = [
    { value: '', label: 'System default' },
    ...inputs.map((input) => ({ value: input.deviceId, label: input.label })),
  ]
  if (inputId && !inputs.some((input) => input.deviceId === inputId)) {
    inputOptions.push({ value: inputId, label: inputLabel ?? 'Saved input' })
  }

  return (
    <>
      <p className="muted">
        Plug the timer's data port into a microphone or line-in jack, using a 2.5 mm to 3.5 mm cable or a USB audio
        adapter. Phones and laptops with a combined headset jack need a TRRS adapter.
      </p>
      <Field label="Wired timer type">
        <Select
          value={settings.wiredTimerProtocol}
          onChange={(val) => void updateSettings({ wiredTimerProtocol: val as WiredTimerProtocol })}
          options={[
            { value: 'stackmat', label: 'Stackmat (most timers)' },
            { value: 'moyu', label: 'MoYu' },
          ]}
        />
      </Field>
      <Field label="Audio input">
        <Select
          value={inputId}
          onChange={(val) => void updateSettings({ wiredTimerInputId: val })}
          options={inputOptions}
        />
      </Field>
      <WiredTimerControls />
    </>
  )
}
