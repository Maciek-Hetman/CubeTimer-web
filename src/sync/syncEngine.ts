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
import { enqueueMutationsBatch, listOutbox, removeOutbox } from '../data/repositories/outbox'
import { toSessionInput } from '../data/repositories/sessions'
import { toSolveInput } from '../data/repositories/solves'
import type {
  CubeSession,
  MutationRecord,
  RemoteEntityState,
  SessionInput,
  Solve,
  SolveInput,
} from '../domain/models'
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
    const queued = queuedIndex(await db.outbox.where('ownerId').equals(ownerId).toArray())
    const liveSessions = sessions.filter((s) => !queued.stash('session', s.id, snapshotState(s)))
    const liveSolves = solves.filter((sl) => !queued.stash('solve', sl.id, snapshotState(sl)))
    const existingSessions = await loadById(db.sessions, liveSessions.map((s) => s.id))
    const existingSolves = await loadById(db.solves, liveSolves.map((sl) => sl.id))

    const sessionsToPut: CubeSession[] = []
    for (const s of liveSessions) {
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
    for (const sl of liveSolves) {
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
    const stashed = queued.updatedRecords()
    if (stashed.length > 0) {
      await db.outbox.bulkPut(stashed)
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
  // A conflict outcome may carry only the server's version; its content then comes from here.
  const remoteByEntity = new Map<string, RemoteEntityState>()
  for (const change of changes) {
    const key = entityKey(change.entity, change.entity_id)
    remoteByEntity.set(key, newerState(remoteByEntity.get(key), changeState(change)))
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
        const ids = change.entity === 'session' ? sessionIds : solveIds
        ids.push(change.entity_id)
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
        const reported = outcome.current as Record<string, unknown> | undefined
        const serverVersion = toVersion(reported?.version) ?? outcome.version

        if (outcome.status === 'conflict' && serverVersion !== undefined) {
          // Protocol v2 may report only the server's version (a ConflictStub). Its content is then
          // in this response's changes, or was kept on the queued row when it arrived earlier.
          const known = [
            outcomeState(reported, serverVersion),
            remoteByEntity.get(entityKey(local.entity, local.entityId)),
            pending?.remote,
            local.remote,
          ].reduce<RemoteEntityState | undefined>(newerState, undefined)
          const server =
            known && known.version >= serverVersion
              ? toLocalEntity(ownerId, local.entity, local.entityId, known, previous)
              : undefined
          // With no server copy, show local data at the server's version but leave the stored row
          // alone: stamping that version onto local data would hide the difference from later syncs.
          const current =
            server ??
            (previous && {
              ...previous,
              version: serverVersion,
              updatedAt: String(reported?.updated_at ?? nowIso()),
            })
          // Without either copy there is nothing to show, so it falls through to a rejection.
          if (current) {
            removedIds.push(outcome.mutation_id)
            conflicts += 1
            if (server && local.entity === 'session') {
              sessionsToPut.set(server.id, server as CubeSession)
            } else if (server) {
              solvesToPut.set(server.id, server as Solve)
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
              ...(server ? {} : { serverDataMissing: true }),
            })
            continue
          }
        }

        if (changedWhileSending && pending) {
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

      // Rows still queued after the outcomes above hold local edits the server hasn't taken yet.
      // Their incoming changes are kept on the row instead of overwriting those edits.
      const removed = new Set(removedIds)
      const queued = queuedIndex([...outboxById.values()].filter((record) => !removed.has(record.id)))
      for (const change of changes) {
        const state = changeState(change)
        if (queued.stash(change.entity, change.entity_id, state)) {
          continue
        }
        const id = change.entity_id
        const existing =
          change.entity === 'session'
            ? (sessionsToPut.get(id) ?? storedSessions.get(id))
            : (solvesToPut.get(id) ?? storedSolves.get(id))
        if (existing && existing.version >= change.version) {
          continue
        }
        const next = toLocalEntity(ownerId, change.entity, id, state, existing)
        if (change.entity === 'session') {
          sessionsToPut.set(id, next as CubeSession)
        } else {
          solvesToPut.set(id, next as Solve)
        }
      }

      const stashed = queued.updatedRecords()
      if (stashed.length > 0) {
        await db.outbox.bulkPut(stashed)
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

/**
 * Queues the current local copy of every rejected entity again and clears those rejections.
 * A rejection whose row is gone locally is kept, since nothing can be sent for it.
 * Returns how many mutations were queued.
 */
export async function requeueRejected(ownerId: string): Promise<number> {
  return db.transaction('rw', [db.rejections, db.sessions, db.solves, db.outbox], async () => {
    const rejections = await db.rejections.where('ownerId').equals(ownerId).toArray()
    const sessions = await loadById(
      db.sessions,
      rejections.filter((r) => r.entity === 'session').map((r) => r.entityId),
    )
    const solves = await loadById(
      db.solves,
      rejections.filter((r) => r.entity === 'solve').map((r) => r.entityId),
    )
    const inputs: Parameters<typeof enqueueMutationsBatch>[0] = []
    const cleared: string[] = []
    const requeue = (
      rejection: RejectedRecord,
      row: CubeSession | Solve | undefined,
      data: SessionInput | SolveInput | undefined,
    ) => {
      if (!row) {
        return
      }
      cleared.push(rejection.id)
      // Deleted locally and missing on the server: the change already holds.
      if (row.deletedAt && rejection.code === 'not_found') {
        return
      }
      inputs.push({
        ownerId,
        entity: rejection.entity,
        entityId: row.id,
        operation: row.deletedAt ? 'delete' : 'upsert',
        baseVersion: row.version,
        data: row.deletedAt ? undefined : data,
      })
    }
    for (const rejection of rejections) {
      if (rejection.entity === 'session') {
        const session = sessions.get(rejection.entityId)
        requeue(rejection, session, session && toSessionInput(session))
      } else {
        const solve = solves.get(rejection.entityId)
        requeue(rejection, solve, solve && toSolveInput(solve))
      }
    }
    await enqueueMutationsBatch(inputs)
    await db.rejections.bulkDelete(cleared)
    return inputs.length
  })
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

function entityKey(entity: 'session' | 'solve', id: string): string {
  return `${entity}:${id}`
}

function toVersion(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function hasEntityFields(data: Record<string, unknown>): boolean {
  return data.name !== undefined || data.duration_ms !== undefined
}

function newerState(a: RemoteEntityState | undefined, b: RemoteEntityState): RemoteEntityState
function newerState(
  a: RemoteEntityState | undefined,
  b: RemoteEntityState | undefined,
): RemoteEntityState | undefined
function newerState(a: RemoteEntityState | undefined, b: RemoteEntityState | undefined) {
  return b && (!a || b.version > a.version) ? b : a
}

function changeState(change: Change): RemoteEntityState {
  const data = change.data as Record<string, unknown>
  return {
    version: change.version,
    data,
    deleted: change.operation === 'delete' || data.deleted_at != null,
    changedAt: change.changed_at,
  }
}

function snapshotState(row: ApiSession | ApiSolve): RemoteEntityState {
  return { version: row.version, data: { ...row }, deleted: row.deleted_at != null }
}

/** The server state a conflict outcome reports, unless it's a ConflictStub with only the version. */
function outcomeState(
  reported: Record<string, unknown> | undefined,
  version: number,
): RemoteEntityState | undefined {
  if (!reported) {
    return undefined
  }
  const deleted = reported.deleted_at != null
  return deleted || hasEntityFields(reported) ? { version, data: reported, deleted } : undefined
}

/** Maps server state to a local row. A delete stub tombstones `existing`, or a placeholder. */
function toLocalEntity(
  ownerId: string,
  entity: 'session' | 'solve',
  entityId: string,
  state: RemoteEntityState,
  existing: CubeSession | Solve | undefined,
): CubeSession | Solve {
  const d = state.data
  if (!state.deleted || hasEntityFields(d)) {
    return mapChangeData(ownerId, entity, d)
  }
  const deletedAt = String(d.deleted_at ?? state.changedAt ?? nowIso())
  const updatedAt = String(d.updated_at ?? state.changedAt ?? nowIso())
  if (existing) {
    return { ...existing, version: state.version, deletedAt, updatedAt }
  }
  if (entity === 'session') {
    return {
      id: entityId,
      ownerId,
      name: 'Deleted Session',
      event: '3x3',
      kind: 'manual',
      startedAt: String(d.started_at ?? state.changedAt ?? nowIso()),
      endedAt: null,
      archived: true,
      version: state.version,
      updatedAt,
      deletedAt,
    }
  }
  return {
    id: entityId,
    ownerId,
    sessionId: null,
    durationMs: 0,
    penalty: 'none',
    solvedAt: String(d.solved_at ?? state.changedAt ?? nowIso()),
    scramble: '',
    event: '3x3',
    timingDevice: 'keyboard',
    version: state.version,
    updatedAt,
    deletedAt,
  }
}

/**
 * Outbox rows by entity. `stash` tells whether an entity has a queued local edit and, if so,
 * keeps the incoming server state on that row; `updatedRecords` lists the rows to write back.
 */
function queuedIndex(records: Iterable<MutationRecord>) {
  const byEntity = new Map<string, MutationRecord>()
  for (const record of records) {
    byEntity.set(entityKey(record.entity, record.entityId), record)
  }
  const updated = new Map<string, MutationRecord>()
  return {
    stash(entity: 'session' | 'solve', id: string, state: RemoteEntityState): boolean {
      const key = entityKey(entity, id)
      const record = byEntity.get(key)
      if (!record) {
        return false
      }
      const remote = newerState(record.remote, state)
      if (remote !== record.remote) {
        const next = { ...record, remote }
        byEntity.set(key, next)
        updated.set(next.id, next)
      }
      return true
    },
    updatedRecords: () => [...updated.values()],
  }
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
