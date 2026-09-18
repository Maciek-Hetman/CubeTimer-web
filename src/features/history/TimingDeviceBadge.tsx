import type { ReactNode } from 'react'
import type { TimingDevice } from '../../domain/models'
import { BluetoothIcon, CubeIcon, KeyboardIcon } from '../../ui/NavIcons'

const DEVICES: Record<TimingDevice, { label: string; description: string; icon: ReactNode }> = {
  keyboard: { label: 'Keyboard', description: 'Timed with keyboard or touch', icon: <KeyboardIcon /> },
  external_timer: { label: 'Bluetooth', description: 'Timed with a Bluetooth timer', icon: <BluetoothIcon /> },
  smart_cube: { label: 'Smart cube', description: 'Timed with a smart cube', icon: <CubeIcon /> },
}

/** Small pill showing which device timed a solve. `iconOnly` keeps the label for screen readers. */
export function TimingDeviceBadge({ device, iconOnly = false }: { device: TimingDevice; iconOnly?: boolean }) {
  const { label, description, icon } = DEVICES[device]
  return (
    <span className={`device-badge device-${device}${iconOnly ? ' icon-only' : ''}`} title={description}>
      {icon}
      <span className="device-badge-label">{label}</span>
    </span>
  )
}
