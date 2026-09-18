// QiYi Smart Timer / QiYi timer Bluetooth adapter driver.
// Protocol reference: csTimer (src/js/hardware/qiyitimer.js).
import { createAes128, type Aes128 } from './aes128'
import type {
  BtAdvertisementEvent,
  BtCharacteristic,
  BtDevice,
  SmartTimerDriver,
  SmartTimerEvent,
  SmartTimerListener,
} from './types'

export const QIYI_SERVICE_UUID = '0000fd50-0000-1000-8000-00805f9b34fb'
const UUID_SUFFIX = '-0000-1001-8001-00805f9b07d0'
const WRITE_CHARACTERISTIC_UUID = `00000001${UUID_SUFFIX}`
const READ_CHARACTERISTIC_UUID = `00000002${UUID_SUFFIX}`
export const QIYI_MANUFACTURER_IDS = [0x0504]
export const QIYI_NAME_PREFIXES = ['QY-Timer', 'QY-Adapter']

const CMD_HELLO = 0x0001
const CMD_STATE = 0x1003
const AES_KEY = new Array<number>(16).fill(0x77)

export function crc16modbus(data: ArrayLike<number>): number {
  let crc = 0xffff
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i]
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >> 1) ^ 0xa001 : crc >> 1
    }
  }
  return crc
}

function u32(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]
}

function readU32(data: ArrayLike<number>, offset: number): number {
  return ((data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3]) >>> 0
}

/** Builds the encrypted BLE packets (≤ 20 bytes each) for one protocol message. */
export function encodeQiyiMessage(
  cipher: Aes128,
  sendSn: number,
  ackSn: number,
  cmd: number,
  payload: number[],
): Uint8Array<ArrayBuffer>[] {
  const msg = [...u32(sendSn), ...u32(ackSn), (cmd >> 8) & 0xff, cmd & 0xff, (payload.length >> 8) & 0xff, payload.length & 0xff, ...payload]
  const crc = crc16modbus(msg)
  msg.push(crc >> 8, crc & 0xff)

  const packets: Uint8Array<ArrayBuffer>[] = []
  for (let i = 0; i < msg.length; i += 16) {
    const block = msg.slice(i, i + 16)
    while (block.length < 16) {
      block.push(1)
    }
    const header = i === 0 ? [0x00, msg.length + 2, 0x40, 0x00] : [i >> 4]
    packets.push(Uint8Array.from([...header, ...cipher.encryptBlock(block)]))
  }
  return packets
}

export interface QiyiMessage {
  sendSn: number
  ackSn: number
  cmd: number
  payload: number[]
}

/** Reassembles and decrypts packets coming from the timer's notify characteristic. */
export class QiyiPacketDecoder {
  private expectedPacket = 0
  private payloadLength = 0
  private buffer: number[] = []
  private readonly cipher: Aes128

  constructor(cipher: Aes128) {
    this.cipher = cipher
  }

  private reset(): void {
    this.expectedPacket = 0
    this.buffer = []
  }

  push(packet: ArrayLike<number>): QiyiMessage | null {
    let bytes = Array.from(packet)
    if (bytes[0] !== this.expectedPacket) {
      this.reset()
      if (bytes[0] !== 0) {
        return null
      }
    }
    if (bytes[0] === 0) {
      this.payloadLength = bytes[1] - 2
      bytes = bytes.slice(4)
    } else {
      bytes = bytes.slice(1)
    }
    for (let i = 0; i < bytes.length; i += 16) {
      const block = bytes.slice(i, i + 16)
      if (block.length < 16) {
        this.reset()
        return null
      }
      this.buffer.push(...this.cipher.decryptBlock(block))
    }
    if (this.buffer.length < this.payloadLength) {
      this.expectedPacket++
      return null
    }
    const data = this.buffer.slice(0, this.payloadLength)
    this.reset()

    const length = (data[10] << 8) | data[11]
    if (data.length < length + 14) {
      return null
    }
    const crc = crc16modbus(data.slice(0, length + 12))
    if (crc !== ((data[length + 12] << 8) | data[length + 13])) {
      return null
    }
    return {
      sendSn: readU32(data, 0),
      ackSn: readU32(data, 4),
      cmd: (data[8] << 8) | data[9],
      payload: data.slice(12, length + 12),
    }
  }
}

const QIYI_STATES: Array<SmartTimerEvent['state']> = [
  'idle',
  'inspection',
  'ready',
  'running',
  'stopped', // "finished"
  'stopped',
  'disconnected',
]

export interface ParsedQiyiState {
  event: SmartTimerEvent | null
  needsAck: boolean
}

