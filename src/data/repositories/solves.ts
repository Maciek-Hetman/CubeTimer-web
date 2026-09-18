import Dexie from 'dexie'
import type { CubeEvent, Solve, SolveInput, TimingDevice } from '../../domain/models'
import { createId, effectiveTimeMs, normalizeTimingDevice, nowIso } from '../../domain/models'
import { db } from '../db'
import { enqueueMutation } from './outbox'

export const RECENT_SOLVES_LIMIT = 25

interface SolvesQueryOptions {
  limit?: number
}

interface SolvesBySessionSummary {
  counts: Map<string, number>
  averages: Map<string, number | null>
  orphanCount: number
  orphanAvgTime: number | null
  /** Timing devices used per session, in first-seen order. */
  devices: Map<string, TimingDevice[]>
  orphanDevices: TimingDevice[]
}

export async function listSolves(
  ownerId: string,
  event?: CubeEvent,
  options: SolvesQueryOptions = {},
): Promise<Solve[]> {
  if (event) {
    const rows = await db.solves
      .where('[ownerId+event]')
      .equals([ownerId, event])
      .filter((solve) => !solve.deletedAt)
      .toArray()
    rows.sort((a, b) => b.solvedAt.localeCompare(a.solvedAt))
    if (options.limit !== undefined) {
      return rows.slice(0, options.limit)
    }
    return rows
  }

  const collection = db.solves
    .where('ownerId')
    .equals(ownerId)
    .filter((solve) => !solve.deletedAt)
  const solves = await collection.toArray()
  solves.sort((a, b) => b.solvedAt.localeCompare(a.solvedAt))
  if (options.limit !== undefined) {
    return solves.slice(0, options.limit)
  }
  return solves
}

export async function countSolves(ownerId: string, event: CubeEvent): Promise<number> {
  return db.solves
    .where('[ownerId+event]')
    .equals([ownerId, event])
    .filter((solve) => !solve.deletedAt)
    .count()
}

type SolvedAtIndex = '[ownerId+event+solvedAt]' | '[ownerId+sessionId+solvedAt]'

