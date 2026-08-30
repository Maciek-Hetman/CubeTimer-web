import Dexie, { type Table } from 'dexie'
import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type CubeSession,
  type MutationRecord,
  type Solve,
} from '../domain/models'

interface MetaRecord {
  key: string
  value: unknown
}

interface WidgetLayoutRecord {
  ownerId: string
  layout: unknown
  widgets: string[]
}

export interface ConflictRecord {
  id: string
  ownerId: string
  entity: 'session' | 'solve'
  entityId: string
  message: string
  current: CubeSession | Solve
  local: CubeSession | Solve
  createdAt: string
}

export interface RejectedRecord {
  id: string
  ownerId: string
  entity: 'session' | 'solve'
  entityId: string
  operation: 'upsert' | 'delete'
  code?: string
  message?: string
  data?: unknown
  createdAt: string
}

class CubeTimerDB extends Dexie {
  solves!: Table<Solve, string>
  sessions!: Table<CubeSession, string>
  outbox!: Table<MutationRecord, string>
  settings!: Table<AppSettings, string>
  meta!: Table<MetaRecord, string>
  widgetLayouts!: Table<WidgetLayoutRecord, string>
  conflicts!: Table<ConflictRecord, string>
  rejections!: Table<RejectedRecord, string>

  constructor() {
    super('cubetimer')
    this.version(1).stores({
      solves: 'id, ownerId, sessionId, event, solvedAt, [ownerId+event], [ownerId+sessionId]',
      sessions: 'id, ownerId, event, kind, startedAt, [ownerId+event]',
      outbox: 'id, ownerId, entity, entityId, createdAt',
      settings: 'ownerId',
      meta: 'key',
      widgetLayouts: 'ownerId',
      conflicts: 'id, ownerId, entityId',
    })
    this.version(2).stores({
      solves:
        'id, ownerId, sessionId, event, solvedAt, [ownerId+event], [ownerId+sessionId], [ownerId+event+solvedAt], [ownerId+sessionId+solvedAt]',
      sessions: 'id, ownerId, event, kind, startedAt, [ownerId+event]',
      outbox: 'id, ownerId, entity, entityId, createdAt',
      settings: 'ownerId',
      meta: 'key',
      widgetLayouts: 'ownerId',
      conflicts: 'id, ownerId, entityId',
    })
    this.version(3).stores({
      solves:
        'id, ownerId, sessionId, event, solvedAt, [ownerId+event], [ownerId+sessionId], [ownerId+event+solvedAt], [ownerId+sessionId+solvedAt]',
      sessions: 'id, ownerId, event, kind, startedAt, [ownerId+event]',
      outbox: 'id, ownerId, entity, entityId, createdAt',
      settings: 'ownerId',
      meta: 'key',
      widgetLayouts: 'ownerId',
      conflicts: 'id, ownerId, entityId',
      rejections: 'id, ownerId, entityId, createdAt',
    })
  }
}

export const db = new CubeTimerDB()

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const record = await db.meta.get(key)
  if (!record) {
    return fallback
  }
  return record.value as T
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value })
}

export async function getOrCreateSettings(ownerId: string): Promise<AppSettings> {
  const existing = await db.settings.get(ownerId)
  if (existing) {
    return {
      ...DEFAULT_SETTINGS,
      ...existing,
      ownerId,
      currentSessionIds: existing.currentSessionIds ?? {},
    }
  }
  const settings: AppSettings = { ownerId, ...DEFAULT_SETTINGS }
  await db.settings.put(settings)
  return settings
}
