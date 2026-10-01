import { useId } from 'react'
import type { SolveStats } from '../../data/repositories/solveStats'
import type { CubeSession } from '../../domain/models'
import { formatAverage, formatDuration, formatTotalTime } from '../../domain/stats/formatTime'
import { Panel } from '../../ui/Panel'

/** A stat that needs `needed` solves: a dash until there are enough, then the time (or DNF). */
function formatStat(value: number | null, count: number, needed = 1): string {
  return count < needed ? '—' : formatAverage(value)
}

export function CurrentSession({
  session,
  stats,
  previousSession,
  previousStats,
}: {
  /** Undefined while the event's sessions load. */
  session: CubeSession | null | undefined
  stats: SolveStats | null | undefined
  previousSession: CubeSession | null
  previousStats: SolveStats | null | undefined
}) {
  const headingId = useId()
  const compared = previousSession && previousStats && previousStats.count > 0 ? previousStats : null

  let body
  if (session === null) {
    body = <p className="muted stats-session-empty">No active session. Your next solve starts one.</p>
  } else if (!session || !stats) {
    body = null
  } else if (stats.count === 0) {
    body = <p className="muted stats-session-empty">No solves in this session yet.</p>
  } else {
    const rows = [
      { label: 'Ao5', value: formatStat(stats.ao5, stats.count, 5), delta: difference(stats.ao5, compared?.ao5) },
      { label: 'Ao12', value: formatStat(stats.ao12, stats.count, 12), delta: difference(stats.ao12, compared?.ao12) },
      { label: 'Mean', value: formatStat(stats.mean, stats.count), delta: difference(stats.mean, compared?.mean) },
      { label: 'Best', value: formatStat(stats.best, stats.count), delta: difference(stats.best, compared?.best) },
    ]
    body = (
      <>
        <p className="stats-session-meta">
          {stats.count.toLocaleString()} {stats.count === 1 ? 'solve' : 'solves'} · {formatTotalTime(stats.totalTime)}
        </p>
        <dl className="stats-session-list">
          {rows.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd className="stats-session-value">{row.value}</dd>
              {row.delta === null ? null : (
                <dd>
                  <Delta value={row.delta} />
                </dd>
              )}
            </div>
          ))}
        </dl>
        {compared && previousSession ? (
          <p className="muted stats-session-note">Compared with {previousSession.name}</p>
        ) : null}
      </>
    )
  }

  return (
    <Panel role="region" aria-labelledby={headingId} className="stats-session">
      <div className="stats-session-header">
        <h2 id={headingId}>Current session</h2>
        {session ? <p className="muted">{session.name}</p> : null}
      </div>
      {body}
    </Panel>
  )
}

function difference(current: number | null, previous: number | null | undefined): number | null {
  return current === null || previous === null || previous === undefined ? null : current - previous
}

/** Change against the previous session. Lower times are better. */
function Delta({ value }: { value: number }) {
  const amount = formatDuration(Math.abs(value))
  if (amount === formatDuration(0)) {
    return (
      <span className="stats-delta same">
        <span aria-hidden="true">±{amount}</span>
        <span className="sr-only">Same as the previous session</span>
      </span>
    )
  }
  const faster = value < 0
  return (
    <span className={`stats-delta ${faster ? 'better' : 'worse'}`}>
      <span aria-hidden="true">
        {faster ? '−' : '+'}
        {amount}
      </span>
      <span className="sr-only">
        {amount} {faster ? 'faster' : 'slower'} than the previous session
      </span>
    </span>
  )
}
