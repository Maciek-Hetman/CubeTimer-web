import { Link } from 'react-router-dom'
import { useSolves } from '../../../contexts/SolvesContext'
import { formatAverage, formatDuration, formatTotalTime } from '../../../domain/stats/formatTime'
import { EmptyState } from '../../../ui/EmptyState'
import { StatGrid } from '../../../ui/StatGrid'

export function AllTimeStatsWidget() {
  const { solveStats } = useSolves()

  if (solveStats.count === 0) {
    return (
      <EmptyState
        title="No stats yet"
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
          ['Solves', String(solveStats.count)],
          ['Mean', formatAverage(solveStats.mean)],
          ['Total time', formatTotalTime(solveStats.totalTime)],
          ['Std dev', solveStats.stdDev === null ? 'N/A' : formatDuration(solveStats.stdDev)],
        ]}
      />
    </div>
  )
}