import type { CubeEvent, CubeSession, SessionInput } from '../../domain/models'
import { createId, nowIso } from '../../domain/models'
import { db } from '../db'
import { enqueueMutation, enqueueMutationsBatch } from './outbox'

export async function listSessions(ownerId: string, event?: CubeEvent): Promise<CubeSession[]> {
  const sessions = event
    ? await db.sessions.where('[ownerId+event]').equals([ownerId, event]).toArray()
    : await db.sessions.where('ownerId').equals(ownerId).toArray()
  return sessions
    .filter((session) => !session.deletedAt && (!event || session.event === event))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
}

export async function putSession(
  session: CubeSession,
  options: { enqueue: boolean; baseVersion?: number },
): Promise<void> {
  const updated: CubeSession = { ...session, updatedAt: nowIso() }
  await db.transaction('rw', db.sessions, db.outbox, async () => {
    await db.sessions.put(updated)
    if (options.enqueue) {
      await enqueueMutation({
        ownerId: updated.ownerId,
        entity: 'session',
        entityId: updated.id,
        operation: updated.deletedAt ? 'delete' : 'upsert',
        baseVersion: options.baseVersion ?? updated.version,
        data: updated.deletedAt ? undefined : toSessionInput(updated),
      })
    }
  })
}

export function newSession(input: {
  ownerId: string
  name: string
  event: CubeEvent
  kind: CubeSession['kind']
  startedAt?: string
}): CubeSession {
  const startedAt = input.startedAt ?? nowIso()
  return {
    id: createId(),
    ownerId: input.ownerId,
    name: input.name,
    event: input.event,
    kind: input.kind,
    startedAt,
    endedAt: null,
    archived: false,
    version: 0,
    updatedAt: startedAt,
    deletedAt: null,
  }
}

export function toSessionInput(session: CubeSession): SessionInput {
  return {
    id: session.id,
    name: session.name,
    event: session.event,
    kind: session.kind,
    started_at: session.startedAt,
    ended_at: session.endedAt,
    archived: session.archived,
  }
}

export async function deleteSessionCascade(
  sessionId: string,
  options: { enqueue: boolean },
): Promise<number> {
  const session = await db.sessions.get(sessionId)
  if (!session) {
    return 0
  }
  const now = nowIso()
  const solves = await db.solves.where('[ownerId+sessionId]').equals([session.ownerId, sessionId]).toArray()
  const activeSolves = solves.filter((solve) => !solve.deletedAt)
  const deletedSolves = activeSolves.map((solve) => ({
    ...solve,
    deletedAt: now,
    updatedAt: now,
  }))

  await db.transaction('rw', db.sessions, db.solves, db.outbox, async () => {
    const tombstoned: CubeSession = { ...session, deletedAt: now, updatedAt: now }
    await db.sessions.put(tombstoned)

    if (deletedSolves.length > 0) {
      await db.solves.bulkPut(deletedSolves)
    }

    if (options.enqueue) {
      const mutationsToEnqueue: Array<{
        ownerId: string
        entity: 'session' | 'solve'
        entityId: string
        operation: 'delete'
        baseVersion: number
      }> = [
        {
          ownerId: session.ownerId,
          entity: 'session',
          entityId: session.id,
          operation: 'delete',
          baseVersion: session.version,
        },
        ...deletedSolves.map((s) => ({
          ownerId: s.ownerId,
          entity: 'solve' as const,
          entityId: s.id,
          operation: 'delete' as const,
          baseVersion: s.version,
        })),
      ]
      await enqueueMutationsBatch(mutationsToEnqueue)
    }
  })
  return activeSolves.length
}
