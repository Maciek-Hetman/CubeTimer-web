import { db, getOrCreateSettings } from '../data/db'
import { enqueueMutation } from '../data/repositories/outbox'
import { toSessionInput } from '../data/repositories/sessions'
import { toSolveInput } from '../data/repositories/solves'
import type { CubeSession, Solve } from '../domain/models'

export async function adoptGuestData(guestOwnerId: string, accountOwnerId: string): Promise<{
  sessions: number
  solves: number
}> {
  const sessions = await db.sessions.where('ownerId').equals(guestOwnerId).toArray()
  const solves = await db.solves.where('ownerId').equals(guestOwnerId).toArray()
  const settings = await db.settings.get(guestOwnerId)
  const widgets = await db.widgetLayouts.get(guestOwnerId)

  await db.transaction('rw', db.sessions, db.solves, db.outbox, db.settings, db.widgetLayouts, async () => {
    for (const session of sessions) {
      const updated: CubeSession = { ...session, ownerId: accountOwnerId, version: 0 }
      await db.sessions.put(updated)
      if (!updated.deletedAt) {
        await enqueueMutation({
          ownerId: accountOwnerId,
          entity: 'session',
          entityId: updated.id,
          operation: 'upsert',
          baseVersion: 0,
          data: toSessionInput(updated),
        })
      }
    }
    for (const solve of solves) {
      const updated: Solve = { ...solve, ownerId: accountOwnerId, version: 0 }
      await db.solves.put(updated)
      if (!updated.deletedAt) {
        await enqueueMutation({
          ownerId: accountOwnerId,
          entity: 'solve',
          entityId: updated.id,
          operation: 'upsert',
          baseVersion: 0,
          data: toSolveInput(updated),
        })
      }
    }
    if (settings) {
      await db.settings.put({ ...settings, ownerId: accountOwnerId })
      await db.settings.delete(guestOwnerId)
    } else {
      await getOrCreateSettings(accountOwnerId)
    }
    if (widgets) {
      await db.widgetLayouts.put({ ...widgets, ownerId: accountOwnerId })
      await db.widgetLayouts.delete(guestOwnerId)
    }
  })

  return { sessions: sessions.length, solves: solves.length }
}
