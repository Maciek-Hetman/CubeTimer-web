import { db, getOrCreateSettings } from '../data/db'
import { enqueueMutationsBatch } from '../data/repositories/outbox'
import { toSessionInput } from '../data/repositories/sessions'
import { toSolveInput } from '../data/repositories/solves'
import type { CubeSession, Solve } from '../domain/models'
import { normalizeTimingDevice } from '../domain/models'

export async function adoptGuestData(guestOwnerId: string, accountOwnerId: string): Promise<{
  sessions: number
  solves: number
}> {
  if (guestOwnerId === accountOwnerId) {
    return { sessions: 0, solves: 0 }
  }

  return db.transaction('rw', db.sessions, db.solves, db.outbox, db.settings, db.widgetLayouts, async () => {
    // Read inside the transaction so nothing written in between is left with the guest.
    const sessions = await db.sessions.where('ownerId').equals(guestOwnerId).toArray()
    const solves = await db.solves.where('ownerId').equals(guestOwnerId).toArray()
    const settings = await db.settings.get(guestOwnerId)
    const widgets = await db.widgetLayouts.get(guestOwnerId)

    const adoptedSessions: CubeSession[] = sessions.map((session) => ({
      ...session,
      ownerId: accountOwnerId,
      version: 0,
    }))
    const adoptedSolves: Solve[] = solves.map((solve) => ({
      ...solve,
      ownerId: accountOwnerId,
      version: 0,
      timingDevice: normalizeTimingDevice(solve.timingDevice),
    }))
    await db.sessions.bulkPut(adoptedSessions)
    await db.solves.bulkPut(adoptedSolves)
    // One batch: enqueuing row by row scans the growing outbox each time, which is quadratic.
    await enqueueMutationsBatch([
      ...adoptedSessions
        .filter((session) => !session.deletedAt)
        .map((session) => ({
          ownerId: accountOwnerId,
          entity: 'session' as const,
          entityId: session.id,
          operation: 'upsert' as const,
          baseVersion: 0,
          data: toSessionInput(session),
        })),
      ...adoptedSolves
        .filter((solve) => !solve.deletedAt)
        .map((solve) => ({
          ownerId: accountOwnerId,
          entity: 'solve' as const,
          entityId: solve.id,
          operation: 'upsert' as const,
          baseVersion: 0,
          data: toSolveInput(solve),
        })),
    ])

    const existingSettings = await db.settings.get(accountOwnerId)
    if (settings && !existingSettings) {
      await db.settings.put({ ...settings, ownerId: accountOwnerId })
    } else if (!existingSettings) {
      await getOrCreateSettings(accountOwnerId)
    }
    await db.settings.delete(guestOwnerId)
    const existingWidgets = await db.widgetLayouts.get(accountOwnerId)
    if (widgets && !existingWidgets) {
      await db.widgetLayouts.put({ ...widgets, ownerId: accountOwnerId })
    }
    await db.widgetLayouts.delete(guestOwnerId)

    return { sessions: sessions.length, solves: solves.length }
  })
}
