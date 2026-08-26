import { lazy, Suspense } from 'react'
import { AveragesWidget } from './widgets/AveragesWidget'
import { RecentSolvesWidget } from './widgets/RecentSolvesWidget'
import { SessionStatsWidget } from './widgets/SessionStatsWidget'

const RecentTimesChart = lazy(() =>
  import('./widgets/RecentTimesChart').then((m) => ({ default: m.RecentTimesChart })),
)

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

export function renderWidget(type: WidgetType) {
  switch (type) {
    case 'recentTimes':
      return (
        <Suspense fallback={null}>
          <RecentTimesChart />
        </Suspense>
      )
    case 'averages':
      return <AveragesWidget />
    case 'sessionStats':
      return <SessionStatsWidget />
    case 'recentSolves':
      return <RecentSolvesWidget />
  }
}
