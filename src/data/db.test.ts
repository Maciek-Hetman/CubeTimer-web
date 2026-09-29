import Dexie from 'dexie'
import { describe, expect, it } from 'vitest'

describe('db migrations', () => {
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
    const rows = await db.settings.toArray()
    const byOwner = Object.fromEntries(rows.map((row) => [row.ownerId, row]))

    expect(byOwner.scramble).toEqual({ ownerId: 'scramble', focusMode: true })
    expect(byOwner.widgets).toEqual({ ownerId: 'widgets', focusMode: true })
    expect(byOwner.neither).toEqual({ ownerId: 'neither', focusMode: false })
    db.close()
  })
})
