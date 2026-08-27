import { createId, nowIso, type MutationRecord, type SessionInput, type SolveInput } from '../../domain/models'
import { db } from '../db'

export async function enqueueMutation(input: {
  ownerId: string
  entity: 'session' | 'solve'
  entityId: string
  operation: 'upsert' | 'delete'
  baseVersion: number
  data?: SessionInput | SolveInput
}): Promise<MutationRecord> {
  const existing = await db.outbox
    .where('ownerId')
    .equals(input.ownerId)
    .filter((record) => record.entity === input.entity && record.entityId === input.entityId)
    .first()

  const record: MutationRecord = existing
    ? {
        ...existing,
        operation: input.operation,
        // Keep the original base version: all local edits are one pending change.
        data: input.data,
      }
    : {
        id: createId(),
        ownerId: input.ownerId,
        entity: input.entity,
        entityId: input.entityId,
        operation: input.operation,
        baseVersion: input.baseVersion,
        data: input.data,
        createdAt: nowIso(),
      }
  await db.outbox.put(record)
  return record
}

export async function listOutbox(ownerId: string, limit = 500): Promise<MutationRecord[]> {
  const records = await db.outbox.where('ownerId').equals(ownerId).sortBy('createdAt')
  const sessions = records.filter((record) => record.entity === 'session')
  const solves = records.filter((record) => record.entity === 'solve')
  return [...sessions, ...solves].slice(0, limit)
}

export async function removeOutbox(ids: string[]): Promise<void> {
  await db.outbox.bulkDelete(ids)
}

export async function replaceOutbox(record: MutationRecord): Promise<void> {
  await db.outbox.put(record)
}
