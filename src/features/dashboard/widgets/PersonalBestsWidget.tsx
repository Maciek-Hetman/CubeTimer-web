import { useApp } from '../../../app/AppProviders'
import { formatAverage } from '../../../domain/stats/formatTime'
import { EmptyState } from '../../../ui/EmptyState'
import { StatGrid } from '../../../ui/StatGrid'
import { Link } from 'react-router-dom'

export function PersonalBestsWidget() {
  const { solveStats } = useApp()

  if (solveStats.count === 0) {
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
    <StatGrid
      size="large"
      columns={3}
      items={[
        ['Single', formatAverage(solveStats.best)],
        ['Ao5', formatAverage(solveStats.bestAo5)],
        ['Ao12', formatAverage(solveStats.bestAo12)],
      ]}
    />
  )
}