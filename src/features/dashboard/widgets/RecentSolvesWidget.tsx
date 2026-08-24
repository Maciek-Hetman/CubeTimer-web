import { Link } from 'react-router-dom'
import { useApp } from '../../../app/AppProviders'
import { formatSolveTime } from '../../../domain/stats/formatTime'
import { EmptyState } from '../../../ui/EmptyState'

export function RecentSolvesWidget() {
  const { solves } = useApp()
  const recent = solves.slice(0, 10)
  if (recent.length === 0) {
    return (
      <EmptyState
        title="No solves yet"
        description="Finish a solve on the timer to fill this list."
        action={
          <Link className="btn primary" to="/">
            Open timer
          </Link>
        }
      />
    )
  }
  return (
    <ol className="stack" style={{ margin: 0, paddingLeft: 18, gap: 6 }}>
      {recent.map((solve) => (
        <li key={solve.id} style={{ fontFamily: 'var(--mono)' }}>
          {formatSolveTime(solve)}
        </li>
      ))}
    </ol>
  )
}
