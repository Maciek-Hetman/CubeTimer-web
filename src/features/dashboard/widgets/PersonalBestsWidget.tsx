import { Link } from 'react-router-dom'
import { useSolves } from '../../../contexts/SolvesContext'
import { formatAverage } from '../../../domain/stats/formatTime'
import { EmptyState } from '../../../ui/EmptyState'
import { StatGrid } from '../../../ui/StatGrid'

export function PersonalBestsWidget() {
  const { solveStats } = useSolves()

  if (solveStats.count === 0) {
    return (
      <EmptyState
        title="No personal bests"
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