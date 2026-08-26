import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../data/db'
import { listSolves, newSolve, putSolve } from '../data/repositories/solves'
import { listSessions, newSession, putSession } from '../data/repositories/sessions'
import { adoptGuestData } from '../sync/guestMerge'
import {
  createFreshGuestOwner,
  setCurrentOwnerId,
  getCurrentOwnerId,
  ensureGuestOwner,
} from './profile'

describe('owner scoping', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('hides account solves from a fresh guest after logout', async () => {
    await setCurrentOwnerId('user-1')
    const session = newSession({ ownerId: 'user-1', name: 'Main', event: '3x3', kind: 'manual' })
    await putSession(session, { enqueue: false, baseVersion: 0 })
    const solve = newSolve({ ownerId: 'user-1', sessionId: session.id, durationMs: 1000, penalty: 'none', scramble: 'R', event: '3x3' })
    await putSolve(solve, { enqueue: false, baseVersion: 0 })

    const guest = await createFreshGuestOwner()
    expect(await listSolves(guest, '3x3')).toHaveLength(0)
    expect(await listSessions(guest, '3x3')).toHaveLength(0)
  })

  it('adopts guest solves onto an account on login', async () => {
    const guest = await createFreshGuestOwner()
    await setCurrentOwnerId(guest)
    expect(await ensureGuestOwner()).toBe(guest)
    const session = newSession({ ownerId: guest, name: 'Guest', event: '3x3', kind: 'manual' })
    await putSession(session, { enqueue: false, baseVersion: 0 })
    const solve = newSolve({ ownerId: guest, sessionId: session.id, durationMs: 2000, penalty: 'none', scramble: 'U', event: '3x3' })
    await putSolve(solve, { enqueue: false, baseVersion: 0 })
    expect(await getCurrentOwnerId()).toBe(guest)

    await adoptGuestData(guest, 'user-2')
    expect(await listSolves('user-2', '3x3')).toHaveLength(1)
    expect(await listSolves(guest, '3x3')).toHaveLength(0)
  })

  it('replaces an account owner with a fresh guest when no session exists', async () => {
    await setCurrentOwnerId('user-1')
    const owner = await getCurrentOwnerId()
    expect(owner).toBe('user-1')
    const guest = await createFreshGuestOwner()
    expect(guest.startsWith('guest:')).toBe(true)
    expect(await getCurrentOwnerId()).toBe(guest)
  })
})
