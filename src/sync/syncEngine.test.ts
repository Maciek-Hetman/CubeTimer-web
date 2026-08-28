import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../data/db'
import { newSession, putSession, toSessionInput } from '../data/repositories/sessions'
import { listOutbox } from '../data/repositories/outbox'
import { runSync, lastSyncKey, getLastSyncedAt } from './syncEngine'
import { createId } from '../domain/models'
import type { MutationRecord } from '../domain/models'
import type { MutationOutcome, SyncResponse } from '../api/types'

vi.mock('../api/sync', () => ({
  sync: vi.fn(),
}))

import { sync as syncRequest } from '../api/sync'

const mockedSync = vi.mocked(syncRequest)

describe('runSync', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    mockedSync.mockReset()
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
  })

  const options = {
    ownerId: 'account-1',
    accessToken: 'token',
    device: { id: 'dev-1', name: 'Test device', platform: 'web' },
  }

  it('completes successfully when a mutation is rejected', async () => {
    const session = newSession({ ownerId: 'account-1', name: 'Local', event: '3x3', kind: 'manual' })
    await putSession(session, { enqueue: true, baseVersion: 0 })
    const mutation = (await listOutbox('account-1'))[0]
    expect(mutation).toBeTruthy()

    mockedSync.mockResolvedValue({
      outcomes: [{ mutation_id: mutation!.id, status: 'rejected', code: 'invalid_session', message: 'Invalid session' }],
      changes: [],
      next_cursor: 1,
      has_more: false,
    } satisfies SyncResponse)

    const result = await runSync(options)

    expect(result).toEqual({ status: 'idle', conflicts: 0, rejected: 1 })
    expect(await db.outbox.get(mutation!.id)).toBeUndefined()
    expect(await db.rejections.get(mutation!.id)).toBeTruthy()
    expect(await getLastSyncedAt('account-1')).toBeTruthy()
  })

  it('keeps syncing accepted mutations alongside a rejected one', async () => {
    const session = newSession({ ownerId: 'account-1', name: 'Local', event: '3x3', kind: 'manual' })
    const solveSession = newSession({ ownerId: 'account-1', name: 'Other', event: '3x3', kind: 'manual' })
    await putSession(session, { enqueue: true, baseVersion: 0 })
    await putSession(solveSession, { enqueue: true, baseVersion: 0 })

    const mutations = await listOutbox('account-1')
    const rejectedMutation: MutationRecord = {
      id: createId(),
      ownerId: 'account-1',
      entity: 'session',
      entityId: 'missing',
      operation: 'upsert',
      baseVersion: 0,
      data: toSessionInput({ ...session, id: 'missing' }),
      createdAt: new Date().toISOString(),
    }
    await db.outbox.put(rejectedMutation)
    const sentIds = [...mutations.map((m) => m.id), rejectedMutation.id]

    mockedSync.mockResolvedValue({
      outcomes: [
        { mutation_id: rejectedMutation.id, status: 'rejected', message: 'Invalid session' },
        ...sentIds
          .filter((id) => id !== rejectedMutation.id)
          .map(
            (id): MutationOutcome => ({ mutation_id: id, status: 'accepted', version: 1 }),
          ),
      ],
      changes: [],
      next_cursor: 1,
      has_more: false,
    } satisfies SyncResponse)

    const result = await runSync(options)

    expect(result).toEqual({ status: 'idle', conflicts: 0, rejected: 1 })
    expect(await listOutbox('account-1')).toHaveLength(0)
    expect(await db.rejections.get(rejectedMutation.id)).toBeTruthy()
    expect((await db.sessions.get(session.id))?.version).toBe(1)
    expect((await db.sessions.get(solveSession.id))?.version).toBe(1)
    expect((await db.meta.get(lastSyncKey('account-1')))?.value).toBeTruthy()
  })
})