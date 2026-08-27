import { useApp } from '../../../app/AppProviders'
import { meanOfSolves, standardDeviation, totalTime } from '../../../domain/stats/averages'
import { formatAverage, formatDuration, formatTotalTime } from '../../../domain/stats/formatTime'
import { EmptyState } from '../../../ui/EmptyState'
import { StatGrid } from '../../../ui/StatGrid'
import { Link } from 'react-router-dom'

export function AllTimeStatsWidget() {
  const { solves } = useApp()

  if (solves.length === 0) {
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

  const stdDev = standardDeviation(solves)

  return (
    <div className="stack">
      <StatGrid
        size="large"
        columns={2}
        items={[
          ['Solves', String(solves.length)],
          ['Mean', formatAverage(meanOfSolves(solves))],
          ['Total time', formatTotalTime(totalTime(solves))],
          ['Std dev', stdDev === null ? 'N/A' : formatDuration(stdDev)],
        ]}
      />
    </div>
  )
}
