import { describe, expect, it } from 'vitest'
import { createAes128 } from './aes128'
import { parseGanTimerPacket } from './ganTimer'
import {
  buildQiyiHelloPayload,
  crc16modbus,
  encodeQiyiMessage,
  macFromQiyiName,
  parseQiyiState,
  QiyiPacketDecoder,
} from './qiyiTimer'

const hex = (bytes: number[]) => bytes.map((b) => b.toString(16).padStart(2, '0')).join('')
const fromHex = (value: string) => value.match(/../g)!.map((b) => parseInt(b, 16))
const QIYI_KEY = new Array<number>(16).fill(0x77)

describe('aes128', () => {
  it('matches the FIPS-197 test vector', () => {
    const aes = createAes128(fromHex('000102030405060708090a0b0c0d0e0f'))
    const cipher = aes.encryptBlock(fromHex('00112233445566778899aabbccddeeff'))
    expect(hex(cipher)).toBe('69c4e0d86a7b0430d8cdb78070b4c55a')
    expect(hex(aes.decryptBlock(cipher))).toBe('00112233445566778899aabbccddeeff')
  })
})

describe('qiyi timer protocol', () => {
  it('computes CRC-16/MODBUS', () => {
    expect(crc16modbus(Array.from('123456789', (c) => c.charCodeAt(0)))).toBe(0x4b37)
  })

  it('splits messages into 20-byte packets with the expected headers', () => {
    const packets = encodeQiyiMessage(createAes128(QIYI_KEY), 1, 0, 1, buildQiyiHelloPayload('CC:A8:00:00:12:34'))
    // 12 header + 17 payload + 2 crc = 31 bytes → two AES blocks
    expect(packets).toHaveLength(2)
    expect(Array.from(packets[0].slice(0, 4))).toEqual([0x00, 33, 0x40, 0x00])
    expect(packets[0]).toHaveLength(20)
    expect(packets[1][0]).toBe(1)
    expect(packets[1]).toHaveLength(17)
  })

  it('reverses the MAC into the hello payload', () => {
    expect(buildQiyiHelloPayload('CC:A8:00:00:12:34').slice(-6)).toEqual([0x34, 0x12, 0x00, 0x00, 0xa8, 0xcc])
  })

  it('decodes a multi-packet solve record and requests an ack', () => {
    const aes = createAes128(QIYI_KEY)
    const payload = [1, 1, 0, 12, 0, 0, 0, 0, ...[0, 0, 0x30, 0x39], ...[0, 0, 0x3a, 0x98]]
    const packets = encodeQiyiMessage(aes, 7, 3, 0x1003, payload)
    const decoder = new QiyiPacketDecoder(aes)
    const results = packets.map((packet) => decoder.push(packet))
    expect(results.slice(0, -1).every((r) => r === null)).toBe(true)
    const message = results.at(-1)!
    expect(message).toMatchObject({ sendSn: 7, ackSn: 3, cmd: 0x1003, payload })
    expect(parseQiyiState(message)).toEqual({ event: { state: 'stopped', timeMs: 12345 }, needsAck: true })
  })

  it('maps timer status updates', () => {
    const aes = createAes128(QIYI_KEY)
    const decode = (state: number, time = 0) => {
      const decoder = new QiyiPacketDecoder(aes)
      const packets = encodeQiyiMessage(aes, 1, 1, 0x1003, [4, 4, 0, 5, state, 0, 0, (time >> 8) & 0xff, time & 0xff])
      return parseQiyiState(packets.map((p) => decoder.push(p)).at(-1)!).event
    }
    expect(decode(0)).toEqual({ state: 'idle' })
    expect(decode(2)).toEqual({ state: 'ready' })
    expect(decode(3)).toEqual({ state: 'running' })
    expect(decode(5, 9876)).toEqual({ state: 'stopped', timeMs: 9876 })
  })

  it('rejects packets with a bad CRC', () => {
    const aes = createAes128(QIYI_KEY)
    const [packet] = encodeQiyiMessage(aes, 1, 1, 0x1003, [4, 4, 0, 1, 3])
    const block = aes.decryptBlock(packet.slice(4))
    block[13] ^= 0xff
    const corrupted = [...packet.slice(0, 4), ...aes.encryptBlock(block)]
    expect(new QiyiPacketDecoder(aes).push(corrupted)).toBeNull()
  })

  it('derives the MAC from the advertised name', () => {
    expect(macFromQiyiName('QY-Adapter-1A2B')).toBe('CC:A8:00:00:1A:2B')
    expect(macFromQiyiName('QY-Timer-00FF')).toBe('CC:A1:00:00:00:FF')
    expect(macFromQiyiName('Something')).toBeNull()
  })
})

describe('gan timer protocol', () => {
  function ganPacket(state: number, time: [number, number, number] = [0, 0, 0]): DataView {
    const bytes = [0xfe, 0x08, 0x01, state, time[0], time[1], time[2] & 0xff, time[2] >> 8]
    let crc = 0xffff
    for (const byte of bytes.slice(2)) {
      crc ^= byte << 8
      for (let i = 0; i < 8; i++) {
        crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1
      }
    }
    crc &= 0xffff
    return new DataView(Uint8Array.from([...bytes, crc & 0xff, crc >> 8]).buffer)
  }

  it('parses a stopped event with the recorded time', () => {
    expect(parseGanTimerPacket(ganPacket(4, [1, 2, 345]))).toEqual({ state: 'stopped', timeMs: 62_345 })
    expect(parseGanTimerPacket(ganPacket(1))).toEqual({ state: 'ready' })
    expect(parseGanTimerPacket(ganPacket(3))).toEqual({ state: 'running' })
  })

  it('ignores invalid packets', () => {
    const packet = ganPacket(3)
    packet.setUint8(3, 4)
    expect(parseGanTimerPacket(packet)).toBeNull()
  })
})
