import { beforeEach, describe, expect, it } from 'vitest'
import type { Solve } from '../../domain/models'
import { db } from '../db'
import {
  latestSolveInSession,
  listOrphanSolves,
  listSolvesForSession,
  newSolve,
  recentSolves,
} from './solves'

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

async function fullSortReference(
  index: '[ownerId+event]' | '[ownerId+sessionId]',
  key: [string, string],
  keep: (solve: Solve) => boolean,
): Promise<Solve[]> {
  const rows = await db.solves.where(index).equals(key).filter(keep).toArray()
  return rows.sort((a, b) => b.solvedAt.localeCompare(a.solvedAt))
}

describe('newest-first solve queries', () => {
  beforeEach(async () => {
    await db.transaction('rw', db.solves, db.outbox, async () => {
      await db.solves.clear()
      await db.outbox.clear()
    })
  })

  it('match a full stable sort, including ties at the limit and tombstones', async () => {
    const rand = mulberry32(31337)
    const base = Date.UTC(2026, 0, 1)
    let at = base
    const rows: Solve[] = []
    for (let i = 0; i < 300; i += 1) {
      // Heavy same-millisecond clustering so the limit often falls inside a tie group
      if (rand() < 0.3) {
        at += 1000
      }
      const pick = rand()
      const solve = newSolve({
        ownerId: pick < 0.05 ? 'other' : 'owner',
        sessionId: pick < 0.3 ? null : pick < 0.65 ? 'session-a' : 'session-b',
        durationMs: 10000,
        penalty: 'none',
        scramble: '',
        event: pick > 0.95 ? '2x2' : '3x3',
        solvedAt: new Date(at).toISOString(),
      })
      rows.push(rand() < 0.1 ? { ...solve, deletedAt: '2026-02-01T00:00:00.000Z' } : solve)
    }
    await db.solves.bulkPut(rows)

    const notDeleted = (solve: Solve) => !solve.deletedAt
    const byEvent = await fullSortReference('[ownerId+event]', ['owner', '3x3'], notDeleted)
    const orphans = await fullSortReference(
      '[ownerId+event]',
      ['owner', '3x3'],
      (solve) => !solve.deletedAt && !solve.sessionId,
    )
    const bySession = await fullSortReference('[ownerId+sessionId]', ['owner', 'session-a'], notDeleted)

    for (const limit of [0, 1, 2, 3, 7, 25, 60, 1000]) {
      expect(await recentSolves('owner', '3x3', limit)).toEqual(byEvent.slice(0, limit))
      expect(await listOrphanSolves('owner', '3x3', limit)).toEqual(orphans.slice(0, limit))
      expect(await listSolvesForSession('owner', 'session-a', limit)).toEqual(bySession.slice(0, limit))
    }
    expect(await latestSolveInSession('owner', 'session-a')).toEqual(bySession[0])
    expect(await latestSolveInSession('owner', 'missing')).toBeUndefined()
  })
})
