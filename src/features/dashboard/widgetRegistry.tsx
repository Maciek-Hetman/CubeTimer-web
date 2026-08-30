import { lazy, Suspense } from 'react'
import type { WidgetType } from './widgetTypes'
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

export function WidgetRenderer({ type }: { type: WidgetType }) {
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
