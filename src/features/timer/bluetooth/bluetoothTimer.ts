import { createGanTimerDriver, GAN_NAME_PREFIXES, GAN_SERVICE_UUID } from './ganTimer'
import {
  createQiyiTimerDriver,
  QIYI_MANUFACTURER_IDS,
  QIYI_NAME_PREFIXES,
  QIYI_SERVICE_UUID,
  type QiyiDriverOptions,
} from './qiyiTimer'
import type { BtBluetooth, BtDevice, SmartTimerDriver, SmartTimerListener } from './types'

export interface BluetoothTimerConnection {
  deviceName: string
  disconnect(): Promise<void>
}

function getBluetooth(): BtBluetooth | null {
  if (typeof navigator === 'undefined') {
    return null
  }
  return (navigator as Navigator & { bluetooth?: BtBluetooth }).bluetooth ?? null
}

export function isWebBluetoothSupported(): boolean {
  return getBluetooth() !== null
}

function createDriver(device: BtDevice, onEvent: SmartTimerListener, options: QiyiDriverOptions): SmartTimerDriver {
  const name = device.name ?? ''
  if (QIYI_NAME_PREFIXES.some((prefix) => name.startsWith(prefix))) {
    return createQiyiTimerDriver(device, onEvent, options)
  }
  // GAN timers are also matched by service UUID, since some don't advertise a name.
  return createGanTimerDriver(device, onEvent)
}

/** Opens the browser's device picker and connects to the chosen timer. Must run in a user gesture. */
export async function connectBluetoothTimer(
  onEvent: SmartTimerListener,
  options: QiyiDriverOptions,
): Promise<BluetoothTimerConnection> {
  const bluetooth = getBluetooth()
  if (!bluetooth) {
    throw new Error('Web Bluetooth is not supported in this browser. Try Chrome or Edge.')
  }
  const device = await bluetooth.requestDevice({
    filters: [
      ...[...QIYI_NAME_PREFIXES, ...GAN_NAME_PREFIXES].map((namePrefix) => ({ namePrefix })),
      { services: [GAN_SERVICE_UUID] },
    ],
    optionalServices: [QIYI_SERVICE_UUID, GAN_SERVICE_UUID],
    optionalManufacturerData: QIYI_MANUFACTURER_IDS,
  })

  let closed = false
  const onDisconnected = () => {
    if (closed) {
      return
    }
    closed = true
    void driver.stop()
    onEvent({ state: 'disconnected' })
  }

  const driver = createDriver(device, onEvent, options)
  device.addEventListener('gattserverdisconnected', onDisconnected)
  try {
    await driver.start()
  } catch (error) {
    closed = true
    device.removeEventListener('gattserverdisconnected', onDisconnected)
    device.gatt?.disconnect()
    throw error
  }

  return {
    deviceName: device.name ?? 'Bluetooth timer',
    async disconnect() {
      if (closed) {
        return
      }
      closed = true
      device.removeEventListener('gattserverdisconnected', onDisconnected)
      await driver.stop()
      device.gatt?.disconnect()
    },
  }
}