export function parseQiyiState(message: QiyiMessage): ParsedQiyiState {
  if (message.cmd !== CMD_STATE) {
    return { event: null, needsAck: false }
  }
  const data = message.payload
  const dpId = data[0]
  const dpType = data[1]
  if (dpId === 1 && dpType === 1) {
    // Recorded solve, delivered once and must be acknowledged.
    return { event: { state: 'stopped', timeMs: readU32(data, 8) }, needsAck: true }
  }
  if (dpId === 4 && dpType === 4) {
    const state = QIYI_STATES[data[4]]
    if (!state) {
      return { event: null, needsAck: false }
    }
    if (state === 'stopped') {
      return { event: { state, timeMs: readU32(data, 5) }, needsAck: false }
    }
    return { event: { state } as SmartTimerEvent, needsAck: false }
  }
  return { event: null, needsAck: false }
}

export function buildQiyiHelloPayload(mac: string): number[] {
  const bytes = parseMac(mac)
  if (!bytes) {
    throw new Error(`Invalid MAC address: ${mac}`)
  }
  return [0, 0, 0, 0, 0, 33, 8, 0, 1, 5, 90, ...bytes.reverse()]
}

export function parseMac(mac: string): number[] | null {
  const parts = mac.trim().split(/[:-]/)
  if (parts.length !== 6 || parts.some((part) => !/^[0-9a-fA-F]{2}$/.test(part))) {
    return null
  }
  return parts.map((part) => parseInt(part, 16))
}

/** MAC implied by the advertised name, e.g. "QY-Adapter-1A2B" → CC:A8:00:00:1A:2B. */
export function macFromQiyiName(name: string): string | null {
  const match = /^QY-(Timer|Adapter).*-([0-9A-F]{4})$/i.exec(name.trim())
  if (!match) {
    return null
  }
  const prefix = match[1].toLowerCase() === 'adapter' ? 'CC:A8' : 'CC:A1'
  const suffix = match[2].toUpperCase()
  return `${prefix}:00:00:${suffix.slice(0, 2)}:${suffix.slice(2, 4)}`
}

function macFromManufacturerData(data: Map<number, DataView>): string | null {
  for (const id of QIYI_MANUFACTURER_IDS) {
    const view = data.get(id)
    if (view && view.byteLength >= 6) {
      const bytes: string[] = []
      for (let i = 5; i >= 0; i--) {
        bytes.push(view.getUint8(i).toString(16).padStart(2, '0').toUpperCase())
      }
      return bytes.join(':')
    }
  }
  return null
}

/** Reads the MAC from advertisement data where the browser supports it. */
async function waitForAdvertisedMac(device: BtDevice, timeoutMs: number): Promise<string | null> {
  if (typeof device.watchAdvertisements !== 'function') {
    console.info(
      '[QiyiTimer] cannot read the MAC from advertisements; enable chrome://flags/#enable-experimental-web-platform-features',
    )
    return null
  }
  const abort = new AbortController()
  return new Promise<string | null>((resolve) => {
    const finish = (mac: string | null) => {
      window.clearTimeout(timer)
      device.removeEventListener('advertisementreceived', onAdvertisement)
      abort.abort()
      resolve(mac)
    }
    const onAdvertisement = (event: Event) => {
      const data = (event as BtAdvertisementEvent).manufacturerData
      console.debug(
        '[QiyiTimer] advertisement',
        [...(data ?? new Map<number, DataView>())].map(
          ([id, view]) =>
            `0x${id.toString(16).padStart(4, '0')}: ${Array.from(new Uint8Array(view.buffer, view.byteOffset, view.byteLength), (b) => b.toString(16).padStart(2, '0')).join(' ')}`,
        ),
      )
      if (!data || data.size === 0) {
        return
      }
      const mac = macFromManufacturerData(data)
      if (mac) {
        finish(mac)
      }
    }
    const timer = window.setTimeout(() => {
      console.info('[QiyiTimer] no advertisement with manufacturer data received')
      finish(null)
    }, timeoutMs)
    device.addEventListener('advertisementreceived', onAdvertisement)
    device.watchAdvertisements!({ signal: abort.signal }).catch((error: unknown) => {
      console.info('[QiyiTimer] watchAdvertisements failed', error)
      finish(null)
    })
  })
}

export interface QiyiDriverOptions {
  /** Asks the user for the timer MAC, pre-filled with the best guess (if any). */
  requestMac: (suggested: string | null) => string | null
}

const HELLO_RESPONSE_TIMEOUT_MS = 2500
const MAC_STORAGE_PREFIX = 'cubetimer:qiyi-mac:'

function log(...args: unknown[]): void {
  console.info('[QiyiTimer]', ...args)
}

function toHex(bytes: ArrayLike<number>): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(' ')
}

function loadSavedMac(name: string): string | null {
  try {
    const mac = localStorage.getItem(MAC_STORAGE_PREFIX + name)
    return mac && parseMac(mac) ? mac : null
  } catch {
    return null
  }
}

function saveMac(name: string, mac: string): void {
  try {
    localStorage.setItem(MAC_STORAGE_PREFIX + name, mac)
  } catch {
    // Storage unavailable; the MAC will be detected again next time.
  }
}

