// Normalized events emitted by every external (Bluetooth or wired) timer driver.
export type SmartTimerEvent =
  | { state: 'idle' }
  | { state: 'inspection' }
  | { state: 'hands_on' }
  | { state: 'hands_off' }
  | { state: 'ready' }
  /** `elapsedMs` is set when the timer reports how long it has already been running. */
  | { state: 'running'; elapsedMs?: number }
  | { state: 'stopped'; timeMs: number }
  | { state: 'disconnected' }

export type SmartTimerListener = (event: SmartTimerEvent) => void

export interface SmartTimerDriver {
  start(): Promise<void>
  stop(): Promise<void>
}

// Minimal Web Bluetooth typings (the DOM lib does not ship them).
export interface BtCharacteristic extends EventTarget {
  uuid: string
  value?: DataView
  startNotifications(): Promise<BtCharacteristic>
  stopNotifications(): Promise<BtCharacteristic>
  writeValue(value: BufferSource): Promise<void>
}

export interface BtService {
  getCharacteristic(uuid: string): Promise<BtCharacteristic>
  getCharacteristics(): Promise<BtCharacteristic[]>
}

export interface BtGattServer {
  connected: boolean
  connect(): Promise<BtGattServer>
  disconnect(): void
  getPrimaryService(uuid: string): Promise<BtService>
}

export interface BtAdvertisementEvent extends Event {
  manufacturerData?: Map<number, DataView>
}

export interface BtDevice extends EventTarget {
  name?: string
  gatt?: BtGattServer
  watchAdvertisements?(options?: { signal?: AbortSignal }): Promise<void>
}

export interface BtRequestDeviceOptions {
  filters: Array<{ namePrefix?: string; services?: string[] }>
  optionalServices?: string[]
  optionalManufacturerData?: number[]
}

export interface BtBluetooth {
  requestDevice(options: BtRequestDeviceOptions): Promise<BtDevice>
}
