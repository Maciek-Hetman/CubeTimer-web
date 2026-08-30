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

export async function enqueueMutationsBatch(
  inputs: Array<{
    ownerId: string
    entity: 'session' | 'solve'
    entityId: string
    operation: 'upsert' | 'delete'
    baseVersion: number
    data?: SessionInput | SolveInput
  }>,
): Promise<MutationRecord[]> {
  if (inputs.length === 0) {
    return []
  }
  const ownerId = inputs[0].ownerId
  const existingRecords = await db.outbox.where('ownerId').equals(ownerId).toArray()
  const existingMap = new Map<string, MutationRecord>()
  for (const record of existingRecords) {
    existingMap.set(`${record.entity}:${record.entityId}`, record)
  }

  const recordsToPut: MutationRecord[] = []
  const now = nowIso()
  for (const input of inputs) {
    const key = `${input.entity}:${input.entityId}`
    const existing = existingMap.get(key)
    if (existing) {
      const updated: MutationRecord = {
        ...existing,
        operation: input.operation,
        data: input.data,
      }
      recordsToPut.push(updated)
      existingMap.set(key, updated)
    } else {
      const newRec: MutationRecord = {
        id: createId(),
        ownerId: input.ownerId,
        entity: input.entity,
        entityId: input.entityId,
        operation: input.operation,
        baseVersion: input.baseVersion,
        data: input.data,
        createdAt: now,
      }
      recordsToPut.push(newRec)
      existingMap.set(key, newRec)
    }
  }

  await db.outbox.bulkPut(recordsToPut)
  return recordsToPut
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
