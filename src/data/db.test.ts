import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('db migrations', () => {
  let openDb: { close(): void } | undefined

  beforeEach(async () => {
    vi.resetModules()
    await Dexie.delete('cubetimer')
  })

  afterEach(async () => {
    openDb?.close()
    openDb = undefined
    vi.resetModules()
    await Dexie.delete('cubetimer')
  })

  it('folds the old hide-during-solve settings into focusMode', async () => {
    const legacy = new Dexie('cubetimer')
    legacy.version(3).stores({ settings: 'ownerId' })
    await legacy.table('settings').bulkPut([
      { ownerId: 'scramble', hideScrambleDuringSolve: true, hideWidgetsDuringSolve: false },
      { ownerId: 'widgets', hideScrambleDuringSolve: false, hideWidgetsDuringSolve: true },
      { ownerId: 'neither', hideScrambleDuringSolve: false, hideWidgetsDuringSolve: false },
    ])
    legacy.close()

    // Imported after seeding: the module opens the real database, which runs the upgrade.
    const { db } = await import('./db')
    openDb = db
    const rows = await db.settings.toArray()
    const byOwner = Object.fromEntries(rows.map((row) => [row.ownerId, row]))

    expect(byOwner.scramble).toEqual({ ownerId: 'scramble', focusMode: true })
    expect(byOwner.widgets).toEqual({ ownerId: 'widgets', focusMode: true })
    expect(byOwner.neither).toEqual({ ownerId: 'neither', focusMode: false })
  })

  it('floors sub-millisecond solve durations, including queued payloads', async () => {
    const legacy = new Dexie('cubetimer')
    legacy.version(4).stores({ solves: 'id', outbox: 'id' })
    await legacy.table('solves').bulkPut([
      { id: 'fractional', durationMs: 22333.099999999627 },
      { id: 'whole', durationMs: 11000 },
    ])
    await legacy.table('outbox').bulkPut([
      { id: 'solve-upsert', entity: 'solve', data: { id: 'fractional', duration_ms: 22333.099999999627 } },
      { id: 'solve-delete', entity: 'solve', operation: 'delete' },
      { id: 'session-upsert', entity: 'session', data: { id: 's', name: 'Session' } },
    ])
    legacy.close()

    const { db } = await import('./db')
    openDb = db

    expect((await db.solves.get('fractional'))?.durationMs).toBe(22333)
    expect((await db.solves.get('whole'))?.durationMs).toBe(11000)
    expect((await db.outbox.get('solve-upsert'))?.data).toEqual({ id: 'fractional', duration_ms: 22333 })
    expect((await db.outbox.get('solve-delete'))?.data).toBeUndefined()
    expect((await db.outbox.get('session-upsert'))?.data).toEqual({ id: 's', name: 'Session' })
  })
})
