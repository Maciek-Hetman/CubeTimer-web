import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../data/db'
import { newSession, putSession } from '../data/repositories/sessions'
import { newSolve, putSolve } from '../data/repositories/solves'
import { listOutbox } from '../data/repositories/outbox'
import {
  applySnapshotData,
  applySyncResponse,
  getCursor,
  getLastSyncedAt,
  runSnapshotBootstrap,
  runSync,
  setCursor,
  withBackoff,
} from './syncEngine'
import { createId, nowIso } from '../domain/models'
import { ApiError } from '../api/types'
import type { Change, SnapshotResponse, SyncResponse } from '../api/types'

vi.mock('../api/sync', () => ({
  sync: vi.fn(),
  snapshot: vi.fn(),
}))

import { snapshot as snapshotRequest, sync as syncRequest } from '../api/sync'

const mockedSync = vi.mocked(syncRequest)
const mockedSnapshot = vi.mocked(snapshotRequest)

describe('syncEngine', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    mockedSync.mockReset()
    mockedSnapshot.mockReset()
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
  })

  const options = {
    ownerId: 'account-1',
    accessToken: 'token-xyz',
    device: { id: 'dev-1', name: 'Test device', platform: 'web' },
  }

  describe('runSync incremental', () => {
    it('returns offline status when navigator.onLine is false', async () => {
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
      const result = await runSync(options)
      expect(result).toEqual({ status: 'offline', conflicts: 0, rejected: 0 })
      expect(mockedSync).not.toHaveBeenCalled()
    })

    it('pushes local mutations and applies remote changes successfully', async () => {
      const session = newSession({ ownerId: 'account-1', name: 'Local Session', event: '3x3', kind: 'manual' })
      await putSession(session, { enqueue: true, baseVersion: 0 })
      const mutations = await listOutbox('account-1')
      expect(mutations).toHaveLength(1)

      const remoteSessionId = createId()
      mockedSync.mockResolvedValueOnce({
        outcomes: [{ mutation_id: mutations[0].id, status: 'accepted', version: 1 }],
        changes: [
          {
            cursor: 10,
            entity: 'session',
            entity_id: remoteSessionId,
            operation: 'upsert',
            version: 1,
            data: {
              id: remoteSessionId,
              name: 'Remote Session',
              event: '3x3',
              kind: 'manual',
              started_at: nowIso(),
              ended_at: null,
              archived: false,
              version: 1,
              updated_at: nowIso(),
              deleted_at: null,
            },
            changed_at: nowIso(),
          },
        ],
        next_cursor: 10,
        has_more: false,
      } satisfies SyncResponse)

      const result = await runSync(options)
      expect(result).toEqual({ status: 'idle', conflicts: 0, rejected: 0 })
      expect(await listOutbox('account-1')).toHaveLength(0)
      expect(await getCursor('account-1')).toBe(10)
      expect(await db.sessions.get(remoteSessionId)).toBeTruthy()
      expect((await db.sessions.get(session.id))?.version).toBe(1)
    })

    it('completes successfully when a mutation is rejected', async () => {
      const session = newSession({ ownerId: 'account-1', name: 'Local', event: '3x3', kind: 'manual' })
      await putSession(session, { enqueue: true, baseVersion: 0 })
      const mutation = (await listOutbox('account-1'))[0]
      expect(mutation).toBeTruthy()

      mockedSync.mockResolvedValueOnce({
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

    it('handles conflict outcomes by recording conflict and updating entity with current version', async () => {
      const session = newSession({ ownerId: 'account-1', name: 'My Session', event: '3x3', kind: 'manual' })
      await putSession(session, { enqueue: true, baseVersion: 1 })
      const mutation = (await listOutbox('account-1'))[0]
      expect(mutation).toBeTruthy()

      mockedSync.mockResolvedValueOnce({
        outcomes: [
          {
            mutation_id: mutation.id,
            status: 'conflict',
            message: 'Version conflict',
            current: {
              id: session.id,
              name: 'Remote Overwrite',
              event: '3x3',
              kind: 'manual',
              started_at: session.startedAt,
              ended_at: null,
              archived: false,
              version: 2,
              updated_at: nowIso(),
              deleted_at: null,
            },
          },
        ],
        changes: [],
        next_cursor: 5,
        has_more: false,
      } satisfies SyncResponse)

      const result = await runSync(options)
      expect(result.conflicts).toBe(1)
      expect(await db.conflicts.get(mutation.id)).toBeTruthy()
      const updated = await db.sessions.get(session.id)
      expect(updated?.name).toBe('Remote Overwrite')
      expect(updated?.version).toBe(2)
    })

    it('handles Protocol v2 ConflictStub outcome correctly', async () => {
      const session = newSession({ ownerId: 'account-1', name: 'Existing Session', event: '3x3', kind: 'manual' })
      session.version = 1
      await putSession(session, { enqueue: true, baseVersion: 1 })
      const mutation = (await listOutbox('account-1'))[0]

      mockedSync.mockResolvedValueOnce({
        outcomes: [
          {
            mutation_id: mutation.id,
            status: 'conflict',
            message: 'Remote version differs',
            version: 3,
            current: {
              id: session.id,
              version: 3,
              updated_at: nowIso(),
            },
          },
        ],
        changes: [],
        next_cursor: 6,
        has_more: false,
      } satisfies SyncResponse)

      const result = await runSync(options)
      expect(result.conflicts).toBe(1)
      const stored = await db.sessions.get(session.id)
      expect(stored?.version).toBe(3)
      expect(stored?.name).toBe('Existing Session')
    })

    it('records a conflict without current using the outcome version and the local entity', async () => {
      const session = newSession({ ownerId: 'account-1', name: 'Local Edit', event: '3x3', kind: 'manual' })
      session.version = 1
      await putSession(session, { enqueue: true, baseVersion: 1 })
      const mutation = (await listOutbox('account-1'))[0]

      mockedSync.mockResolvedValue({
        outcomes: [{ mutation_id: mutation.id, status: 'conflict', version: 4 }],
        changes: [],
        next_cursor: 3,
        has_more: false,
      } satisfies SyncResponse)

      const result = await runSync(options)

      expect(mockedSync).toHaveBeenCalledTimes(1)
      expect(result).toEqual({ status: 'conflict', conflicts: 1, rejected: 0 })
      expect(await listOutbox('account-1')).toHaveLength(0)
      const conflict = await db.conflicts.get(mutation.id)
      expect(conflict?.current.version).toBe(4)
      expect(conflict?.current.id).toBe(session.id)
      expect((conflict?.local as { name: string } | undefined)?.name).toBe('Local Edit')
      expect(await db.rejections.count()).toBe(0)

      mockedSync.mockResolvedValue({ outcomes: [], changes: [], next_cursor: 3, has_more: false } satisfies SyncResponse)
      const next = await runSync(options)
      expect(next.status).toBe('idle')
      expect(mockedSync).toHaveBeenCalledTimes(2)
      expect(mockedSync.mock.calls[1][1].mutations).toHaveLength(0)
    })

    it('records a conflict without current, version or local entity as a rejection', async () => {
      const session = newSession({ ownerId: 'account-1', name: 'Gone', event: '3x3', kind: 'manual' })
      await putSession(session, { enqueue: true, baseVersion: 2 })
      await db.sessions.delete(session.id)
      const mutation = (await listOutbox('account-1'))[0]

      mockedSync.mockResolvedValue({
        outcomes: [{ mutation_id: mutation.id, status: 'conflict', message: 'Conflict' }],
        changes: [],
        next_cursor: 4,
        has_more: false,
      } satisfies SyncResponse)

      const result = await runSync(options)

      expect(mockedSync).toHaveBeenCalledTimes(1)
      expect(result).toEqual({ status: 'idle', conflicts: 0, rejected: 1 })
      expect(await listOutbox('account-1')).toHaveLength(0)
      expect(await db.conflicts.count()).toBe(0)
      const rejection = await db.rejections.get(mutation.id)
      expect(rejection?.code).toBe('unresolved_conflict')
      expect(rejection?.message).toBe('Conflict')
    })

    it('treats unknown outcome statuses as rejections instead of resending', async () => {
      const session = newSession({ ownerId: 'account-1', name: 'Local', event: '3x3', kind: 'manual' })
      await putSession(session, { enqueue: true, baseVersion: 0 })
      const mutation = (await listOutbox('account-1'))[0]

      mockedSync.mockResolvedValue({
        outcomes: [{ mutation_id: mutation.id, status: 'deferred' as 'rejected' }],
        changes: [],
        next_cursor: 1,
        has_more: false,
      } satisfies SyncResponse)

      const result = await runSync(options)

      expect(mockedSync).toHaveBeenCalledTimes(1)
      expect(result).toEqual({ status: 'idle', conflicts: 0, rejected: 1 })
      expect(await listOutbox('account-1')).toHaveLength(0)
      expect((await db.rejections.get(mutation.id))?.code).toBe('unresolved_deferred')
    })

    it('stops resending within a run when the server returns no outcome for a mutation', async () => {
      const session = newSession({ ownerId: 'account-1', name: 'Local', event: '3x3', kind: 'manual' })
      await putSession(session, { enqueue: true, baseVersion: 0 })

      mockedSync.mockResolvedValue({ outcomes: [], changes: [], next_cursor: 1, has_more: false } satisfies SyncResponse)

      const result = await runSync(options)

      expect(mockedSync).toHaveBeenCalledTimes(1)
      expect(result.status).toBe('pending')
      expect(await listOutbox('account-1')).toHaveLength(1)
    })

    it('handles Protocol v2 DeleteStub in remote changes', async () => {
      const session = newSession({ ownerId: 'account-1', name: 'To Be Deleted', event: '3x3', kind: 'manual' })
      session.version = 1
      await putSession(session, { enqueue: false })

      const deleteTime = nowIso()
      mockedSync.mockResolvedValueOnce({
        outcomes: [],
        changes: [
          {
            cursor: 7,
            entity: 'session',
            entity_id: session.id,
            operation: 'delete',
            version: 2,
            data: {
              id: session.id,
              version: 2,
              deleted_at: deleteTime,
            },
            changed_at: deleteTime,
          },
        ],
        next_cursor: 7,
        has_more: false,
      } satisfies SyncResponse)

      await runSync(options)
      const stored = await db.sessions.get(session.id)
      expect(stored?.version).toBe(2)
      expect(stored?.deletedAt).toBe(deleteTime)
    })

    it('handles Protocol v2 DeleteStub for Solve in remote changes', async () => {
      const solve = newSolve({
        ownerId: 'account-1',
        sessionId: 'sess-1',
        durationMs: 10500,
        penalty: 'none',
        scramble: 'R U',
        event: '3x3',
      })
      solve.version = 1
      await putSolve(solve, { enqueue: false })

      const deleteTime = nowIso()
      mockedSync.mockResolvedValueOnce({
        outcomes: [],
        changes: [
          {
            cursor: 8,
            entity: 'solve',
            entity_id: solve.id,
            operation: 'delete',
            version: 2,
            data: {
              id: solve.id,
              version: 2,
              deleted_at: deleteTime,
            },
            changed_at: deleteTime,
          },
        ],
        next_cursor: 8,
        has_more: false,
      } satisfies SyncResponse)

      await runSync(options)
      const stored = await db.solves.get(solve.id)
      expect(stored?.version).toBe(2)
      expect(stored?.deletedAt).toBe(deleteTime)
    })

    it('handles cursor_expired HTTP 409 error by resetting cursor and running snapshot bootstrap', async () => {
      await setCursor('account-1', 9999)

      // First sync call fails with 409 cursor_expired
      mockedSync.mockRejectedValueOnce(
        new ApiError(409, 'cursor_expired', 'The sync cursor has expired.'),
      )

      const bootstrapSessionId = createId()
      const bootstrapSolveId = createId()

      // Snapshot call succeeds and returns bootstrap data
      mockedSnapshot.mockResolvedValueOnce({
        sessions: [
          {
            id: bootstrapSessionId,
            name: 'Bootstrapped Session',
            event: '3x3',
            kind: 'manual',
            started_at: nowIso(),
            ended_at: null,
            archived: false,
            version: 1,
            updated_at: nowIso(),
          },
        ],
        solves: [
          {
            id: bootstrapSolveId,
            session_id: bootstrapSessionId,
            duration_ms: 11200,
            penalty: 'none',
            solved_at: nowIso(),
            scramble: "R U R'",
            event: '3x3',
            timing_device: 'keyboard',
            version: 1,
            updated_at: nowIso(),
          },
        ],
        cursor: 50,
        has_more: false,
      } satisfies SnapshotResponse)

      // Subsequent sync after recovery succeeds
      mockedSync.mockResolvedValueOnce({
        outcomes: [],
        changes: [],
        next_cursor: 50,
        has_more: false,
      } satisfies SyncResponse)

      const result = await runSync(options)
      expect(result.status).toBe('idle')
      expect(mockedSnapshot).toHaveBeenCalled()
      expect(await db.sessions.get(bootstrapSessionId)).toBeTruthy()
      expect(await db.solves.get(bootstrapSolveId)).toBeTruthy()
      expect(await getCursor('account-1')).toBe(50)
    })

    it('throws instead of bootstrapping again when cursor_expired repeats after a bootstrap', async () => {
      await setCursor('account-1', 9999)
      mockedSync.mockRejectedValue(new ApiError(409, 'cursor_expired', 'The sync cursor has expired.'))
      mockedSnapshot.mockResolvedValue({ cursor: 50, has_more: false } satisfies SnapshotResponse)

      await expect(runSync(options)).rejects.toThrow('The sync cursor has expired.')

      expect(mockedSnapshot).toHaveBeenCalledTimes(1)
      expect(mockedSync).toHaveBeenCalledTimes(2)
    })

    it('propagates a failed snapshot bootstrap from runSync', async () => {
      await setCursor('account-1', 9999)
      mockedSync.mockRejectedValue(new ApiError(409, 'cursor_expired', 'The sync cursor has expired.'))
      mockedSnapshot.mockResolvedValue({ cursor: 50, has_more: true } satisfies SnapshotResponse)

      await expect(runSync(options)).rejects.toThrow('no progress')

      expect(mockedSync).toHaveBeenCalledTimes(1)
      expect(await getCursor('account-1')).toBe(0)
      expect(await getLastSyncedAt('account-1')).toBeNull()
    })

    it('retries request on 401 Unauthorized using getAccessToken', async () => {
      const refreshedToken = 'new-access-token-456'
      const getAccessToken = vi.fn().mockResolvedValue(refreshedToken)

      mockedSync.mockRejectedValueOnce(new ApiError(401, 'invalid_token', 'Expired token'))
      mockedSync.mockResolvedValueOnce({
        outcomes: [],
        changes: [],
        next_cursor: 12,
        has_more: false,
      } satisfies SyncResponse)

      const result = await runSync({
        ...options,
        getAccessToken,
      })

      expect(result.status).toBe('idle')
      expect(getAccessToken).toHaveBeenCalledTimes(1)
      expect(mockedSync).toHaveBeenLastCalledWith(
        refreshedToken,
        expect.anything(),
        expect.anything(),
      )
    })
  })

  describe('runSnapshotBootstrap', () => {
    it('paginates over multiple snapshot pages and stores watermark', async () => {
      const sessId1 = createId()
      const solveId1 = createId()

      mockedSnapshot.mockResolvedValueOnce({
        sessions: [
          {
            id: sessId1,
            name: 'Page 1 Session',
            event: '3x3',
            kind: 'manual',
            started_at: nowIso(),
            ended_at: null,
            archived: false,
            version: 1,
            updated_at: nowIso(),
          },
        ],
        cursor: 100,
        has_more: true,
        next_entity: 'solve',
        next_after_id: '00000000-0000-0000-0000-000000000000',
      } satisfies SnapshotResponse)

      mockedSnapshot.mockResolvedValueOnce({
        solves: [
          {
            id: solveId1,
            session_id: sessId1,
            duration_ms: 9900,
            penalty: 'none',
            solved_at: nowIso(),
            scramble: "U R U'",
            event: '3x3',
            timing_device: 'keyboard',
            version: 1,
            updated_at: nowIso(),
          },
        ],
        cursor: 100,
        has_more: false,
      } satisfies SnapshotResponse)

      const finalCursor = await runSnapshotBootstrap(options)

      expect(finalCursor).toBe(100)
      expect(mockedSnapshot).toHaveBeenCalledTimes(2)
      expect(await db.sessions.get(sessId1)).toBeTruthy()
      expect(await db.solves.get(solveId1)).toBeTruthy()
      expect(await getCursor('account-1')).toBe(100)
    })

    it('keeps paging past 100 pages until has_more is false', async () => {
      const ids = Array.from({ length: 120 }, () => createId())
      ids.forEach((id, index) => {
        const last = index === ids.length - 1
        mockedSnapshot.mockResolvedValueOnce({
          solves: [
            {
              id,
              duration_ms: 10000 + index,
              penalty: 'none',
              solved_at: nowIso(),
              scramble: '',
              event: '3x3',
              timing_device: 'keyboard',
              version: 1,
              updated_at: nowIso(),
            },
          ],
          cursor: 700,
          has_more: !last,
          next_entity: last ? undefined : 'solve',
          next_after_id: last ? undefined : id,
        } satisfies SnapshotResponse)
      })

      const finalCursor = await runSnapshotBootstrap(options)

      expect(finalCursor).toBe(700)
      expect(mockedSnapshot).toHaveBeenCalledTimes(120)
      expect(await db.solves.count()).toBe(120)
      expect(mockedSnapshot.mock.calls[119][1]).toMatchObject({ cursor: 700, entity: 'solve', after_id: ids[118] })
      expect(await getCursor('account-1')).toBe(700)
      expect(await getLastSyncedAt('account-1')).toBeTruthy()
    })

    it('throws without persisting the cursor when the server repeats the same position', async () => {
      const afterId = createId()
      mockedSnapshot.mockResolvedValue({
        solves: [],
        cursor: 300,
        has_more: true,
        next_entity: 'solve',
        next_after_id: afterId,
      } satisfies SnapshotResponse)

      await expect(runSnapshotBootstrap(options)).rejects.toThrow('no progress')

      expect(mockedSnapshot).toHaveBeenCalledTimes(2)
      expect(await getCursor('account-1')).toBe(0)
      expect(await getLastSyncedAt('account-1')).toBeNull()
    })

    it('throws when an empty page reports has_more without advancing', async () => {
      mockedSnapshot.mockResolvedValue({ cursor: 300, has_more: true } satisfies SnapshotResponse)

      await expect(runSnapshotBootstrap(options)).rejects.toThrow('no progress')

      expect(await getCursor('account-1')).toBe(0)
      expect(await getLastSyncedAt('account-1')).toBeNull()
    })

    it('echoes the response cursor but stores the lowest watermark seen', async () => {
      mockedSnapshot.mockResolvedValueOnce({
        cursor: 40,
        has_more: true,
        next_entity: 'solve',
        next_after_id: '00000000-0000-0000-0000-000000000000',
      } satisfies SnapshotResponse)
      mockedSnapshot.mockResolvedValueOnce({ cursor: 55, has_more: false } satisfies SnapshotResponse)

      const finalCursor = await runSnapshotBootstrap(options)

      expect(mockedSnapshot.mock.calls[0][1].cursor).toBe(0)
      expect(mockedSnapshot.mock.calls[1][1].cursor).toBe(40)
      expect(finalCursor).toBe(40)
      expect(await getCursor('account-1')).toBe(40)
    })

    it('refreshes the token once per request on 401', async () => {
      const getAccessToken = vi.fn().mockResolvedValue('fresh-token')
      mockedSnapshot.mockRejectedValueOnce(new ApiError(401, 'invalid_token', 'Expired token'))
      mockedSnapshot.mockRejectedValueOnce(new ApiError(401, 'invalid_token', 'Expired token'))

      await expect(runSnapshotBootstrap({ ...options, getAccessToken })).rejects.toThrow('Expired token')

      expect(getAccessToken).toHaveBeenCalledTimes(1)
      expect(mockedSnapshot).toHaveBeenCalledTimes(2)
      expect(await getLastSyncedAt('account-1')).toBeNull()
    })
  })

  describe('batched apply', () => {
    const solveChange = (id: string, version: number, durationMs: number): Change => ({
      cursor: version,
      entity: 'solve',
      entity_id: id,
      operation: 'upsert',
      version,
      changed_at: nowIso(),
      data: {
        id,
        session_id: null,
        duration_ms: durationMs,
        penalty: 'none',
        solved_at: '2026-08-22T18:00:00.000Z',
        scramble: 'R U',
        event: '3x3',
        timing_device: 'keyboard',
        version,
        updated_at: nowIso(),
      },
    })

    it('applies the newest version when one response carries several changes for an entity', async () => {
      const id = createId()
      await applySyncResponse(
        'account-1',
        [],
        [],
        [solveChange(id, 1, 1000), solveChange(id, 3, 3000), solveChange(id, 2, 2000)],
        3,
      )

      const stored = await db.solves.get(id)
      expect(stored?.version).toBe(3)
      expect(stored?.durationMs).toBe(3000)
    })

    it('skips a change for an entity that still has a pending mutation', async () => {
      const solve = newSolve({
        ownerId: 'account-1',
        sessionId: null,
        durationMs: 1234,
        penalty: 'none',
        scramble: 'R',
        event: '3x3',
      })
      await putSolve(solve, { enqueue: true, baseVersion: 0 })

      await applySyncResponse('account-1', [], [], [solveChange(solve.id, 5, 9999)], 5)

      const stored = await db.solves.get(solve.id)
      expect(stored?.durationMs).toBe(1234)
      expect(stored?.version).toBe(0)
      expect(await db.outbox.count()).toBe(1)
    })

    it('rebases a mutation edited while it was in flight and keeps later outcomes consistent', async () => {
      const solve = newSolve({
        ownerId: 'account-1',
        sessionId: null,
        durationMs: 1000,
        penalty: 'none',
        scramble: 'R',
        event: '3x3',
      })
      await putSolve(solve, { enqueue: true, baseVersion: 0 })
      const [sent] = await listOutbox('account-1')

      // The user edits the same solve while the request is in flight: the outbox row is
      // updated in place, so the server's outcome no longer matches what is queued.
      await putSolve({ ...solve, durationMs: 2000 }, { enqueue: true, baseVersion: 0 })

      await applySyncResponse(
        'account-1',
        [sent],
        [{ mutation_id: sent.id, status: 'accepted', version: 1 }],
        [],
        1,
      )

      const outbox = await listOutbox('account-1')
      expect(outbox).toHaveLength(1)
      expect(outbox[0].id).not.toBe(sent.id)
      expect(outbox[0].baseVersion).toBe(1)
      expect((outbox[0].data as { duration_ms: number }).duration_ms).toBe(2000)
      // The accepted version is not stamped onto a solve that no longer matches the mutation.
      expect((await db.solves.get(solve.id))?.version).toBe(0)
    })

    it('skips pending and older entities when applying a snapshot page', async () => {
      const pending = newSolve({
        ownerId: 'account-1',
        sessionId: null,
        durationMs: 1000,
        penalty: 'none',
        scramble: 'R',
        event: '3x3',
      })
      await putSolve(pending, { enqueue: true, baseVersion: 0 })
      const newer = newSolve({
        ownerId: 'account-1',
        sessionId: null,
        durationMs: 2000,
        penalty: 'none',
        scramble: 'R',
        event: '3x3',
      })
      await putSolve({ ...newer, version: 4 }, { enqueue: false })

      await applySnapshotData('account-1', [], [
        {
          id: pending.id,
          session_id: null,
          duration_ms: 5555,
          penalty: 'none',
          solved_at: pending.solvedAt,
          scramble: 'R',
          event: '3x3',
          timing_device: 'keyboard',
          version: 9,
          updated_at: nowIso(),
        },
        {
          id: newer.id,
          session_id: null,
          duration_ms: 5555,
          penalty: 'none',
          solved_at: newer.solvedAt,
          scramble: 'R',
          event: '3x3',
          timing_device: 'keyboard',
          version: 2,
          updated_at: nowIso(),
        },
      ])

      expect((await db.solves.get(pending.id))?.durationMs).toBe(1000)
      expect((await db.solves.get(newer.id))?.durationMs).toBe(2000)
    })
  })

  describe('withBackoff helper', () => {
    it('retries on 429 and succeeds', async () => {
      let attempts = 0
      const fn = vi.fn(async () => {
        attempts += 1
        if (attempts === 1) {
          throw new ApiError(429, 'rate_limited', 'Too many requests')
        }
        return 'success'
      })

      const res = await withBackoff(fn, 0)
      expect(res).toBe('success')
      expect(attempts).toBe(2)
    })

    it('throws non-retryable 400 errors immediately without backoff retry', async () => {
      const fn = vi.fn(async () => {
        throw new ApiError(400, 'bad_request', 'Invalid input')
      })

      await expect(withBackoff(fn, 0)).rejects.toThrow('Invalid input')
      expect(fn).toHaveBeenCalledTimes(1)
    })
  })
})