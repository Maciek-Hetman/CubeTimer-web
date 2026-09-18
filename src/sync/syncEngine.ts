import type { Table } from 'dexie'
import { snapshot as snapshotRequest, sync as syncRequest } from '../api/sync'
import { ApiError } from '../api/types'
import type {
  ApiSession,
  ApiSolve,
  Change,
  DeleteStub,
  Mutation,
  MutationOutcome,
  SnapshotResponse,
} from '../api/types'
import { db, getMeta, type ConflictRecord, type RejectedRecord } from '../data/db'
import { listOutbox, removeOutbox } from '../data/repositories/outbox'
import { toSessionInput } from '../data/repositories/sessions'
import { toSolveInput } from '../data/repositories/solves'
import type { CubeSession, MutationRecord, Solve } from '../domain/models'
import { createId, normalizeTimingDevice, nowIso } from '../domain/models'

export type SyncStatus = 'idle' | 'syncing' | 'pending' | 'offline' | 'error' | 'conflict'

export const ZERO_UUID = '00000000-0000-0000-0000-000000000000'

interface SyncEngineOptions {
  ownerId: string
  accessToken: string
  device: { id: string; name: string; platform: string }
  getAccessToken?: () => Promise<string>
  protocolVersion?: number
}

export function cursorKey(ownerId: string): string {
  return `cursor:${ownerId}`
}

export function lastSyncKey(ownerId: string): string {
  return `last_sync_at:${ownerId}`
}

export async function getCursor(ownerId: string): Promise<number> {
  return getMeta(cursorKey(ownerId), 0)
}

export async function setCursor(ownerId: string, cursor: number): Promise<void> {
  await db.meta.put({ key: cursorKey(ownerId), value: cursor })
}

export async function getLastSyncedAt(ownerId: string): Promise<string | null> {
  return getMeta<string | null>(lastSyncKey(ownerId), null)
}

const SNAPSHOT_PAGE_SIZE = 500
const SNAPSHOT_MAX_PAGES = 10_000

export async function runSnapshotBootstrap(options: SyncEngineOptions): Promise<number> {
  let accessToken = options.accessToken
  let requestCursor = 0
  // The spec calls the cursor a stable watermark; keep the lowest one seen so a server that
  // advances it mid-paging makes incremental sync replay changes instead of skipping them.
  let watermark: number | null = null
  let entity: 'session' | 'solve' = 'session'
  let afterId: string = ZERO_UUID
  const seenPositions = new Set<string>([`${entity}:${afterId}`])
  let pages = 0
  let refreshedForRequest = false

  for (;;) {
    let response: SnapshotResponse
    try {
      response = await snapshotRequest(accessToken, {
        device: options.device,
        cursor: requestCursor,
        after_id: afterId,
        entity,
        page_size: SNAPSHOT_PAGE_SIZE,
      })
    } catch (error) {
      if (error instanceof ApiError && error.status === 401 && options.getAccessToken && !refreshedForRequest) {
        refreshedForRequest = true
        accessToken = await options.getAccessToken()
        continue
      }
      throw error
    }
    refreshedForRequest = false
    pages += 1

    requestCursor = response.cursor
    watermark = watermark === null ? response.cursor : Math.min(watermark, response.cursor)

    await applySnapshotData(options.ownerId, response.sessions, response.solves)

    if (!response.has_more) {
      break
    }
    entity = response.next_entity ?? (response.sessions && response.sessions.length > 0 ? 'session' : 'solve')
    afterId = response.next_after_id ?? ZERO_UUID
    const position = `${entity}:${afterId}`
    if (seenPositions.has(position)) {
      throw new Error(`Snapshot bootstrap made no progress at ${position}`)
    }
    seenPositions.add(position)
    if (pages >= SNAPSHOT_MAX_PAGES) {
      throw new Error(`Snapshot bootstrap exceeded ${SNAPSHOT_MAX_PAGES} pages`)
    }
  }

  await setCursor(options.ownerId, watermark)
  await db.meta.put({ key: lastSyncKey(options.ownerId), value: nowIso() })
  return watermark
}

