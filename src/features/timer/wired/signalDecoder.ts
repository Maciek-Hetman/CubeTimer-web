// Decodes the audio signal of a wired timer plugged into a microphone or line input.
//
// Stackmat-compatible timers (Speed Stacks, QiYi, YJ, GAN Halo and most clones) send an
// RS-232-style serial stream: 1200 baud, 8 data bits, no parity, 1 stop bit. A packet is
//   header, minutes, 2 second digits, 2 or 3 fraction digits, checksum, CR/LF
// so 9 bytes for hundredths (Gen 2/3, QiYi, most clones) or 10 bytes for thousandths (Gen 4+).
// The checksum is 64 plus the sum of the digits. The header is a status letter, but only some
// timers fill it in, so the interpreter mostly relies on the time itself.
//
// MoYu timers use their own pulse format at 8000 units/s: after a gap, 24 pulses carry six BCD
// digits of the time in milliseconds, least significant digit first, each digit LSB first; a
// pulse two or more units long is a 1. This follows csTimer's MoYu decoder; which way round the
// pulses read is worked out from the digits, as usually only one reading is valid BCD.
//
// References: csTimer (src/js/hardware/stackmat.js) and m9aertner/StackMatGen4TimerTeensy.
//
// Sound cards AC-couple their input, so a steady level sags toward zero and slicing by level
// loses bits. Instead, edges are found by comparing each sample with one a quarter bit earlier,
// and bits come from the run lengths between edges. The input may also be inverted, so the
// resting level is learned from the long gap between packets instead of assumed.

import type { WiredTimerProtocol } from '../../../domain/models'

export const STACKMAT_HEADERS = [' ', 'A', 'C', 'I', 'L', 'R', 'S'] as const
export type StackmatHeader = (typeof STACKMAT_HEADERS)[number]

export interface WiredTimerPacket {
  /** Status letter of a Stackmat packet; null for protocols without one. */
  header: StackmatHeader | null
  timeMs: number
}

export interface WiredTimerDecoder {
  process(samples: Float32Array): void
}

type Level = 0 | 1

interface Framer {
  /** A steady level lasting `bits` bit periods, ended by an edge. */
  run(level: Level, bits: number): void
  /** The line has rested at `level` long enough to count as the gap between packets. */
  gap(level: Level): void
}

const UNITS_PER_SECOND: Record<WiredTimerProtocol, number> = { stackmat: 1200, moyu: 8000 }

/** A steady level at least this many bits long is the gap between packets. */
const GAP_BITS = 11
/** An edge must be at least this fraction of the recent strongest edge. */
const EDGE_RATIO = 0.5
/** Ignore changes smaller than this, so silence doesn't count as edges. */
const MIN_EDGE = 0.0005
/** Bit periods for the edge-strength envelope to decay by 1/e: slow enough to keep noise out
 * during the gap between packets, fast enough to recover from a loud click. */
const ENVELOPE_DECAY_BITS = 400

const DIGIT_0 = 0x30
const DIGIT_9 = 0x39
const MOYU_PULSES = 24

function isDigit(byte: number): boolean {
  return byte >= DIGIT_0 && byte <= DIGIT_9
}

/** Parses one Stackmat packet (header through CR/LF). Returns null unless it checks out. */
export function decodeStackmatPacket(bytes: readonly number[]): WiredTimerPacket | null {
  if (bytes.length !== 9 && bytes.length !== 10) {
    return null
  }
  const header = String.fromCharCode(bytes[0]) as StackmatHeader
  if (!STACKMAT_HEADERS.includes(header)) {
    return null
  }
  const digits = bytes.slice(1, bytes.length - 3)
  if (!digits.every(isDigit)) {
    return null
  }
  const values = digits.map((byte) => byte - DIGIT_0)
  if (bytes[bytes.length - 3] !== 64 + values.reduce((sum, value) => sum + value, 0)) {
    return null
  }
  const [minutes, tens, ones, ...fraction] = values
  if (tens > 5) {
    return null
  }
  // Hundredths come as 2 digits, thousandths as 3.
  const fractionMs = fraction.reduce((total, digit) => total * 10 + digit, 0) * (fraction.length === 2 ? 10 : 1)
  return { header, timeMs: minutes * 60_000 + (tens * 10 + ones) * 1000 + fractionMs }
}

function moyuDigits(bits: readonly Level[], inverted: boolean): number[] | null {
  const digits: number[] = []
  for (let digit = 0; digit < 6; digit++) {
    let value = 0
    for (let bit = 0; bit < 4; bit++) {
      value |= (bits[digit * 4 + bit] ^ (inverted ? 1 : 0)) << bit
    }
    if (value > 9) {
      return null
    }
    digits.push(value)
  }
  return digits
}

