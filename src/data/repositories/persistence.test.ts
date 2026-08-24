import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db'
import { deleteSessionCascade, newSession, putSession } from './sessions'
import { newSolve, putSolve } from './solves'
import { listOutbox } from './outbox'
import { adoptGuestData } from '../../sync/guestMerge'
import { applySyncResponse } from '../../sync/syncEngine'
import type { MutationRecord } from '../../domain/models'

describe('local persistence', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('tombstones a session and its solves together', async () => {
    const session = newSession({ ownerId: 'user-1', name: 'Main', event: '3x3', kind: 'manual' })
    await putSession(session, { enqueue: true, baseVersion: 0 })
    const solve = newSolve({
      ownerId: 'user-1',
      sessionId: session.id,
      durationMs: 1234,
      penalty: 'none',
      scramble: 'R U',
      event: '3x3',
    })
    await putSolve(solve, { enqueue: true, baseVersion: 0 })
    const count = await deleteSessionCascade(session.id, { enqueue: true })
    expect(count).toBe(1)
    expect((await db.sessions.get(session.id))?.deletedAt).toBeTruthy()
    expect((await db.solves.get(solve.id))?.deletedAt).toBeTruthy()
    const outbox = await listOutbox('user-1')
    expect(outbox.some((item) => item.entity === 'session' && item.operation === 'delete')).toBe(true)
    expect(outbox.some((item) => item.entity === 'solve' && item.operation === 'delete')).toBe(true)
  })

  it('adopts guest data onto an account and enqueues sessions first', async () => {
    const session = newSession({ ownerId: 'guest:abc', name: 'Guest', event: '3x3', kind: 'automatic' })
    await putSession(session, { enqueue: false, baseVersion: 0 })
    const solve = newSolve({
      ownerId: 'guest:abc',
      sessionId: session.id,
      durationMs: 5555,
      penalty: 'none',
      scramble: 'R U R\'',
      event: '3x3',
    })
    await putSolve(solve, { enqueue: false, baseVersion: 0 })
    await adoptGuestData('guest:abc', 'account-1')
    expect((await db.sessions.get(session.id))?.ownerId).toBe('account-1')
    expect((await db.solves.get(solve.id))?.ownerId).toBe('account-1')
    const outbox = await listOutbox('account-1')
    expect(outbox[0]?.entity).toBe('session')
    expect(outbox[1]?.entity).toBe('solve')
    expect(outbox[0]?.baseVersion).toBe(0)
  })
})

describe('sync outcomes', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('accepts mutations, applies paged changes, and records conflicts', async () => {
    const session = newSession({ ownerId: 'account-1', name: 'Local', event: '3x3', kind: 'manual' })
    await putSession(session, { enqueue: false, baseVersion: 0 })
    const mutation: MutationRecord = {
      id: '11111111-1111-1111-1111-111111111111',
      ownerId: 'account-1',
      entity: 'session',
      entityId: session.id,
      operation: 'upsert',
      baseVersion: 0,
      createdAt: new Date().toISOString(),
    }
    await db.outbox.put(mutation)

    await applySyncResponse(
      'account-1',
      [mutation],
      [{ mutation_id: mutation.id, status: 'accepted', version: 1 }],
      [
        {
          cursor: 1,
          entity: 'solve',
          entity_id: '22222222-2222-2222-2222-222222222222',
          operation: 'upsert',
          version: 1,
          changed_at: new Date().toISOString(),
          data: {
            id: '22222222-2222-2222-2222-222222222222',
            session_id: session.id,
            duration_ms: 9999,
            penalty: 'none',
            solved_at: '2026-08-22T18:00:00.000Z',
            scramble: 'U R',
            event: '3x3',
            version: 1,
            updated_at: '2026-08-22T18:00:00.000Z',
          },
        },
      ],
      1,
    )
    expect((await db.sessions.get(session.id))?.version).toBe(1)
    expect(await db.solves.get('22222222-2222-2222-2222-222222222222')).toBeTruthy()
    expect(await db.outbox.count()).toBe(0)

    const conflictMutation: MutationRecord = {
      id: '33333333-3333-3333-3333-333333333333',
      ownerId: 'account-1',
      entity: 'session',
      entityId: session.id,
      operation: 'upsert',
      baseVersion: 1,
      createdAt: new Date().toISOString(),
    }
    await db.outbox.put(conflictMutation)
    const conflicts = await applySyncResponse(
      'account-1',
      [conflictMutation],
      [
        {
          mutation_id: conflictMutation.id,
          status: 'conflict',
          current: {
            id: session.id,
            name: 'Server name',
            event: '3x3',
            kind: 'manual',
            started_at: session.startedAt,
            ended_at: null,
            archived: false,
            version: 4,
            updated_at: new Date().toISOString(),
          },
        },
      ],
      [],
      1,
    )
    expect(conflicts).toBe(1)
    expect((await db.sessions.get(session.id))?.name).toBe('Server name')
    expect((await db.conflicts.toArray())[0]?.local).toBeTruthy()
  })
})
