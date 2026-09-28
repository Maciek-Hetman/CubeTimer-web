export const EVENTS = ['2x2', '3x3', '4x4', '5x5', 'megaminx', 'pyraminx'] as const
export type CubeEvent = (typeof EVENTS)[number]

const PENALTIES = ['none', 'plus_two', 'dnf'] as const
export type Penalty = (typeof PENALTIES)[number]

export const TIMING_DEVICES = ['keyboard', 'external_timer', 'smart_cube'] as const
export type TimingDevice = (typeof TIMING_DEVICES)[number]

/** Timing devices the user can pick for the timer screen. */
export type TimerInputDevice = Extract<TimingDevice, 'keyboard' | 'external_timer'>

/** How an `external_timer` is attached: over Bluetooth, or by cable into an audio input. */
export type ExternalTimerConnection = 'bluetooth' | 'wired'

/** Signal format of a wired timer. Nearly every brand speaks the Stackmat protocol; MoYu timers don't. */
export type WiredTimerProtocol = 'stackmat' | 'moyu'

/** Which inputs start and stop the keyboard timer. */
export type TimerControls = 'space' | 'keys' | 'keys_and_pointer'

export function normalizeTimingDevice(value: unknown): TimingDevice {
  if (value === 'keyboard' || value === 'external_timer' || value === 'smart_cube') {
    return value
  }
  return 'keyboard'
}

const SESSION_KINDS = ['manual', 'automatic'] as const
type SessionKind = (typeof SESSION_KINDS)[number]

const TIMER_DISPLAY_MODES = ['show', 'hide_decimals', 'hide'] as const
export type TimerDisplayMode = (typeof TIMER_DISPLAY_MODES)[number]

const TIMER_FONTS = ['jetbrains', 'fira', 'digital', 'dseg7', 'inter', 'roboto', 'open-sans', 'system'] as const
export type TimerFont = (typeof TIMER_FONTS)[number]

const TIMER_SIZES = ['small', 'medium', 'large', 'xlarge'] as const
export type TimerSize = (typeof TIMER_SIZES)[number]

export const WIDGET_SCALE_MIN = 80
export const WIDGET_SCALE_MAX = 120
export const WIDGET_SCALE_STEP = 5

export const WIDGET_SCALE_PRESETS = [
  { id: 'compact', label: 'Compact', value: 85 },
  { id: 'normal', label: 'Normal', value: 100 },
  { id: 'large', label: 'Large', value: 115 },
] as const

export const STATS_CHART_SCALES = ['all', '1000', '500', '250', '100'] as const
export type StatsChartScale = (typeof STATS_CHART_SCALES)[number]

export const STATS_CHART_SCALE_LABELS: Record<StatsChartScale, string> = {
  all: 'All',
  '1000': 'Last 1000',
  '500': 'Last 500',
  '250': 'Last 250',
  '100': 'Last 100',
}

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
  timingDevice: TimingDevice
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
  /**
   * Newest server copy of the entity that arrived while this mutation was queued. It isn't
   * applied over the local edit, but it's the server side if the mutation comes back as a conflict.
   */
  remote?: RemoteEntityState
}

/** An entity as the server last reported it, in API field names. */
export interface RemoteEntityState {
  version: number
  data: Record<string, unknown>
  deleted: boolean
  changedAt?: string
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
  timing_device?: TimingDevice
}

export interface AppSettings {
  ownerId: string
  event: CubeEvent
  inactivityGapMinutes: number
  timerStartDelayMs: number
  timerDisplayMode: TimerDisplayMode
  showTimerHints: boolean
  hideScrambleDuringSolve: boolean
  hideWidgetsDuringSolve: boolean
  enableWidgets: boolean
  theme: 'system' | 'light' | 'dark'
  accentColor: string
  coloredBackground: boolean
  currentSessionIds: Partial<Record<CubeEvent, string>>
  timerFont: TimerFont
  timerSize: TimerSize
  widgetScale: number
  statsChartScale: StatsChartScale
  timingDevice: TimerInputDevice
  externalTimer: ExternalTimerConnection
  wiredTimerProtocol: WiredTimerProtocol
  /** Audio input the wired timer is plugged into; empty for the system default. */
  wiredTimerInputId: string
  timerControls: TimerControls
}

export const DEFAULT_SETTINGS: Omit<AppSettings, 'ownerId'> = {
  event: '3x3',
  inactivityGapMinutes: 60,
  timerStartDelayMs: 500,
  timerDisplayMode: 'show',
  showTimerHints: true,
  hideScrambleDuringSolve: false,
  hideWidgetsDuringSolve: false,
  enableWidgets: true,
  theme: 'system',
  accentColor: 'blue',
  coloredBackground: false,
  currentSessionIds: {},
  timerFont: 'jetbrains',
  timerSize: 'medium',
  widgetScale: 100,
  statsChartScale: 'all',
  timingDevice: 'keyboard',
  externalTimer: 'bluetooth',
  wiredTimerProtocol: 'stackmat',
  wiredTimerInputId: '',
  timerControls: 'keys_and_pointer',
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

export type { AuthSession } from '../api/types'
export type { SolveStats } from '../data/repositories/solveStats'
export type { SyncStatus } from '../sync/syncEngine'