export async function applySnapshotData(
  ownerId: string,
  sessions: ApiSession[] = [],
  solves: ApiSolve[] = [],
): Promise<void> {
  await db.transaction('rw', [db.sessions, db.solves, db.outbox], async () => {
    const pendingOutbox = await db.outbox.where('ownerId').equals(ownerId).toArray()
    const pendingEntityIds = new Set(pendingOutbox.map((r) => r.entityId))
    const existingSessions = await loadById(db.sessions, sessions.map((s) => s.id).filter((id) => !pendingEntityIds.has(id)))
    const existingSolves = await loadById(db.solves, solves.map((sl) => sl.id).filter((id) => !pendingEntityIds.has(id)))

    const sessionsToPut: CubeSession[] = []
    for (const s of sessions) {
      if (pendingEntityIds.has(s.id)) {
        continue
      }
      const existing = existingSessions.get(s.id)
      if (existing && existing.version >= s.version) {
        continue
      }
      sessionsToPut.push({
        id: s.id,
        ownerId,
        name: s.name,
        event: s.event as CubeSession['event'],
        kind: s.kind as CubeSession['kind'],
        startedAt: s.started_at,
        endedAt: s.ended_at ?? null,
        archived: Boolean(s.archived),
        version: s.version,
        updatedAt: s.updated_at ?? nowIso(),
        deletedAt: s.deleted_at ?? null,
      })
    }
    if (sessionsToPut.length > 0) {
      await db.sessions.bulkPut(sessionsToPut)
    }

    const solvesToPut: Solve[] = []
    for (const sl of solves) {
      if (pendingEntityIds.has(sl.id)) {
        continue
      }
      const existing = existingSolves.get(sl.id)
      if (existing && existing.version >= sl.version) {
        continue
      }
      solvesToPut.push({
        id: sl.id,
        ownerId,
        sessionId: sl.session_id ?? null,
        durationMs: sl.duration_ms,
        penalty: sl.penalty as Solve['penalty'],
        solvedAt: sl.solved_at,
        scramble: sl.scramble ?? '',
        event: sl.event as Solve['event'],
        timingDevice: normalizeTimingDevice(sl.timing_device),
        version: sl.version,
        updatedAt: sl.updated_at ?? nowIso(),
        deletedAt: sl.deleted_at ?? null,
      })
    }
    if (solvesToPut.length > 0) {
      await db.solves.bulkPut(solvesToPut)
    }
  })
}

export async function runSync(options: SyncEngineOptions): Promise<{
  status: SyncStatus
  conflicts: number
  rejected: number
}> {
  if (!navigator.onLine) {
    return { status: 'offline', conflicts: 0, rejected: 0 }
  }
  let accessToken = options.accessToken
  let hasMore = true
  let conflicts = 0
  let rejected = 0
  let loops = 0
  let refreshedForRequest = false
  let bootstrapped = false
  // The outbox read after applying a response is reused as the next request's mutations.
  let nextMutations: MutationRecord[] | null = null
  while (hasMore && loops < 50) {
    loops += 1
    const mutations = nextMutations ?? (await listOutbox(options.ownerId))
    nextMutations = null
    const cursor = await getCursor(options.ownerId)
    let response
    try {
      response = await syncRequest(
        accessToken,
        {
          cursor,
          device: options.device,
          mutations: mutations.map(toApiMutation),
          limit: 1000,
        },
        { protocolVersion: options.protocolVersion ?? 2 },
      )
    } catch (error) {
      if (error instanceof ApiError && error.status === 401 && options.getAccessToken && !refreshedForRequest) {
        refreshedForRequest = true
        accessToken = await options.getAccessToken()
        continue
      }
      if (error instanceof ApiError && error.status === 409 && error.code === 'cursor_expired') {
        // A fresh snapshot watermark that is already expired would bootstrap forever.
        if (bootstrapped) {
          throw error
        }
        bootstrapped = true
        await setCursor(options.ownerId, 0)
        await runSnapshotBootstrap({
          ownerId: options.ownerId,
          accessToken,
          device: options.device,
          getAccessToken: options.getAccessToken,
          protocolVersion: options.protocolVersion,
        })
        continue
      }
      throw error
    }
    refreshedForRequest = false
    const applied = await applySyncResponse(options.ownerId, mutations, response.outcomes, response.changes, response.next_cursor)
    conflicts += applied.conflicts
    rejected += applied.rejected
    const remaining = await listOutbox(options.ownerId)
    nextMutations = remaining
    hasMore = response.has_more || remaining.length > 0
    if (!response.has_more && mutations.length === 0) {
      break
    }
    // Stop when the server left every remaining mutation unresolved; resending them unchanged
    // in the same run would only repeat the same outcome. They are retried on the next sync.
    const sentById = new Map(mutations.map((record) => [record.id, record]))
    const unchanged = remaining.every((record) => {
      const sentRecord = sentById.get(record.id)
      return sentRecord !== undefined && sameMutation(sentRecord, record)
    })
    if (!response.has_more && unchanged) {
      break
    }
  }
  await db.meta.put({ key: lastSyncKey(options.ownerId), value: nowIso() })
  return { status: conflicts > 0 ? 'conflict' : hasMore ? 'pending' : 'idle', conflicts, rejected }
}