export function createQiyiTimerDriver(
  device: BtDevice,
  onEvent: SmartTimerListener,
  options: QiyiDriverOptions,
): SmartTimerDriver {
  const cipher = createAes128(AES_KEY)
  const decoder = new QiyiPacketDecoder(cipher)
  let readCharacteristic: BtCharacteristic | null = null
  let writeCharacteristic: BtCharacteristic | null = null
  let writeQueue: Promise<void> = Promise.resolve()
  let onFirstMessage: (() => void) | null = null

  function send(sendSn: number, ackSn: number, cmd: number, payload: number[]): Promise<void> {
    const packets = encodeQiyiMessage(cipher, sendSn, ackSn, cmd, payload)
    for (const packet of packets) {
      writeQueue = writeQueue
        .then(() => writeCharacteristic?.writeValue(packet))
        .catch((error: unknown) => console.warn('[QiyiTimer] write failed', error))
    }
    return writeQueue
  }

  /** Sends the hello handshake and resolves true once the timer answers with any message. */
  async function handshake(mac: string): Promise<boolean> {
    log('sending hello with MAC', mac)
    const responded = new Promise<boolean>((resolve) => {
      const timer = window.setTimeout(() => {
        onFirstMessage = null
        resolve(false)
      }, HELLO_RESPONSE_TIMEOUT_MS)
      onFirstMessage = () => {
        window.clearTimeout(timer)
        onFirstMessage = null
        resolve(true)
      }
    })
    await send(1, 0, CMD_HELLO, buildQiyiHelloPayload(mac))
    log('hello written; notifications active')
    return responded
  }

  const onNotification = (event: Event) => {
    const value = (event.target as BtCharacteristic).value
    if (!value) {
      return
    }
    const packet = new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
    console.debug('[QiyiTimer] packet', toHex(packet))
    const message = decoder.push(packet)
    if (!message) {
      return
    }
    console.debug('[QiyiTimer] message', `cmd=0x${message.cmd.toString(16).padStart(4, '0')}`, toHex(message.payload))
    onFirstMessage?.()
    const { event: timerEvent, needsAck } = parseQiyiState(message)
    if (needsAck) {
      void send(message.ackSn + 1, message.sendSn, CMD_STATE, [0x00])
    }
    if (timerEvent) {
      console.debug('[QiyiTimer] event', timerEvent)
      onEvent(timerEvent)
    }
  }

  return {
    async start() {
      const name = device.name ?? ''
      const savedMac = loadSavedMac(name)
      const advertisedMac = savedMac ? null : await waitForAdvertisedMac(device, 4000)
      const guessedMac = macFromQiyiName(name)
      log('device', JSON.stringify(name), `saved=${savedMac} advertised=${advertisedMac} guessed=${guessedMac}`)

      let mac = savedMac ?? advertisedMac ?? guessedMac ?? options.requestMac(null)
      if (!mac || !parseMac(mac)) {
        throw new Error('A valid timer MAC address is required to connect to a QiYi timer.')
      }

      const server = await device.gatt!.connect()
      const service = await server.getPrimaryService(QIYI_SERVICE_UUID)
      const characteristics = await service.getCharacteristics()
      log('characteristics', characteristics.map((c) => c.uuid).join(', '))
      readCharacteristic = characteristics.find((c) => c.uuid.toLowerCase() === READ_CHARACTERISTIC_UUID) ?? null
      writeCharacteristic = characteristics.find((c) => c.uuid.toLowerCase() === WRITE_CHARACTERISTIC_UUID) ?? null
      if (!readCharacteristic || !writeCharacteristic) {
        throw new Error('This device does not look like a QiYi timer.')
      }
      readCharacteristic.addEventListener('characteristicvaluechanged', onNotification)
      await readCharacteristic.startNotifications()

      if (await handshake(mac)) {
        saveMac(name, mac)
        return
      }
      if (savedMac || advertisedMac) {
        // The MAC is known to be right; the timer may simply not answer the hello.
        log('no response to hello; waiting for timer events')
        return
      }
      // A guessed MAC may be wrong, and the timer ignores a hello with the wrong MAC.
      log('no response to hello; asking for the MAC address')
      const entered = options.requestMac(mac)
      if (!entered || !parseMac(entered)) {
        log('keeping MAC', mac, '- timer events may not arrive')
        return
      }
      mac = entered.trim().toUpperCase()
      if (await handshake(mac)) {
        saveMac(name, mac)
        return
      }
      log('still no response to hello with MAC', mac)
    },
    async stop() {
      const characteristic = readCharacteristic
      readCharacteristic = null
      writeCharacteristic = null
      onFirstMessage = null
      if (characteristic) {
        characteristic.removeEventListener('characteristicvaluechanged', onNotification)
        await characteristic.stopNotifications().catch(() => undefined)
      }
    },
  }
}