function newestFirstOrder(a: Solve, b: Solve): number {
  if (a.solvedAt !== b.solvedAt) {
    return a.solvedAt < b.solvedAt ? 1 : -1
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * Newest `limit` solves under an index prefix, read backwards from the solvedAt index
 * instead of loading and sorting the whole history. Solves sharing a solvedAt stay in
 * id order, so a tie at the cut-off picks the same rows as sorting everything would.
 */
async function newestSolves(
  index: SolvedAtIndex,
  prefix: [string, string],
  limit: number,
  keep: (solve: Solve) => boolean,
): Promise<Solve[]> {
  if (limit <= 0) {
    return []
  }
  const head = await db.solves
    .where(index)
    .between([...prefix, Dexie.minKey], [...prefix, Dexie.maxKey])
    .reverse()
    .filter(keep)
    .limit(limit)
    .toArray()
  if (head.length < limit) {
    return head.sort(newestFirstOrder)
  }
  const cutoff = head[head.length - 1].solvedAt
  const ties = await db.solves.where(index).equals([...prefix, cutoff]).filter(keep).toArray()
  const rows = head.filter((solve) => solve.solvedAt !== cutoff).concat(ties)
  return rows.sort(newestFirstOrder).slice(0, limit)
}

const notDeleted = (solve: Solve) => !solve.deletedAt

export async function recentSolves(
  ownerId: string,
  event: CubeEvent,
  limit = RECENT_SOLVES_LIMIT,
): Promise<Solve[]> {
  return newestSolves('[ownerId+event+solvedAt]', [ownerId, event], limit, notDeleted)
}

export async function latestSolveInSession(
  ownerId: string,
  sessionId: string,
): Promise<Solve | undefined> {
  const rows = await newestSolves('[ownerId+sessionId+solvedAt]', [ownerId, sessionId], 1, notDeleted)
  return rows[0]
}

export async function listSolvesForSession(
  ownerId: string,
  sessionId: string,
  limit = 200,
): Promise<Solve[]> {
  return newestSolves('[ownerId+sessionId+solvedAt]', [ownerId, sessionId], limit, notDeleted)
}

export async function listOrphanSolves(
  ownerId: string,
  event: CubeEvent,
  limit = 200,
): Promise<Solve[]> {
  return newestSolves(
    '[ownerId+event+solvedAt]',
    [ownerId, event],
    limit,
    (solve) => !solve.deletedAt && !solve.sessionId,
  )
}

export async function countSolvesBySession(
  ownerId: string,
  event: CubeEvent,
): Promise<SolvesBySessionSummary> {
  const sessionAcc = new Map<string, { count: number; validCount: number; totalMs: number }>()
  let orphanCount = 0
  let orphanValidCount = 0
  let orphanTotalMs = 0
  const deviceSets = new Map<string, Set<TimingDevice>>()
  const orphanDeviceSet = new Set<TimingDevice>()

  await db.solves
    .where('[ownerId+event]')
    .equals([ownerId, event])
    .each((solve) => {
      if (solve.deletedAt) {
        return
      }
      const effective = effectiveTimeMs(solve)
      const device = normalizeTimingDevice(solve.timingDevice)
      if (solve.sessionId) {
        let devices = deviceSets.get(solve.sessionId)
        if (!devices) {
          devices = new Set()
          deviceSets.set(solve.sessionId, devices)
        }
        devices.add(device)
        let acc = sessionAcc.get(solve.sessionId)
        if (!acc) {
          acc = { count: 0, validCount: 0, totalMs: 0 }
          sessionAcc.set(solve.sessionId, acc)
        }
        acc.count += 1
        if (effective !== null) {
          acc.validCount += 1
          acc.totalMs += effective
        }
      } else {
        orphanCount += 1
        orphanDeviceSet.add(device)
        if (effective !== null) {
          orphanValidCount += 1
          orphanTotalMs += effective
        }
      }
    })

  const counts = new Map<string, number>()
  const averages = new Map<string, number | null>()
  for (const [sessionId, acc] of sessionAcc.entries()) {
    counts.set(sessionId, acc.count)
    averages.set(sessionId, acc.validCount > 0 ? acc.totalMs / acc.validCount : null)
  }

  const orphanAvgTime = orphanValidCount > 0 ? orphanTotalMs / orphanValidCount : null

  const devices = new Map<string, TimingDevice[]>()
  for (const [sessionId, set] of deviceSets.entries()) {
    devices.set(sessionId, [...set])
  }

  return { counts, averages, orphanCount, orphanAvgTime, devices, orphanDevices: [...orphanDeviceSet] }
}

export async function putSolve(
  solve: Solve,
  options: { enqueue: boolean; baseVersion?: number },
): Promise<void> {
  const updated: Solve = {
    ...solve,
    timingDevice: normalizeTimingDevice(solve.timingDevice),
    updatedAt: nowIso(),
  }
  await db.transaction('rw', db.solves, db.outbox, async () => {
    await db.solves.put(updated)
    if (options.enqueue) {
      await enqueueMutation({
        ownerId: updated.ownerId,
        entity: 'solve',
        entityId: updated.id,
        operation: updated.deletedAt ? 'delete' : 'upsert',
        baseVersion: options.baseVersion ?? updated.version,
        data: updated.deletedAt ? undefined : toSolveInput(updated),
      })
    }
  })
}

export function newSolve(input: {
  ownerId: string
  sessionId: string | null
  durationMs: number
  penalty: Solve['penalty']
  scramble: string
  event: CubeEvent
  timingDevice?: TimingDevice
  solvedAt?: string
}): Solve {
  const solvedAt = input.solvedAt ?? nowIso()
  return {
    id: createId(),
    ownerId: input.ownerId,
    sessionId: input.sessionId,
    durationMs: input.durationMs,
    penalty: input.penalty,
    solvedAt,
    scramble: input.scramble,
    event: input.event,
    timingDevice: input.timingDevice ?? 'keyboard',
    version: 0,
    updatedAt: solvedAt,
    deletedAt: null,
  }
}

export function toSolveInput(solve: Solve): SolveInput {
  return {
    id: solve.id,
    session_id: solve.sessionId,
    duration_ms: solve.durationMs,
    penalty: solve.penalty,
    solved_at: solve.solvedAt,
    scramble: solve.scramble,
    event: solve.event,
    timing_device: normalizeTimingDevice(solve.timingDevice),
  }
}