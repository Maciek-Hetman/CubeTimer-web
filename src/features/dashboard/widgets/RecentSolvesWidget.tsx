import { useApp } from '../../../app/AppProviders'
import { formatSolveTime } from '../../../domain/stats/formatTime'

export function RecentSolvesWidget() {
  const { solves } = useApp()
  const recent = solves.slice(0, 10)
  if (recent.length === 0) {
    return <p className="muted">No solves yet</p>
  }
  return (
    <ol style={{ margin: 0, paddingLeft: 18 }}>
      {recent.map((solve) => (
        <li key={solve.id} style={{ fontFamily: 'var(--mono)' }}>
          {formatSolveTime(solve)}
        </li>
      ))}
    </ol>
  )
}
