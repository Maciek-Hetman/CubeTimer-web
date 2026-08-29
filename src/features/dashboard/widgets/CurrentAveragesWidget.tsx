import { useApp } from '../../../app/AppProviders'
import { formatAverage } from '../../../domain/stats/formatTime'
import { EmptyState } from '../../../ui/EmptyState'
import { StatGrid } from '../../../ui/StatGrid'
import { Link } from 'react-router-dom'

export function CurrentAveragesWidget() {
  const { solveStats } = useApp()

  if (solveStats.count === 0) {
    return (
      <EmptyState
        title="No stats yet"
        description="Start solving to build your stats."
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
          ['Ao5', formatAverage(solveStats.ao5)],
          ['Ao12', formatAverage(solveStats.ao12)],
        ]}
      />
    </div>
  )
}