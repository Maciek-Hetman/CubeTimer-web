import { describe, expect, it } from 'vitest'
import { createWiredTimerDecoder, decodeStackmatPacket, type WiredTimerPacket } from './signalDecoder'

interface SignalOptions {
  sampleRate?: number
  /** Peak level of the timer signal at the input. */
  amplitude?: number
  /** Sound cards may flip the signal. */
  inverted?: boolean
  /** Cutoff of the input's AC coupling. */
  highPassHz?: number
  /** Peak level of uniform noise. */
  noise?: number
  /** Timer clock error, e.g. 1.03 for 3% slow bits. */
  clockSkew?: number
}

/** Stackmat packet bytes for a status letter and time digits, with a valid checksum. */
function stackmatBytes(header: string, digits: string): number[] {
  const sum = [...digits].reduce((total, digit) => total + Number(digit), 0)
  return [header.charCodeAt(0), ...[...digits].map((d) => d.charCodeAt(0)), 64 + sum, 0x0d, 0x0a]
}

/** 8N1 line levels, 1 = mark (the resting level). */
function uartBits(bytes: number[]): number[] {
  return bytes.flatMap((byte) => [0, ...Array.from({ length: 8 }, (_, i) => (byte >> i) & 1), 1])
}

/** Renders levels (1 = electrically high) as audio after the input's AC coupling, noise and so on. */
function render(levels: number[], unitsPerSecond: number, options: SignalOptions = {}): Float32Array {
  const {
    sampleRate = 48_000,
    amplitude = 0.5,
    inverted = false,
    highPassHz = 20,
    noise = 0,
    clockSkew = 1,
  } = options
  const samplesPerUnit = (sampleRate / unitsPerSecond) * clockSkew
  const total = Math.ceil(levels.length * samplesPerUnit)
  const out = new Float32Array(total)
  const rc = 1 / (2 * Math.PI * highPassHz)
  const alpha = rc / (rc + 1 / sampleRate)
  const inputAt = (n: number) =>
    (levels[Math.min(levels.length - 1, Math.floor(n / samplesPerUnit))] === 1) !== inverted ? amplitude : 0
  let seed = 12345
  // Start from a settled line, as if the timer had been plugged in for a while.
  let previousInput = inputAt(0)
  let previousOutput = 0
  for (let n = 0; n < total; n++) {
    const input = inputAt(n)
    const output = alpha * (previousOutput + input - previousInput)
    previousInput = input
    previousOutput = output
    seed = (seed * 1_103_515_245 + 12_345) & 0x7fffffff
    out[n] = output + (seed / 0x7fffffff - 0.5) * 2 * noise
  }
  return out
}

/** A Stackmat line: idle-low, so a mark (resting) bit is 0 V. */
function stackmatSignal(packets: number[][], options?: SignalOptions): Float32Array {
  const gap = Array<number>(60).fill(1)
  const marks = [...gap, ...packets.flatMap((bytes) => [...uartBits(bytes), ...gap])]
  return render(
    marks.map((mark) => 1 - mark),
    1200,
    options,
  )
}

function decodeAll(samples: Float32Array, protocol: 'stackmat' | 'moyu', sampleRate = 48_000, chunk = 128) {
  const packets: WiredTimerPacket[] = []
  const decoder = createWiredTimerDecoder({ protocol, sampleRate, onPacket: (p) => packets.push(p) })
  for (let i = 0; i < samples.length; i += chunk) {
    decoder.process(samples.subarray(i, i + chunk))
  }
  return packets
}

describe('decodeStackmatPacket', () => {
  it('reads 10-byte packets in milliseconds', () => {
    expect(decodeStackmatPacket(stackmatBytes('I', '108169'))).toEqual({ header: 'I', timeMs: 68_169 })
  })

  it('reads 9-byte packets in hundredths', () => {
    expect(decodeStackmatPacket(stackmatBytes(' ', '01234'))).toEqual({ header: ' ', timeMs: 12_340 })
  })

  it('rejects bad checksums, headers, digits and lengths', () => {
    const badChecksum = stackmatBytes('I', '01234')
    badChecksum[6]++
    expect(decodeStackmatPacket(badChecksum)).toBeNull()
    expect(decodeStackmatPacket(stackmatBytes('X', '01234'))).toBeNull()
    expect(decodeStackmatPacket(stackmatBytes('I', '0123:'))).toBeNull()
    expect(decodeStackmatPacket(stackmatBytes('I', '0612345'))).toBeNull()
    expect(decodeStackmatPacket(stackmatBytes('I', '07000'))).toBeNull() // 70 seconds
  })
})