/** Serial 8N1 framing for Stackmat timers. */
function createStackmatFramer(onPacket: (packet: WiredTimerPacket) => void): Framer {
  let idle: Level | null = null
  let bytes: number[] = []
  // -1 while waiting for a start bit, 0-7 for data bits, 8 for the stop bit.
  let bitIndex = -1
  let value = 0
  let broken = false

  function bit(level: Level): void {
    if (bitIndex < 0) {
      if (level !== idle) {
        bitIndex = 0
        value = 0
      }
      return
    }
    if (bitIndex < 8) {
      // The resting level is a 1 ("mark").
      if (level === idle) {
        value |= 1 << bitIndex
      }
      bitIndex++
      return
    }
    bitIndex = -1
    if (level !== idle) {
      broken = true // framing error: drop the rest of this packet
      return
    }
    bytes.push(value)
    if (bytes.length > 10) {
      broken = true
    }
  }

  return {
    run(level, bits) {
      if (bits >= GAP_BITS) {
        this.gap(level)
        return
      }
      if (idle === null || broken) {
        return
      }
      for (let i = 0; i < bits; i++) {
        bit(level)
      }
    },
    gap(level) {
      // The last byte's stop bit (and any trailing 1 bits) run straight into the gap.
      while (idle !== null && bitIndex >= 0 && !broken) {
        bit(level)
      }
      if (!broken && bytes.length > 0) {
        const packet = decodeStackmatPacket(bytes)
        if (packet) {
          onPacket(packet)
        }
      }
      idle = level
      bytes = []
      bitIndex = -1
      broken = false
    },
  }
}

/** Pulse-width framing for MoYu timers. */
function createMoyuFramer(onPacket: (packet: WiredTimerPacket) => void): Framer {
  let idle: Level | null = null
  let bits: Level[] = []
  // Which way round the pulses read, learned from the last packet only one reading fits.
  let inverted = false

  function decode(): void {
    const plain = moyuDigits(bits, false)
    const flipped = moyuDigits(bits, true)
    bits = []
    if (!plain && !flipped) {
      return
    }
    // When both readings are valid digits, keep the orientation seen last.
    if (!plain || !flipped) {
      inverted = !plain
    }
    const digits = (inverted ? flipped : plain)!
    onPacket({ header: null, timeMs: digits.reduceRight((total, digit) => total * 10 + digit, 0) })
  }

  return {
    run(level, units) {
      if (units >= GAP_BITS) {
        this.gap(level)
        return
      }
      if (idle === null || level === idle) {
        return
      }
      bits.push(units >= 2 ? 1 : 0)
      if (bits.length === MOYU_PULSES) {
        decode()
      }
    },
    gap(level) {
      idle = level
      bits = []
    },
  }
}

/** Turns raw audio samples into timer packets. Feed it every captured sample, in order. */
export function createWiredTimerDecoder(options: {
  protocol: WiredTimerProtocol
  sampleRate: number
  onPacket: (packet: WiredTimerPacket) => void
}): WiredTimerDecoder {
  const samplesPerBit = options.sampleRate / UNITS_PER_SECOND[options.protocol]
  const framer = options.protocol === 'moyu' ? createMoyuFramer(options.onPacket) : createStackmatFramer(options.onPacket)

  const lag = Math.max(1, Math.round(samplesPerBit / 4))
  const history = new Float32Array(lag)
  const envelopeDecay = Math.exp(-1 / (samplesPerBit * ENVELOPE_DECAY_BITS))
  const minEdgeSpacing = samplesPerBit / 2
  const gapSamples = samplesPerBit * GAP_BITS

  let cursor = 0
  // Unknown until the first edge: the input may be inverted.
  let level: Level | null = null
  let runSamples = 0
  let envelope = 0
  let gapReported = false

  return {
    process(samples) {
      for (let i = 0; i < samples.length; i++) {
        const sample = samples[i]
        const delta = sample - history[cursor]
        history[cursor] = sample
        cursor = (cursor + 1) % lag

        const strength = Math.abs(delta)
        envelope = Math.max(strength, envelope * envelopeDecay)
        runSamples++

        const direction: Level = delta > 0 ? 1 : 0
        const isEdge =
          direction !== level &&
          strength > MIN_EDGE &&
          strength >= envelope * EDGE_RATIO &&
          runSamples > minEdgeSpacing
        if (isEdge) {
          if (level === null) {
            // A long quiet stretch before the very first edge was a gap at the other level.
            if (runSamples >= gapSamples) {
              framer.gap(direction === 1 ? 0 : 1)
            }
          } else if (!gapReported) {
            framer.run(level, Math.round(runSamples / samplesPerBit))
          }
          level = direction
          runSamples = 0
          gapReported = false
        } else if (level !== null && !gapReported && runSamples >= gapSamples) {
          // Report the gap as soon as it's long enough, so a packet is decoded without
          // waiting for the next one to start.
          gapReported = true
          framer.gap(level)
        }
      }
    },
  }
}
