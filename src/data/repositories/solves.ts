import type { CubeEvent, Solve, SolveInput } from '../../domain/models'
import { createId, nowIso } from '../../domain/models'
import { db } from '../db'
import { enqueueMutation } from './outbox'

export async function listSolves(ownerId: string, event?: CubeEvent): Promise<Solve[]> {
  const solves = await db.solves.where('ownerId').equals(ownerId).toArray()
  return solves
    .filter((solve) => !solve.deletedAt && (!event || solve.event === event))
    .sort((a, b) => (a.solvedAt < b.solvedAt ? 1 : -1))
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
