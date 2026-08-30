export const WIDGET_TYPES = [
  'recentTimes',
  'recentAo5',
  'averages',
  'currentAverages',
  'sessionStats',
  'recentSolves',
  'personalBests',
  'allTimeStats',
  'scramblePreview',
] as const

export type WidgetType = (typeof WIDGET_TYPES)[number]

export interface WidgetInstance {
  i: string
  type: WidgetType
  side: 'left' | 'right'
}

export const WIDGET_LABELS: Record<WidgetType, string> = {
  recentTimes: 'Recent times',
  recentAo5: 'Recent Ao5s',
  averages: 'Averages',
  currentAverages: 'Current Ao5/Ao12',
  sessionStats: 'Session stats',
  recentSolves: 'Recent solves',
  personalBests: 'Personal bests',
  allTimeStats: 'All time stats',
  scramblePreview: 'Scramble preview',
}

export const DEFAULT_WIDGETS: WidgetInstance[] = [
  { i: 'recentTimes', type: 'recentTimes', side: 'left' },
  { i: 'averages', type: 'averages', side: 'left' },
  { i: 'sessionStats', type: 'sessionStats', side: 'right' },
  { i: 'recentSolves', type: 'recentSolves', side: 'right' },
  { i: 'scramblePreview', type: 'scramblePreview', side: 'left' },
]
