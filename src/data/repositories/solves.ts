import type { CubeEvent, Solve, SolveInput } from '../../domain/models'
import { createId, effectiveTimeMs, nowIso } from '../../domain/models'
import { db } from '../db'
import { enqueueMutation } from './outbox'

export const RECENT_SOLVES_LIMIT = 25

interface SolvesQueryOptions {
  limit?: number
}

interface SolvesBySessionSummary {
  counts: Map<string, number>
  averages: Map<string, number | null>
  orphanCount: number
  orphanAvgTime: number | null
}

export async function listSolves(
  ownerId: string,
  event?: CubeEvent,
  options: SolvesQueryOptions = {},
): Promise<Solve[]> {
  if (event) {
    const rows = await db.solves
      .where('[ownerId+event]')
      .equals([ownerId, event])
      .filter((solve) => !solve.deletedAt)
      .toArray()
    rows.sort((a, b) => b.solvedAt.localeCompare(a.solvedAt))
    if (options.limit !== undefined) {
      return rows.slice(0, options.limit)
    }
    return rows
  }

  const collection = db.solves
    .where('ownerId')
    .equals(ownerId)
    .filter((solve) => !solve.deletedAt)
  const solves = await collection.toArray()
  solves.sort((a, b) => b.solvedAt.localeCompare(a.solvedAt))
  if (options.limit !== undefined) {
    return solves.slice(0, options.limit)
  }
  return solves
}

export async function countSolves(ownerId: string, event: CubeEvent): Promise<number> {
  return db.solves
    .where('[ownerId+event]')
    .equals([ownerId, event])
    .filter((solve) => !solve.deletedAt)
    .count()
}

export async function recentSolves(
  ownerId: string,
  event: CubeEvent,
  limit = RECENT_SOLVES_LIMIT,
): Promise<Solve[]> {
  const rows = await db.solves
    .where('[ownerId+event]')
    .equals([ownerId, event])
    .filter((solve) => !solve.deletedAt)
    .toArray()
  rows.sort((a, b) => b.solvedAt.localeCompare(a.solvedAt))
  return rows.slice(0, limit)
}

export async function latestSolveInSession(
  ownerId: string,
  sessionId: string,
): Promise<Solve | undefined> {
  const rows = await db.solves
    .where('[ownerId+sessionId]')
    .equals([ownerId, sessionId])
    .filter((solve) => !solve.deletedAt)
    .toArray()
  rows.sort((a, b) => b.solvedAt.localeCompare(a.solvedAt))
  return rows[0]
}

export async function listSolvesForSession(
  ownerId: string,
  sessionId: string,
  limit = 200,
): Promise<Solve[]> {
  const rows = await db.solves
    .where('[ownerId+sessionId]')
    .equals([ownerId, sessionId])
    .filter((solve) => !solve.deletedAt)
    .toArray()
  rows.sort((a, b) => b.solvedAt.localeCompare(a.solvedAt))
  return rows.slice(0, limit)
}

export async function listOrphanSolves(
  ownerId: string,
  event: CubeEvent,
  limit = 200,
): Promise<Solve[]> {
  const rows = await db.solves
    .where('[ownerId+event]')
    .equals([ownerId, event])
    .filter((solve) => !solve.deletedAt && !solve.sessionId)
    .toArray()
  rows.sort((a, b) => b.solvedAt.localeCompare(a.solvedAt))
  return rows.slice(0, limit)
}

export async function countSolvesBySession(
  ownerId: string,
  event: CubeEvent,
): Promise<SolvesBySessionSummary> {
  const sessionAcc = new Map<string, { count: number; validCount: number; totalMs: number }>()
  let orphanCount = 0
  let orphanValidCount = 0
  let orphanTotalMs = 0

  await db.solves
    .where('[ownerId+event]')
    .equals([ownerId, event])
    .each((solve) => {
      if (solve.deletedAt) {
        return
      }
      const effective = effectiveTimeMs(solve)
      if (solve.sessionId) {
        let acc = sessionAcc.get(solve.sessionId)
        if (!acc) {
          acc = { count: 0, validCount: 0, totalMs: 0 }
          sessionAcc.set(solve.sessionId, acc)
        }
        acc.count += 1
        if (effective !== null) {
          acc.validCount += 1
          acc.totalMs += effective
        }
      } else {
        orphanCount += 1
        if (effective !== null) {
          orphanValidCount += 1
          orphanTotalMs += effective
        }
      }
    })

  const counts = new Map<string, number>()
  const averages = new Map<string, number | null>()
  for (const [sessionId, acc] of sessionAcc.entries()) {
    counts.set(sessionId, acc.count)
    averages.set(sessionId, acc.validCount > 0 ? acc.totalMs / acc.validCount : null)
  }

  const orphanAvgTime = orphanValidCount > 0 ? orphanTotalMs / orphanValidCount : null

  return { counts, averages, orphanCount, orphanAvgTime }
}

export async function putSolve(
  solve: Solve,
  options: { enqueue: boolean; baseVersion?: number },
): Promise<void> {
  const updated: Solve = { ...solve, updatedAt: nowIso() }
  await db.transaction('rw', db.solves, db.outbox, async () => {
    await db.solves.put(updated)
    if (options.enqueue) {
      await enqueueMutation({
        ownerId: updated.ownerId,
        entity: 'solve',
        entityId: updated.id,
        operation: updated.deletedAt ? 'delete' : 'upsert',
        baseVersion: options.baseVersion ?? updated.version,
        data: updated.deletedAt ? undefined : toSolveInput(updated),
      })
    }
  })
}

export function newSolve(input: {
  ownerId: string
  sessionId: string | null
  durationMs: number
  penalty: Solve['penalty']
  scramble: string
  event: CubeEvent
  solvedAt?: string
}): Solve {
  const solvedAt = input.solvedAt ?? nowIso()
  return {
    id: createId(),
    ownerId: input.ownerId,
    sessionId: input.sessionId,
    durationMs: input.durationMs,
    penalty: input.penalty,
    solvedAt,
    scramble: input.scramble,
    event: input.event,
    version: 0,
    updatedAt: solvedAt,
    deletedAt: null,
  }
}

export function toSolveInput(solve: Solve): SolveInput {
  return {
    id: solve.id,
    session_id: solve.sessionId,
    duration_ms: solve.durationMs,
    penalty: solve.penalty,
    solved_at: solve.solvedAt,
    scramble: solve.scramble,
    event: solve.event,
  }
}