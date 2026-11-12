import { beforeEach, describe, expect, it } from 'vitest'
import { db, getMeta } from '../data/db'
import { listOutbox } from '../data/repositories/outbox'
import { newSession, putSession } from '../data/repositories/sessions'
import { newSolve, putSolve } from '../data/repositories/solves'
import { enqueueUnsyncedRows, markUnsyncedWrites, unsyncedKey } from './unsyncedBackfill'

const OWNER = 'user-1'

async function seedSession(ownerId = OWNER, version = 0) {
  const session = newSession({ ownerId, name: 'Main', event: '3x3', kind: 'manual' })
  await putSession({ ...session, version }, { enqueue: false, baseVersion: 0 })
  return { ...session, version }
}

async function seedSolve(sessionId: string, ownerId = OWNER, version = 0) {
  const solve = newSolve({
    ownerId,
    sessionId,
    durationMs: 1234,
    penalty: 'none',
    scramble: 'R U',
    event: '3x3',
  })
  await putSolve({ ...solve, version }, { enqueue: false, baseVersion: 0 })
  return { ...solve, version }
}

describe('enqueueUnsyncedRows', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('does nothing when the owner was never marked', async () => {
    const session = await seedSession()
    await seedSolve(session.id)

    expect(await enqueueUnsyncedRows(OWNER)).toBe(0)
    expect(await db.outbox.count()).toBe(0)
  })

  it('queues version-0 sessions before solves and clears the mark', async () => {
    const session = await seedSession()
    const solve = await seedSolve(session.id)
    await markUnsyncedWrites(OWNER)

    expect(await enqueueUnsyncedRows(OWNER)).toBe(2)

    const outbox = await db.outbox.where('ownerId').equals(OWNER).toArray()
    expect(outbox.map((record) => `${record.entity}:${record.entityId}`).sort()).toEqual(
      [`session:${session.id}`, `solve:${solve.id}`].sort(),
    )
    for (const record of outbox) {
      expect(record.operation).toBe('upsert')
      expect(record.baseVersion).toBe(0)
      expect(record.data).toBeTruthy()
    }
    expect((await listOutbox(OWNER)).map((record) => record.entity)).toEqual(['session', 'solve'])
    expect(await getMeta(unsyncedKey(OWNER), null)).toBeNull()
    expect(await enqueueUnsyncedRows(OWNER)).toBe(0)
  })

  it('skips tombstones, synced rows and entities already tracked', async () => {
    const live = await seedSession()
    const synced = await seedSession(OWNER, 3)
    const tombstoned = await seedSession()
    await db.sessions.update(tombstoned.id, { deletedAt: '2026-01-01T00:00:00.000Z' })

    const inOutbox = await seedSolve(live.id)
    const rejected = await seedSolve(live.id)
    const conflicted = await seedSolve(live.id)
    const syncedSolve = await seedSolve(live.id, OWNER, 2)
    const fresh = await seedSolve(live.id)
    const base = { ownerId: OWNER, operation: 'upsert' as const, createdAt: '2026-01-01T00:00:00.000Z' }
    await db.outbox.put({ ...base, id: 'o1', entity: 'solve', entityId: inOutbox.id, baseVersion: 0 })
    await db.rejections.put({ ...base, id: 'r1', entity: 'solve', entityId: rejected.id })
    await db.conflicts.put({
      id: 'c1',
      ownerId: OWNER,
      entity: 'solve',
      entityId: conflicted.id,
      message: 'conflict',
      current: conflicted,
      local: conflicted,
      createdAt: base.createdAt,
    })
    await markUnsyncedWrites(OWNER)

    expect(await enqueueUnsyncedRows(OWNER)).toBe(2)

    const entityIds = (await db.outbox.where('ownerId').equals(OWNER).toArray()).map((record) => record.entityId)
    expect(entityIds.sort()).toEqual([live.id, inOutbox.id, fresh.id].sort())
    expect(entityIds).not.toContain(synced.id)
    expect(entityIds).not.toContain(tombstoned.id)
    expect(entityIds).not.toContain(syncedSolve.id)
    expect(entityIds).not.toContain(rejected.id)
    expect(entityIds).not.toContain(conflicted.id)
  })

  it('leaves other owners untouched', async () => {
    const mine = await seedSession()
    const theirs = await seedSession('user-2')
    await seedSolve(theirs.id, 'user-2')
    await markUnsyncedWrites('user-2')
    await markUnsyncedWrites(OWNER)

    expect(await enqueueUnsyncedRows(OWNER)).toBe(1)

    expect((await db.outbox.toArray()).map((record) => record.entityId)).toEqual([mine.id])
    expect(await getMeta(unsyncedKey('user-2'), null)).toBe(true)
    expect(await getMeta(unsyncedKey(OWNER), null)).toBeNull()
  })
})
