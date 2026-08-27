import { useApp } from '../../../app/AppProviders'
import { bestAverageOfN, bestSingle } from '../../../domain/stats/averages'
import { formatAverage } from '../../../domain/stats/formatTime'
import { EmptyState } from '../../../ui/EmptyState'
import { StatGrid } from '../../../ui/StatGrid'
import { Link } from 'react-router-dom'

export function PersonalBestsWidget() {
  const { solves } = useApp()

  if (solves.length === 0) {
    return (
      <EmptyState
        title="No personal bests"
        description="Save some solves to see your records."
        action={
          <Link className="btn primary" to="/">
            Open timer
          </Link>
        }
      />
    )
  }

  return (
    <div className="stack">
      <StatGrid
        size="large"
        columns={2}
        items={[
          ['Single', formatAverage(bestSingle(solves))],
          ['Ao5', formatAverage(bestAverageOfN(solves, 5))],
          ['Ao12', formatAverage(bestAverageOfN(solves, 12))],
        ]}
      />
    </div>
  )
}