describe('createWiredTimerDecoder (Stackmat)', () => {
  const packets = [stackmatBytes('I', '000000'), stackmatBytes(' ', '000512'), stackmatBytes('S', '108169')]
  const expected = [
    { header: 'I', timeMs: 0 },
    { header: ' ', timeMs: 512 },
    { header: 'S', timeMs: 68_169 },
  ]

  it('decodes a clean signal', () => {
    expect(decodeAll(stackmatSignal(packets), 'stackmat')).toEqual(expected)
  })

  it('decodes 9-byte packets at 44.1 kHz', () => {
    const signal = stackmatSignal([stackmatBytes('A', '00000'), stackmatBytes(' ', '01234')], { sampleRate: 44_100 })
    expect(decodeAll(signal, 'stackmat', 44_100)).toEqual([
      { header: 'A', timeMs: 0 },
      { header: ' ', timeMs: 12_340 },
    ])
  })

  it.each([
    ['an inverted input', { inverted: true }],
    ['strong AC coupling', { highPassHz: 100 }],
    ['strong AC coupling, inverted', { highPassHz: 100, inverted: true }],
    ['weak AC coupling', { highPassHz: 2 }],
    ['a faint, noisy signal', { amplitude: 0.003, noise: 0.0004 }],
    ['a noisy signal', { amplitude: 0.01, noise: 0.002 }],
    ['a timer clock running 3% slow', { clockSkew: 1.03 }],
    ['a timer clock running 3% fast', { clockSkew: 0.97 }],
    [
      'everything at once at 44.1 kHz',
      { sampleRate: 44_100, inverted: true, highPassHz: 100, amplitude: 0.02, noise: 0.003, clockSkew: 1.02 },
    ],
  ])('decodes %s', (_name, options: SignalOptions) => {
    // Until the decoder has seen an edge it can't tell noise from signal, so the first
    // packet after plugging in may be lost. Real timers send about 9 per second.
    const warmUp = stackmatBytes('I', '000000')
    const decoded = decodeAll(stackmatSignal([warmUp, ...packets], options), 'stackmat', options.sampleRate)
    expect(decoded.slice(-expected.length)).toEqual(expected)
    expect(decoded.length).toBeLessThanOrEqual(expected.length + 1)
  })

  it('handles audio arriving in odd-sized chunks', () => {
    expect(decodeAll(stackmatSignal(packets), 'stackmat', 48_000, 77)).toEqual(expected)
  })

  it('drops packets that fail the checksum', () => {
    const corrupt = stackmatBytes('I', '001000')
    corrupt[7] += 1
    expect(decodeAll(stackmatSignal([corrupt, stackmatBytes('I', '001000')]), 'stackmat')).toEqual([
      { header: 'I', timeMs: 1000 },
    ])
  })

  it('finds nothing in noise or silence', () => {
    const noise = render(Array<number>(1200).fill(0), 1200, { noise: 0.05 })
    expect(decodeAll(noise, 'stackmat')).toEqual([])
    expect(decodeAll(new Float32Array(48_000), 'stackmat')).toEqual([])
  })
})

describe('createWiredTimerDecoder (MoYu)', () => {
  /** Line levels (1 = high) for one MoYu frame, digits least significant first. */
  function moyuFrame(timeMs: number, longPulseBit = 1): number[] {
    const digits = String(timeMs).padStart(6, '0').split('').reverse().map(Number)
    const levels: number[] = []
    for (const digit of digits) {
      for (let bit = 0; bit < 4; bit++) {
        levels.push(...(((digit >> bit) & 1) === longPulseBit ? [1, 1] : [1]), 0, 0)
      }
    }
    return [...levels, ...Array<number>(40).fill(0)]
  }

  function moyuSignal(times: number[], options?: SignalOptions, longPulseBit = 1): Float32Array {
    const frames = times.flatMap((time) => moyuFrame(time, longPulseBit))
    return render([...Array<number>(40).fill(0), ...frames], 8000, options)
  }

  it('decodes the time from pulse widths', () => {
    expect(decodeAll(moyuSignal([0, 12_345, 68_169]), 'moyu')).toEqual([
      { header: null, timeMs: 0 },
      { header: null, timeMs: 12_345 },
      { header: null, timeMs: 68_169 },
    ])
  })

  it('reads pulses the other way round when only that gives valid digits', () => {
    expect(decodeAll(moyuSignal([0, 12_345], {}, 0), 'moyu')).toEqual([
      { header: null, timeMs: 0 },
      { header: null, timeMs: 12_345 },
    ])
  })

  it('decodes at 44.1 kHz', () => {
    expect(decodeAll(moyuSignal([4_321], { sampleRate: 44_100 }), 'moyu', 44_100)).toEqual([
      { header: null, timeMs: 4_321 },
    ])
  })

  it('decodes an inverted input', () => {
    expect(decodeAll(moyuSignal([0, 12_345], { inverted: true, highPassHz: 50 }), 'moyu')).toEqual([
      { header: null, timeMs: 0 },
      { header: null, timeMs: 12_345 },
    ])
  })
})
