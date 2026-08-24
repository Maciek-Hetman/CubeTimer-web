import type { Layout } from 'react-grid-layout'
import { AveragesWidget } from './widgets/AveragesWidget'
import { RecentSolvesWidget } from './widgets/RecentSolvesWidget'
import { RecentTimesChart } from './widgets/RecentTimesChart'
import { SessionStatsWidget } from './widgets/SessionStatsWidget'

export const WIDGET_TYPES = ['recentTimes', 'averages', 'sessionStats', 'recentSolves'] as const
export type WidgetType = (typeof WIDGET_TYPES)[number]

export interface WidgetInstance {
  i: string
  type: WidgetType
  side: 'left' | 'right'
}

export const WIDGET_LABELS: Record<WidgetType, string> = {
  recentTimes: 'Recent times',
  averages: 'Averages',
  sessionStats: 'Session stats',
  recentSolves: 'Recent solves',
}

export const DEFAULT_WIDGETS: WidgetInstance[] = [
  { i: 'recentTimes', type: 'recentTimes', side: 'left' },
  { i: 'averages', type: 'averages', side: 'left' },
  { i: 'sessionStats', type: 'sessionStats', side: 'right' },
  { i: 'recentSolves', type: 'recentSolves', side: 'right' },
]

export const DEFAULT_LAYOUTS: Record<'left' | 'right', Layout> = {
  left: [
    { i: 'recentTimes', x: 0, y: 0, w: 1, h: 5, minH: 3 },
    { i: 'averages', x: 0, y: 5, w: 1, h: 4, minH: 3 },
  ],
  right: [
    { i: 'sessionStats', x: 0, y: 0, w: 1, h: 4, minH: 3 },
    { i: 'recentSolves', x: 0, y: 4, w: 1, h: 5, minH: 3 },
  ],
}

export function renderWidget(type: WidgetType) {
  switch (type) {
    case 'recentTimes':
      return <RecentTimesChart />
    case 'averages':
      return <AveragesWidget />
    case 'sessionStats':
      return <SessionStatsWidget />
    case 'recentSolves':
      return <RecentSolvesWidget />
  }
}