export async function applySyncResponse(
  ownerId: string,
  sent: MutationRecord[],
  outcomes: MutationOutcome[],
  changes: Change[],
  nextCursor: number,
): Promise<{ conflicts: number; rejected: number }> {
  const sentById = new Map(sent.map((record) => [record.id, record]))
  const latestSentByEntity = new Map<string, MutationRecord>()
  for (const record of sent) {
    const key = `${record.entity}:${record.entityId}`
    const latest = latestSentByEntity.get(key)
    if (!latest || latest.createdAt < record.createdAt) {
      latestSentByEntity.set(key, record)
    }
  }
  let conflicts = 0
  let rejected = 0
  await db.transaction(
    'rw',
    [db.sessions, db.solves, db.outbox, db.conflicts, db.rejections, db.meta],
    async () => {
      const removedIds: string[] = []
      const sessionsToPut = new Map<string, CubeSession>()
      const solvesToPut = new Map<string, Solve>()
      const conflictsToPut: ConflictRecord[] = []
      const rejectionsToPut: RejectedRecord[] = []

      // Nothing else writes these tables inside this transaction until the final bulk writes,
      // so one read up front matches reading each row when it is needed.
      const outboxById = new Map<string, MutationRecord>()
      for (const record of await db.outbox.where('ownerId').equals(ownerId).toArray()) {
        outboxById.set(record.id, record)
      }
      // Rebasing keeps a row's entityId, so this set stays valid for the whole transaction.
      const pendingEntityIds = new Set<string>()
      for (const record of outboxById.values()) {
        pendingEntityIds.add(record.entityId)
      }
      const sessionIds: string[] = []
      const solveIds: string[] = []
      for (const outcome of outcomes) {
        const local = sentById.get(outcome.mutation_id)
        if (local) {
          const ids = local.entity === 'session' ? sessionIds : solveIds
          ids.push(local.entityId)
        }
      }
      for (const change of changes) {
        if (!pendingEntityIds.has(change.entity_id)) {
          const ids = change.entity === 'session' ? sessionIds : solveIds
          ids.push(change.entity_id)
        }
      }
      const storedSessions = await loadById(db.sessions, sessionIds)
      const storedSolves = await loadById(db.solves, solveIds)

      for (const outcome of outcomes) {
        const local = sentById.get(outcome.mutation_id)
        if (!local) {
          continue
        }
        const pending = outboxById.get(local.id)
        const changedWhileSending = pending !== undefined && !sameMutation(pending, local)
        if (outcome.status === 'accepted') {
          removedIds.push(outcome.mutation_id)
          if (changedWhileSending && pending) {
            await rebasePendingMutation(outboxById, pending, outcome.version)
            continue
          }
          if (local.entity === 'session') {
            const session = sessionsToPut.get(local.entityId) ?? storedSessions.get(local.entityId)
            if (
              session &&
              outcome.version !== undefined &&
              outcome.version >= session.version &&
              latestSentByEntity.get(`session:${local.entityId}`)?.id === local.id &&
              matchesMutation(session, local)
            ) {
              sessionsToPut.set(session.id, { ...session, version: outcome.version })
            }
          } else {
            const solve = solvesToPut.get(local.entityId) ?? storedSolves.get(local.entityId)
            if (
              solve &&
              outcome.version !== undefined &&
              outcome.version >= solve.version &&
              latestSentByEntity.get(`solve:${local.entityId}`)?.id === local.id &&
              matchesMutation(solve, local)
            ) {
              solvesToPut.set(solve.id, { ...solve, version: outcome.version })
            }
          }
          continue
        }

        const previous =
          local.entity === 'session'
            ? (sessionsToPut.get(local.entityId) ?? storedSessions.get(local.entityId))
            : (solvesToPut.get(local.entityId) ?? storedSolves.get(local.entityId))
        // Without `current`, a conflict is only resolvable when we know the server version and
        // still have the local entity to show; otherwise it falls through to a rejection.
        const rawCurrent: Record<string, unknown> | undefined =
          outcome.current !== undefined
            ? (outcome.current as Record<string, unknown>)
            : previous && outcome.version !== undefined
              ? { id: local.entityId, version: outcome.version }
              : undefined

        if (outcome.status === 'conflict' && rawCurrent) {
          removedIds.push(outcome.mutation_id)
          conflicts += 1
          const isConflictStub = rawCurrent.name === undefined && rawCurrent.duration_ms === undefined

          let current: CubeSession | Solve
          if (isConflictStub && previous) {
            current = {
              ...previous,
              version: Number(rawCurrent.version ?? outcome.version ?? previous.version),
              updatedAt: String(rawCurrent.updated_at ?? nowIso()),
            }
          } else {
            current = mapChangeData(ownerId, local.entity, rawCurrent)
          }

          if (local.entity === 'session') {
            sessionsToPut.set(current.id, current as CubeSession)
          } else {
            solvesToPut.set(current.id, current as Solve)
          }
          conflictsToPut.push({
            id: outcome.mutation_id,
            ownerId,
            entity: local.entity,
            entityId: local.entityId,
            message: outcome.message ?? 'Remote version differs',
            current,
            local: previous ?? current,
            createdAt: nowIso(),
          })
        } else if (changedWhileSending && pending) {
          await rebasePendingMutation(outboxById, pending, outcome.version)
        } else {
          // Rejections, unresolvable conflicts and unknown statuses must leave the outbox,
          // otherwise the same mutation is resent on every sync.
          removedIds.push(outcome.mutation_id)
          rejected += 1
          rejectionsToPut.push({
            id: outcome.mutation_id,
            ownerId,
            entity: local.entity,
            entityId: local.entityId,
            operation: local.operation,
            code: outcome.code ?? (outcome.status === 'rejected' ? undefined : `unresolved_${String(outcome.status)}`),
            message: outcome.message,
            data: local.data,
            createdAt: nowIso(),
          })
        }
      }

      for (const change of changes) {
        // Matches on entityId alone, whatever the entity type, and still counts rows whose
        // outcomes are handled above because they are only removed at the end.
        if (pendingEntityIds.has(change.entity_id)) {
          continue
        }

        const rawData = change.data as Record<string, unknown>
        const isDelete = change.operation === 'delete' || rawData.deleted_at != null
        const isDeleteStub = isDelete && rawData.name === undefined && rawData.duration_ms === undefined

        if (change.entity === 'session') {
          const existing = sessionsToPut.get(change.entity_id) ?? storedSessions.get(change.entity_id)
          if (existing && existing.version >= change.version) {
            continue
          }
          if (isDeleteStub) {
            if (existing) {
              sessionsToPut.set(change.entity_id, {
                ...existing,
                version: change.version,
                deletedAt: String(rawData.deleted_at ?? change.changed_at ?? nowIso()),
                updatedAt: String(rawData.updated_at ?? change.changed_at ?? nowIso()),
              })
            } else {
              sessionsToPut.set(change.entity_id, {
                id: change.entity_id,
                ownerId,
                name: 'Deleted Session',
                event: '3x3',
                kind: 'manual',
                startedAt: String(rawData.started_at ?? change.changed_at ?? nowIso()),
                endedAt: null,
                archived: true,
                version: change.version,
                updatedAt: String(rawData.updated_at ?? change.changed_at ?? nowIso()),
                deletedAt: String(rawData.deleted_at ?? change.changed_at ?? nowIso()),
              })
            }
          } else {
            sessionsToPut.set(change.entity_id, mapChangeData(ownerId, 'session', rawData) as CubeSession)
          }
        } else {
          const existing = solvesToPut.get(change.entity_id) ?? storedSolves.get(change.entity_id)
          if (existing && existing.version >= change.version) {
            continue
          }
          if (isDeleteStub) {
            if (existing) {
              solvesToPut.set(change.entity_id, {
                ...existing,
                version: change.version,
                deletedAt: String(rawData.deleted_at ?? change.changed_at ?? nowIso()),
                updatedAt: String(rawData.updated_at ?? change.changed_at ?? nowIso()),
              })
            } else {
              solvesToPut.set(change.entity_id, {
                id: change.entity_id,
                ownerId,
                sessionId: null,
                durationMs: 0,
                penalty: 'none',
                solvedAt: String(rawData.solved_at ?? change.changed_at ?? nowIso()),
                scramble: '',
                event: '3x3',
                timingDevice: 'keyboard',
                version: change.version,
                updatedAt: String(rawData.updated_at ?? change.changed_at ?? nowIso()),
                deletedAt: String(rawData.deleted_at ?? change.changed_at ?? nowIso()),
              })
            }
          } else {
            solvesToPut.set(change.entity_id, mapChangeData(ownerId, 'solve', rawData) as Solve)
          }
        }
      }

      if (sessionsToPut.size > 0) {
        await db.sessions.bulkPut(Array.from(sessionsToPut.values()))
      }
      if (solvesToPut.size > 0) {
        await db.solves.bulkPut(Array.from(solvesToPut.values()))
      }
      if (conflictsToPut.length > 0) {
        await db.conflicts.bulkPut(conflictsToPut)
      }
      if (rejectionsToPut.length > 0) {
        await db.rejections.bulkPut(rejectionsToPut)
      }
      if (removedIds.length > 0) {
        await removeOutbox(removedIds)
      }
      await db.meta.put({ key: cursorKey(ownerId), value: nextCursor })
    },
  )
  return { conflicts, rejected }
}

