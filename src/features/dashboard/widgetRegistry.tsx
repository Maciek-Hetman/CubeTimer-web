import { lazy, Suspense } from 'react'
import { AveragesWidget } from './widgets/AveragesWidget'
import { RecentSolvesWidget } from './widgets/RecentSolvesWidget'
import { SessionStatsWidget } from './widgets/SessionStatsWidget'
import { PersonalBestsWidget } from './widgets/PersonalBestsWidget'
import { AllTimeStatsWidget } from './widgets/AllTimeStatsWidget'
import { CurrentAveragesWidget } from './widgets/CurrentAveragesWidget'

const RecentTimesChart = lazy(() =>
  import('./widgets/RecentTimesChart').then((m) => ({ default: m.RecentTimesChart })),
)

const RecentAo5Chart = lazy(() =>
  import('./widgets/RecentAo5Chart').then((m) => ({ default: m.RecentAo5Chart })),
)

const ScramblePreviewWidget = lazy(() =>
  import('./widgets/ScramblePreviewWidget').then((m) => ({ default: m.ScramblePreviewWidget })),
)

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

export function renderWidget(type: WidgetType) {
  switch (type) {
    case 'recentTimes':
      return (
        <Suspense fallback={null}>
          <RecentTimesChart />
        </Suspense>
      )
    case 'recentAo5':
      return (
        <Suspense fallback={null}>
          <RecentAo5Chart />
        </Suspense>
      )
    case 'averages':
      return <AveragesWidget />
    case 'currentAverages':
      return <CurrentAveragesWidget />
    case 'sessionStats':
      return <SessionStatsWidget />
    case 'recentSolves':
      return <RecentSolvesWidget />
    case 'personalBests':
      return <PersonalBestsWidget />
    case 'allTimeStats':
      return <AllTimeStatsWidget />
    case 'scramblePreview':
      return (
        <Suspense fallback={null}>
          <ScramblePreviewWidget />
        </Suspense>
      )
  }
}
