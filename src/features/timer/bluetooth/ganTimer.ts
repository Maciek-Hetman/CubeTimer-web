// GAN Smart Timer driver. Protocol reference: csTimer / afedotov/gan-web-bluetooth.
import type { BtCharacteristic, BtDevice, SmartTimerDriver, SmartTimerEvent, SmartTimerListener } from './types'

export const GAN_SERVICE_UUID = '0000fff0-0000-1000-8000-00805f9b34fb'
const GAN_STATE_CHARACTERISTIC_UUID = '0000fff5-0000-1000-8000-00805f9b34fb'
export const GAN_NAME_PREFIXES = ['GAN', 'Gan', 'gan']

const GAN_STATES: Array<SmartTimerEvent['state'] | null> = [
  'disconnected',
  'ready', // GET_SET
  'hands_off',
  'running',
  'stopped',
  'idle', // reset
  'hands_on',
  null, // finished (follows stopped)
]

function crc16ccitt(bytes: Uint8Array): number {
  let crc = 0xffff
  for (const byte of bytes) {
    crc ^= byte << 8
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1
    }
  }
  return crc & 0xffff
}

export function parseGanTimerPacket(data: DataView): SmartTimerEvent | null {
  if (data.byteLength < 4 || data.getUint8(0) !== 0xfe) {
    return null
  }
  const body = new Uint8Array(data.buffer, data.byteOffset + 2, data.byteLength - 4)
  if (data.getUint16(data.byteLength - 2, true) !== crc16ccitt(body)) {
    return null
  }
  const state = GAN_STATES[data.getUint8(3)]
  if (!state || state === 'disconnected') {
    return null
  }
  if (state === 'stopped') {
    const timeMs = 60_000 * data.getUint8(4) + 1000 * data.getUint8(5) + data.getUint16(6, true)
    return { state, timeMs }
  }
  return { state } as SmartTimerEvent
}

export function createGanTimerDriver(device: BtDevice, onEvent: SmartTimerListener): SmartTimerDriver {
  let characteristic: BtCharacteristic | null = null

  const onNotification = (event: Event) => {
    const value = (event.target as BtCharacteristic).value
    const parsed = value ? parseGanTimerPacket(value) : null
    if (parsed) {
      onEvent(parsed)
    }
  }

  return {
    async start() {
      const server = await device.gatt!.connect()
      const service = await server.getPrimaryService(GAN_SERVICE_UUID)
      characteristic = await service.getCharacteristic(GAN_STATE_CHARACTERISTIC_UUID)
      characteristic.addEventListener('characteristicvaluechanged', onNotification)
      await characteristic.startNotifications()
    },
    async stop() {
      const current = characteristic
      characteristic = null
      if (current) {
        current.removeEventListener('characteristicvaluechanged', onNotification)
        await current.stopNotifications().catch(() => undefined)
      }
    },
  }
}