function toApiMutation(record: MutationRecord): Mutation {
  return {
    id: record.id,
    entity: record.entity,
    entity_id: record.entityId,
    operation: record.operation,
    base_version: record.baseVersion,
    data: record.data as Record<string, unknown> | undefined,
  }
}

function sameMutation(left: MutationRecord, right: MutationRecord): boolean {
  return (
    left.operation === right.operation &&
    left.baseVersion === right.baseVersion &&
    JSON.stringify(left.data) === JSON.stringify(right.data)
  )
}

function matchesMutation(entity: CubeSession | Solve, mutation: MutationRecord): boolean {
  if (mutation.operation === 'delete') {
    return entity.deletedAt !== null
  }
  if (!mutation.data) {
    return true
  }
  const payload = mutation.entity === 'session'
    ? toSessionInput(entity as CubeSession)
    : toSolveInput(entity as Solve)
  return JSON.stringify(payload) === JSON.stringify(mutation.data)
}

async function rebasePendingMutation(
  outboxById: Map<string, MutationRecord>,
  record: MutationRecord,
  baseVersion?: number,
): Promise<void> {
  const rebased: MutationRecord = {
    ...record,
    id: createId(),
    baseVersion: baseVersion ?? record.baseVersion,
    createdAt: nowIso(),
  }
  await db.outbox.delete(record.id)
  await db.outbox.put(rebased)
  outboxById.delete(record.id)
  outboxById.set(rebased.id, rebased)
}

