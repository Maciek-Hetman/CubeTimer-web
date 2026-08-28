export const EVENTS = ['2x2', '3x3', '4x4', '5x5', 'megaminx', 'pyraminx'] as const
export type CubeEvent = (typeof EVENTS)[number]

export const PENALTIES = ['none', 'plus_two', 'dnf'] as const
export type Penalty = (typeof PENALTIES)[number]

export const SESSION_KINDS = ['manual', 'automatic'] as const
export type SessionKind = (typeof SESSION_KINDS)[number]

export type SessionMode = SessionKind

export const TIMER_DISPLAY_MODES = ['show', 'hide_decimals', 'hide'] as const
export type TimerDisplayMode = (typeof TIMER_DISPLAY_MODES)[number]

export const TIMER_FONTS = ['jetbrains', 'fira', 'digital', 'dseg7', 'inter', 'roboto', 'open-sans', 'system'] as const
export type TimerFont = (typeof TIMER_FONTS)[number]

export const TIMER_SIZES = ['small', 'medium', 'large', 'xlarge'] as const
export type TimerSize = (typeof TIMER_SIZES)[number]

export const WIDGET_SCALE_MIN = 80
export const WIDGET_SCALE_MAX = 120
export const WIDGET_SCALE_STEP = 5

export const WIDGET_SCALE_PRESETS = [
  { id: 'compact', label: 'Compact', value: 85 },
  { id: 'normal', label: 'Normal', value: 100 },
  { id: 'large', label: 'Large', value: 115 },
] as const
export type WidgetScalePreset = (typeof WIDGET_SCALE_PRESETS)[number]['id']

export interface CubeSession {
  id: string
  ownerId: string
  name: string
  event: CubeEvent
  kind: SessionKind
  startedAt: string
  endedAt: string | null
  archived: boolean
  version: number
  updatedAt: string
  deletedAt: string | null
}

export interface Solve {
  id: string
  ownerId: string
  sessionId: string | null
  durationMs: number
  penalty: Penalty
  solvedAt: string
  scramble: string
  event: CubeEvent
  version: number
  updatedAt: string
  deletedAt: string | null
}

export interface MutationRecord {
  id: string
  ownerId: string
  entity: 'session' | 'solve'
  entityId: string
  operation: 'upsert' | 'delete'
  baseVersion: number
  data?: SessionInput | SolveInput
  createdAt: string
}

export interface SessionInput {
  id: string
  name: string
  event: CubeEvent
  kind: SessionKind
  started_at: string
  ended_at: string | null
  archived: boolean
}

export interface SolveInput {
  id: string
  session_id: string | null
  duration_ms: number
  penalty: Penalty
  solved_at: string
  scramble: string
  event: CubeEvent
}

export interface SavedTheme {
  id: string
  name: string
  theme: 'light' | 'dark'
  accentColor: string
  backgroundPreset: string
}

export interface AppSettings {
  ownerId: string
  event: CubeEvent
  sessionMode: SessionMode
  inactivityGapMinutes: number
  timerStartDelayMs: number
  timerDisplayMode: TimerDisplayMode
  hideScrambleDuringSolve: boolean
  hideWidgetsDuringSolve: boolean
  enableWidgets: boolean
  theme: 'system' | 'light' | 'dark'
  accentColor: string
  uiTransparency: number
  backgroundType: 'theme' | 'preset' | 'custom'
  backgroundPreset: string
  backgroundImageSizing: 'fill' | 'stretch'
  currentSessionIds: Partial<Record<CubeEvent, string>>
  timerFont: TimerFont
  timerSize: TimerSize
  timerColor: string
  widgetScale: number
  customThemes: SavedTheme[]
}

export const DEFAULT_SETTINGS: Omit<AppSettings, 'ownerId'> = {
  event: '3x3',
  sessionMode: 'automatic',
  inactivityGapMinutes: 60,
  timerStartDelayMs: 500,
  timerDisplayMode: 'show',
  hideScrambleDuringSolve: false,
  hideWidgetsDuringSolve: false,
  enableWidgets: true,
  theme: 'system',
  accentColor: 'blue',
  uiTransparency: 100,
  backgroundType: 'theme',
  backgroundPreset: '',
  backgroundImageSizing: 'fill',
  currentSessionIds: {},
  timerFont: 'jetbrains',
  timerSize: 'medium',
  timerColor: '',
  widgetScale: 100,
  customThemes: [],
}

export function createId(): string {
  return crypto.randomUUID()
}

export function nowIso(date = new Date()): string {
  return date.toISOString()
}

export function effectiveTimeMs(solve: Pick<Solve, 'durationMs' | 'penalty'>): number | null {
  if (solve.penalty === 'dnf') {
    return null
  }
  return solve.durationMs + (solve.penalty === 'plus_two' ? 2000 : 0)
}

export function eventLabel(event: CubeEvent): string {
  switch (event) {
    case 'megaminx':
      return 'Megaminx'
    case 'pyraminx':
      return 'Pyraminx'
    default:
      return event
  }
}
