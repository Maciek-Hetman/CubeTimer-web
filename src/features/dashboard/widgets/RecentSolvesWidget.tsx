import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useSolves } from '../../../contexts/SolvesContext'
import { effectiveTimeMs } from '../../../domain/models'
import { formatSolveTime } from '../../../domain/stats/formatTime'
import { Button } from '../../../ui/Button'
import { Dialog } from '../../../ui/Dialog'
import { EmptyState } from '../../../ui/EmptyState'

export function RecentSolvesWidget() {
  const { recentSolves, solveStats, updateSolvePenalty, deleteSolve } = useSolves()
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const recent = recentSolves.slice(0, 10)

  const recentTimes = recent.map((solve) => effectiveTimeMs(solve) ?? Infinity)
  const minTime = recent.length > 1 ? Math.min(...recentTimes) : Infinity
  const maxTime = recent.length > 1 ? Math.max(...recentTimes) : -1

  if (recent.length === 0) {
    return (
      <EmptyState
        title="No solves yet"
        action={
          <Link className="btn primary" to="/">
            Open timer
          </Link>
        }
      />
    )
  }
  return (
    <>
      <ul className="recent-solves">
        {recent.map((solve, index) => {
          const time = effectiveTimeMs(solve) ?? Infinity
          const isBest = time === minTime && time !== Infinity && minTime !== maxTime
          const isWorst = time === maxTime && minTime !== maxTime

          return (
            <li key={solve.id} className="recent-solve-row">
              <span className="recent-solve-number">#{solveStats.count - index}</span>
              <span className={`recent-solve-time ${isBest ? 'best' : ''} ${isWorst ? 'worst' : ''}`.trim()}>
                {formatSolveTime(solve)}
              </span>
              <span className="solve-controls">
                <Button
                  type="button"
                  variant="ghost"
                  className={solve.penalty === 'plus_two' ? 'active' : ''}
                  aria-pressed={solve.penalty === 'plus_two'}
                  aria-label={`Toggle +2 for solve ${solveStats.count - index}`}
                  onClick={() =>
                    void updateSolvePenalty(solve.id, solve.penalty === 'plus_two' ? 'none' : 'plus_two')
                  }
                >
                  +2
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className={solve.penalty === 'dnf' ? 'active' : ''}
                  aria-pressed={solve.penalty === 'dnf'}
                  aria-label={`Toggle DNF for solve ${solveStats.count - index}`}
                  onClick={() =>
                    void updateSolvePenalty(solve.id, solve.penalty === 'dnf' ? 'none' : 'dnf')
                  }
                >
                  DNF
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="delete"
                  aria-label={`Delete solve ${solveStats.count - index}`}
                  onClick={() => setPendingDelete(solve.id)}
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </Button>
              </span>
            </li>
          )
      })}
      </ul>
      {pendingDelete ? (
        <Dialog
          title="Delete solve"
          onClose={() => setPendingDelete(null)}
          footer={
            <div className="row wrap">
              <Button type="button" onClick={() => setPendingDelete(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={() => {
                  void deleteSolve(pendingDelete)
                  setPendingDelete(null)
                }}
              >
                Delete
              </Button>
            </div>
          }
        >
          <p>Delete this solve? This cannot be undone.</p>
        </Dialog>
      ) : null}
    </>
  )
}
