import { sync as syncRequest } from '../api/sync'
import { ApiError } from '../api/types'
import type { Change, Mutation, MutationOutcome } from '../api/types'
import { db, getMeta } from '../data/db'
import { listOutbox, removeOutbox } from '../data/repositories/outbox'
import { toSessionInput } from '../data/repositories/sessions'
import { toSolveInput } from '../data/repositories/solves'
import type { CubeSession, MutationRecord, Solve } from '../domain/models'
import { nowIso } from '../domain/models'

export type SyncStatus = 'idle' | 'syncing' | 'pending' | 'offline' | 'error' | 'conflict'

export interface SyncEngineOptions {
  ownerId: string
  accessToken: string
  device: { id: string; name: string; platform: string }
  getAccessToken?: () => Promise<string>
}

function cursorKey(ownerId: string): string {
  return `cursor:${ownerId}`
}

export async function getCursor(ownerId: string): Promise<number> {
  return getMeta(cursorKey(ownerId), 0)
}

export async function runSync(options: SyncEngineOptions): Promise<{
  status: SyncStatus
  conflicts: number
}> {
  if (!navigator.onLine) {
    return { status: 'offline', conflicts: 0 }
  }
  let accessToken = options.accessToken
  let hasMore = true
  let conflicts = 0
  let loops = 0
  while (hasMore && loops < 50) {
    loops += 1
    const mutations = await listOutbox(options.ownerId)
    const cursor = await getCursor(options.ownerId)
    let response
    try {
      response = await syncRequest(accessToken, {
        cursor,
        device: options.device,
        mutations: mutations.map(toApiMutation),
        limit: 1000,
      })
    } catch (error) {
      if (error instanceof ApiError && error.status === 401 && options.getAccessToken) {
        accessToken = await options.getAccessToken()
        continue
      }
      throw error
    }
    conflicts += await applySyncResponse(options.ownerId, mutations, response.outcomes, response.changes, response.next_cursor)
    hasMore = response.has_more || (await listOutbox(options.ownerId)).length > 0
    if (!response.has_more && mutations.length === 0) {
      break
    }
  }
  return { status: conflicts > 0 ? 'conflict' : 'idle', conflicts }
}

export async function applySyncResponse(
  ownerId: string,
  sent: MutationRecord[],
  outcomes: MutationOutcome[],
  changes: Change[],
  nextCursor: number,
): Promise<number> {
  const sentById = new Map(sent.map((record) => [record.id, record]))
  let conflicts = 0
  await db.transaction('rw', db.sessions, db.solves, db.outbox, db.conflicts, db.meta, async () => {
    const acceptedIds: string[] = []
    for (const outcome of outcomes) {
      const local = sentById.get(outcome.mutation_id)
      if (!local) {
        continue
      }
      if (outcome.status === 'accepted') {
        acceptedIds.push(outcome.mutation_id)
        if (local.entity === 'session') {
          const session = await db.sessions.get(local.entityId)
          if (session && outcome.version !== undefined) {
            await db.sessions.put({ ...session, version: outcome.version, updatedAt: nowIso() })
          }
        } else {
          const solve = await db.solves.get(local.entityId)
          if (solve && outcome.version !== undefined) {
            await db.solves.put({ ...solve, version: outcome.version, updatedAt: nowIso() })
          }
        }
      } else if (outcome.status === 'rejected') {
        acceptedIds.push(outcome.mutation_id)
      } else if (outcome.status === 'conflict' && outcome.current) {
        acceptedIds.push(outcome.mutation_id)
        conflicts += 1
        const current = mapChangeData(ownerId, local.entity, outcome.current)
        const previous =
          local.entity === 'session'
            ? await db.sessions.get(local.entityId)
            : await db.solves.get(local.entityId)
        if (local.entity === 'session') {
          await db.sessions.put(current as CubeSession)
        } else {
          await db.solves.put(current as Solve)
        }
        await db.conflicts.put({
          id: outcome.mutation_id,
          ownerId,
          entity: local.entity,
          entityId: local.entityId,
          message: outcome.message ?? 'Remote version differs',
          current: current as CubeSession | Solve,
          local: previous ?? (current as CubeSession | Solve),
          createdAt: nowIso(),
        })
      }
    }
    if (acceptedIds.length > 0) {
      await removeOutbox(acceptedIds)
    }
    for (const change of changes) {
      await applyChange(ownerId, change)
    }
    await db.meta.put({ key: cursorKey(ownerId), value: nextCursor })
  })
  return conflicts
}

export function toApiMutation(record: MutationRecord): Mutation {
  return {
    id: record.id,
    entity: record.entity,
    entity_id: record.entityId,
    operation: record.operation,
    base_version: record.baseVersion,
    data: record.data as Record<string, unknown> | undefined,
  }
}

async function applyChange(ownerId: string, change: Change): Promise<void> {
  const mapped = mapChangeData(ownerId, change.entity, change.data)
  if (change.entity === 'session') {
    const session = mapped as CubeSession
    const existing = await db.sessions.get(session.id)
    if (existing && existing.version > session.version) {
      return
    }
    await db.sessions.put(session)
    return
  }
  const solve = mapped as Solve
  const existing = await db.solves.get(solve.id)
  if (existing && existing.version > solve.version) {
    return
  }
  await db.solves.put(solve)
}

export function mapChangeData(
  ownerId: string,
  entity: 'session' | 'solve',
  data: Record<string, unknown>,
): CubeSession | Solve {
  if (entity === 'session') {
    return {
      id: String(data.id),
      ownerId,
      name: String(data.name),
      event: data.event as CubeSession['event'],
      kind: data.kind as CubeSession['kind'],
      startedAt: String(data.started_at),
      endedAt: (data.ended_at as string | null) ?? null,
      archived: Boolean(data.archived),
      version: Number(data.version ?? 0),
      updatedAt: String(data.updated_at ?? nowIso()),
      deletedAt: (data.deleted_at as string | null) ?? null,
    }
  }
  return {
    id: String(data.id),
    ownerId,
    sessionId: (data.session_id as string | null) ?? null,
    durationMs: Number(data.duration_ms),
    penalty: data.penalty as Solve['penalty'],
    solvedAt: String(data.solved_at),
    scramble: String(data.scramble ?? ''),
    event: data.event as Solve['event'],
    version: Number(data.version ?? 0),
    updatedAt: String(data.updated_at ?? nowIso()),
    deletedAt: (data.deleted_at as string | null) ?? null,
  }
}

export function localToSessionPayload(session: CubeSession) {
  return toSessionInput(session)
}

export function localToSolvePayload(solve: Solve) {
  return toSolveInput(solve)
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
