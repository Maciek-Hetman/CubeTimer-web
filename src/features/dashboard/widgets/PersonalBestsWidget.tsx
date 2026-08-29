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
        ['Single', <span key="single" style={{ color: 'var(--accent)' }}>{formatAverage(solveStats.best)}</span>],
        ['Ao5', <span key="ao5" style={{ color: 'var(--accent)' }}>{formatAverage(solveStats.bestAo5)}</span>],
        ['Ao12', <span key="ao12" style={{ color: 'var(--accent)' }}>{formatAverage(solveStats.bestAo12)}</span>],
      ]}
    />
  )
}