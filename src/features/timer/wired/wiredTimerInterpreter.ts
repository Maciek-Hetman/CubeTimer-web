// Turns the packet stream of a wired timer into timer events.
//
// Brands disagree on the status letter, so it can't be trusted on its own:
// - Speed Stacks Gen 2/3 and some clones use it fully: 'I' reset, 'L'/'R' one hand,
//   'C' both hands, 'A' ready, ' ' running, 'S' stopped.
// - Speed Stacks Gen 4 only sends ' ' while running and 'I' otherwise.
// - GAN Halo sends 'I' throughout, and MoYu packets have no status at all.
// - Some clones send 'S' all the time.
// A timer is always counting while it runs, and a packet goes out about every 110 ms, so a
// rising time means running and a repeated time means stopped. The letters only speed things
// up where they agree with that. Packets carry a weak checksum, so a single odd packet is never
// enough to save a solve.

import type { SmartTimerEvent, SmartTimerListener } from '../bluetooth/types'
import type { WiredTimerPacket } from './signalDecoder'

/** Longest plausible time on the first packet after a timer starts counting. */
const START_WINDOW_MS = 1000

type HandsState = Extract<SmartTimerEvent['state'], 'idle' | 'hands_on' | 'ready'>

function handsFromHeader(header: WiredTimerPacket['header']): HandsState {
  switch (header) {
    case 'A':
      return 'ready'
    case 'C':
    case 'L':
    case 'R':
      return 'hands_on'
    default:
      return 'idle'
  }
}

export interface WiredTimerInterpreter {
  push(packet: WiredTimerPacket): void
  /** Forget everything seen so far, e.g. after the signal was lost. */
  reset(): void
}

export function createWiredTimerInterpreter(onEvent: SmartTimerListener): WiredTimerInterpreter {
  let previous: WiredTimerPacket | null = null
  let previousRose = false
  let running = false
  let backwardsCount = 0
  let hands: HandsState | null = null

  function setHands(next: HandsState): void {
    if (next !== hands) {
      hands = next
      onEvent({ state: next })
    }
  }

  function accept(packet: WiredTimerPacket, rose: boolean): void {
    previous = packet
    previousRose = rose
  }

  return {
    push(packet) {
      if (!previous) {
        accept(packet, false)
        setHands(handsFromHeader(packet.header))
        return
      }
      const { timeMs, header } = packet
      const lastMs = previous.timeMs
      // A switch to 'S' is an explicit stop. A timer that sends 'S' all the time says nothing.
      const stopHeader = header === 'S' && previous.header !== 'S'

      if (running) {
        if (timeMs < lastMs) {
          // Going backwards is either a corrupted packet or a reset mid-solve.
          backwardsCount++
          if (timeMs === 0 || backwardsCount >= 2) {
            running = false
            backwardsCount = 0
            accept(packet, false)
            hands = 'idle'
            onEvent({ state: 'idle' })
          }
          return
        }
        backwardsCount = 0
        if (stopHeader || timeMs === lastMs) {
          running = false
          accept(packet, false)
          hands = 'idle'
          onEvent(timeMs > 0 ? { state: 'stopped', timeMs } : { state: 'idle' })
          return
        }
        accept(packet, true)
        return
      }

      const rose = timeMs > lastMs
      // Start on a rise from zero, a rise the header confirms, or two rises in a row.
      const started =
        rose &&
        !stopHeader &&
        ((lastMs === 0 && timeMs <= START_WINDOW_MS) || header === ' ' || previousRose)
      if (started) {
        running = true
        accept(packet, true)
        onEvent({ state: 'running', elapsedMs: timeMs })
        return
      }
      const wasReset = timeMs === 0 && lastMs > 0
      accept(packet, rose)
      if (wasReset) {
        hands = 'idle'
        onEvent({ state: 'idle' })
      }
      setHands(handsFromHeader(header))
    },
    reset() {
      previous = null
      previousRose = false
      running = false
      backwardsCount = 0
      hands = null
    },
  }
}
