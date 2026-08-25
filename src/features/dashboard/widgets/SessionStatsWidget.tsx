import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../../../app/AppProviders'
import { averageOfN, bestSingle, meanOfSolves } from '../../../domain/stats/averages'
import { formatAverage } from '../../../domain/stats/formatTime'
import { EmptyState } from '../../../ui/EmptyState'
import { StatGrid } from '../../../ui/StatGrid'

export function SessionStatsWidget() {
  const { solves, currentSession } = useApp()
  const sessionSolves = useMemo(
    () => (currentSession ? solves.filter((solve) => solve.sessionId === currentSession.id) : []),
    [currentSession, solves],
  )
  if (sessionSolves.length === 0) {
    return (
      <EmptyState
        title={currentSession?.name ?? 'No session'}
        description="No times in this session yet."
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
          ['Solves', String(sessionSolves.length)],
          ['Best', formatAverage(bestSingle(sessionSolves))],
          ['Mean', formatAverage(meanOfSolves(sessionSolves))],
          ['Ao5', formatAverage(averageOfN(sessionSolves, 5))],
        ]}
      />
    </div>
  )
}
