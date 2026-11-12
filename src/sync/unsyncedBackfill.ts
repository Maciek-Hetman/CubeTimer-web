import type { Table } from 'dexie'
import { db, setMeta } from '../data/db'
import { enqueueMutationsBatch } from '../data/repositories/outbox'
import { toSessionInput } from '../data/repositories/sessions'
import { toSolveInput } from '../data/repositories/solves'

export function unsyncedKey(ownerId: string): string {
  return `sync.unsynced:${ownerId}`
}

/** Flags that rows were written for this account without being queued (it was not verified yet). */
export async function markUnsyncedWrites(ownerId: string): Promise<void> {
  await setMeta(unsyncedKey(ownerId), true)
}

/**
 * Queues rows written while the account was unverified. Only runs for accounts flagged on this
 * device, so verified accounts are never scanned. Returns how many mutations were queued.
 */
export async function enqueueUnsyncedRows(ownerId: string): Promise<number> {
  return db.transaction(
    'rw',
    [db.sessions, db.solves, db.outbox, db.rejections, db.conflicts, db.meta] as Table[],
    async () => {
      const key = unsyncedKey(ownerId)
      if (!(await db.meta.get(key))?.value) {
        return 0
      }

      const [sessions, solves, outbox, rejections, conflicts] = await Promise.all([
        db.sessions.where('ownerId').equals(ownerId).toArray(),
        db.solves.where('ownerId').equals(ownerId).toArray(),
        db.outbox.where('ownerId').equals(ownerId).toArray(),
        db.rejections.where('ownerId').equals(ownerId).toArray(),
        db.conflicts.where('ownerId').equals(ownerId).toArray(),
      ])
      // Rows that already have a pending, rejected or conflicting change are handled elsewhere.
      const known = new Set<string>()
      for (const record of [...outbox, ...rejections, ...conflicts]) {
        known.add(`${record.entity}:${record.entityId}`)
      }
      const pending = <T extends { id: string; version: number; deletedAt?: string | null }>(
        rows: T[],
        entity: 'session' | 'solve',
      ) => rows.filter((row) => row.version === 0 && !row.deletedAt && !known.has(`${entity}:${row.id}`))

      const queued = await enqueueMutationsBatch([
        ...pending(sessions, 'session').map((session) => ({
          ownerId,
          entity: 'session' as const,
          entityId: session.id,
          operation: 'upsert' as const,
          baseVersion: 0,
          data: toSessionInput(session),
        })),
        ...pending(solves, 'solve').map((solve) => ({
          ownerId,
          entity: 'solve' as const,
          entityId: solve.id,
          operation: 'upsert' as const,
          baseVersion: 0,
          data: toSolveInput(solve),
        })),
      ])

      await db.meta.delete(key)
      return queued.length
    },
  )
}
