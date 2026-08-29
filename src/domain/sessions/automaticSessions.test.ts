import { describe, expect, it } from 'vitest'
import {
  automaticSessionName,
  dayPartFromDate,
  shouldReuseAutomaticSession,
  uniqueAutomaticSessionName,
} from './automaticSessions'
import type { CubeSession, Solve } from '../models'

function session(overrides: Partial<CubeSession> = {}): CubeSession {
  return {
    id: 'session-1',
    ownerId: 'guest',
    name: 'Saturday evening',
    event: '3x3',
    kind: 'automatic',
    startedAt: '2026-08-22T18:00:00.000Z',
    endedAt: null,
    archived: false,
    version: 0,
    updatedAt: '2026-08-22T18:00:00.000Z',
    deletedAt: null,
    ...overrides,
  }
}

function solve(solvedAt: string): Solve {
  return {
    id: 'solve-1',
    ownerId: 'guest',
    sessionId: 'session-1',
    durationMs: 12345,
    penalty: 'none',
    solvedAt,
    scramble: 'R U',
    event: '3x3',
    version: 0,
    updatedAt: solvedAt,
    deletedAt: null,
  }
}

describe('automatic sessions', () => {
  it('names sessions from date and day part', () => {
    const date = new Date(2026, 7, 22, 19, 30, 0)
    expect(dayPartFromDate(date)).toBe('evening')
    expect(automaticSessionName(date)).toBe('22 aug 2026 evening')
  })

  it('appends a number when the name is already taken', () => {
    const date = new Date(2026, 7, 22, 19, 30, 0)
    expect(uniqueAutomaticSessionName(date, [])).toBe('22 aug 2026 evening')
    expect(uniqueAutomaticSessionName(date, ['22 aug 2026 evening'])).toBe('22 aug 2026 evening 2')
    expect(
      uniqueAutomaticSessionName(date, [
        '22 aug 2026 evening',
        '22 aug 2026 evening 2',
        '22 aug 2026 evening 3',
      ]),
    ).toBe('22 aug 2026 evening 4')
  })

  it('reuses a session within the inactivity gap', () => {
    const now = Date.parse('2026-08-22T18:20:00.000Z')
    expect(
      shouldReuseAutomaticSession({
        session: session(),
        lastSolve: solve('2026-08-22T18:10:00.000Z'),
        nowMs: now,
        gapMs: 60 * 60 * 1000,
        event: '3x3',
      }),
    ).toBe(true)
  })

  it('starts a new session after the gap, logout, or event change', () => {
    const now = Date.parse('2026-08-22T20:10:00.000Z')
    expect(
      shouldReuseAutomaticSession({
        session: session(),
        lastSolve: solve('2026-08-22T18:10:00.000Z'),
        nowMs: now,
        gapMs: 60 * 60 * 1000,
        event: '3x3',
      }),
    ).toBe(false)
    expect(
      shouldReuseAutomaticSession({
        session: session({ endedAt: '2026-08-22T19:00:00.000Z' }),
        lastSolve: solve('2026-08-22T18:50:00.000Z'),
        nowMs: Date.parse('2026-08-22T18:55:00.000Z'),
        gapMs: 60 * 60 * 1000,
        event: '3x3',
      }),
    ).toBe(false)
    expect(
      shouldReuseAutomaticSession({
        session: session(),
        lastSolve: solve('2026-08-22T18:10:00.000Z'),
        nowMs: Date.parse('2026-08-22T18:20:00.000Z'),
        gapMs: 60 * 60 * 1000,
        event: '2x2',
      }),
    ).toBe(false)
  })
})