async function loadById<T extends { id: string }>(table: Table<T, string>, ids: string[]): Promise<Map<string, T>> {
  const unique = Array.from(new Set(ids))
  const rows = unique.length > 0 ? await table.bulkGet(unique) : []
  const byId = new Map<string, T>()
  for (const row of rows) {
    if (row) {
      byId.set(row.id, row)
    }
  }
  return byId
}

function mapChangeData(
  ownerId: string,
  entity: 'session' | 'solve',
  data: Record<string, unknown> | DeleteStub,
): CubeSession | Solve {
  const d = data as Record<string, unknown>
  if (entity === 'session') {
    return {
      id: String(d.id),
      ownerId,
      name: String(d.name ?? 'Session'),
      event: (d.event as CubeSession['event']) ?? '3x3',
      kind: (d.kind as CubeSession['kind']) ?? 'manual',
      startedAt: String(d.started_at ?? nowIso()),
      endedAt: (d.ended_at as string | null) ?? null,
      archived: Boolean(d.archived),
      version: Number(d.version ?? 0),
      updatedAt: String(d.updated_at ?? nowIso()),
      deletedAt: (d.deleted_at as string | null) ?? null,
    }
  }
  return {
    id: String(d.id),
    ownerId,
    sessionId: (d.session_id as string | null) ?? null,
    durationMs: Number(d.duration_ms ?? 0),
    penalty: (d.penalty as Solve['penalty']) ?? 'none',
    solvedAt: String(d.solved_at ?? nowIso()),
    scramble: String(d.scramble ?? ''),
    event: (d.event as Solve['event']) ?? '3x3',
    timingDevice: normalizeTimingDevice(d.timing_device),
    version: Number(d.version ?? 0),
    updatedAt: String(d.updated_at ?? nowIso()),
    deletedAt: (d.deleted_at as string | null) ?? null,
  }
}

export async function withBackoff<T>(
  fn: () => Promise<T>,
  attempt: number,
): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    const retryable =
      error instanceof ApiError
        ? error.status === 429 || error.status >= 500
        : error instanceof TypeError
    if (!retryable || attempt >= 5) {
      throw error
    }
    const delay = Math.min(30_000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250)
    await new Promise((resolve) => setTimeout(resolve, delay))
    return withBackoff(fn, attempt + 1)
  }
}
