import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { useApp } from '../../../app/AppProviders'
import { computeSolveStats } from '../../../data/repositories/solveStats'
import { formatAverage } from '../../../domain/stats/formatTime'
import { EmptyState } from '../../../ui/EmptyState'
import { StatGrid } from '../../../ui/StatGrid'

export function SessionStatsWidget() {
  const { ownerId, currentSession, settings } = useApp()
  const sessionStats = useLiveQuery(
    async () =>
      currentSession ? computeSolveStats(ownerId, settings.event, currentSession.id) : null,
    [ownerId, settings.event, currentSession?.id],
  )

  if (!currentSession) {
    return (
      <EmptyState
        title="No session"
        action={
          <Link className="btn primary" to="/">
            Open timer
          </Link>
        }
      />
    )
  }

  if (!sessionStats || sessionStats.count === 0) {
    return (
      <EmptyState
        title={currentSession.name}
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
          ['Solves', String(sessionStats.count)],
          ['Best', formatAverage(sessionStats.best)],
          ['Mean', formatAverage(sessionStats.mean)],
          ['Ao5', formatAverage(sessionStats.ao5)],
        ]}
      />
    </div>
  )
}