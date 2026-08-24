import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../../app/AppProviders'
import { eventLabel, type Penalty } from '../../domain/models'
import { averageOfN, bestAverageOfN, bestSingle, meanOfSolves, worstSingle } from '../../domain/stats/averages'
import { formatAverage, formatSolveTime } from '../../domain/stats/formatTime'
import { Button } from '../../ui/Button'
import { Dialog } from '../../ui/Dialog'
import { EmptyState } from '../../ui/EmptyState'
import { PageHeader } from '../../ui/PageHeader'
import { Panel } from '../../ui/Panel'
import { StatGrid } from '../../ui/StatGrid'

export function StatsPage() {
  const { solves, sessions, settings, currentSession, updateSolvePenalty, deleteSolve } = useApp()
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)

  const sessionById = useMemo(() => new Map(sessions.map((session) => [session.id, session])), [sessions])

  const sessionSolves = useMemo(
    () => (currentSession ? solves.filter((solve) => solve.sessionId === currentSession.id) : solves),
    [currentSession, solves],
  )

  const summary = useMemo(
    () => ({
      count: solves.length,
      best: bestSingle(solves),
      worst: worstSingle(solves),
      mean: meanOfSolves(solves),
      ao5: averageOfN(solves, 5),
      ao12: averageOfN(solves, 12),
      bestAo5: bestAverageOfN(solves, 5),
      bestAo12: bestAverageOfN(solves, 12),
    }),
    [solves],
  )

  const sessionSummary = useMemo(
    () => ({
      count: sessionSolves.length,
      best: bestSingle(sessionSolves),
      mean: meanOfSolves(sessionSolves),
      ao5: averageOfN(sessionSolves, 5),
    }),
    [sessionSolves],
  )

  return (
    <div className="stack">
      <PageHeader
        title="Stats"
        subtitle={`${eventLabel(settings.event)}${currentSession ? ` · ${currentSession.name}` : ''}`}
      />

      {solves.length === 0 ? (
        <EmptyState
          title="No solves yet"
          description="Time a solve on the timer to start building your history."
          action={
            <Link className="btn primary" to="/">
              Open timer
            </Link>
          }
        />
      ) : (
        <>
          <Panel className="stack">
            <h2>All-time</h2>
            <StatGrid
              items={[
                ['Solves', String(summary.count)],
                ['Best', formatAverage(summary.best)],
                ['Worst', formatAverage(summary.worst)],
                ['Mean', formatAverage(summary.mean)],
                ['Ao5', formatAverage(summary.ao5)],
                ['Ao12', formatAverage(summary.ao12)],
                ['Best Ao5', formatAverage(summary.bestAo5)],
                ['Best Ao12', formatAverage(summary.bestAo12)],
              ]}
            />
          </Panel>
          <Panel className="stack">
            <h2>Current session</h2>
            <StatGrid
              items={[
                ['Solves', String(sessionSummary.count)],
                ['Best', formatAverage(sessionSummary.best)],
                ['Mean', formatAverage(sessionSummary.mean)],
                ['Ao5', formatAverage(sessionSummary.ao5)],
              ]}
            />
          </Panel>
          <Panel className="stack">
            <h2>History</h2>
            <p className="muted">
              Showing last {Math.min(200, solves.length)} of {solves.length}
            </p>
            <div>
              {solves.slice(0, 200).map((solve) => {
                const sessionName = solve.sessionId ? sessionById.get(solve.sessionId)?.name : null
                return (
                  <div key={solve.id} className="history-row">
                    <div className="stack" style={{ gap: 4 }}>
                      <strong className="chip">{formatSolveTime(solve)}</strong>
                      <div className="history-meta muted">
                        {new Date(solve.solvedAt).toLocaleString()}
                        {sessionName ? ` · ${sessionName}` : ''}
                      </div>
                      {solve.scramble ? <div className="history-meta scramble muted">{solve.scramble}</div> : null}
                    </div>
                    <div className="row wrap">
                      <select
                        aria-label="Penalty"
                        value={solve.penalty}
                        onChange={(event) => void updateSolvePenalty(solve.id, event.target.value as Penalty)}
                      >
                        <option value="none">OK</option>
                        <option value="plus_two">+2</option>
                        <option value="dnf">DNF</option>
                      </select>
                      <Button type="button" variant="danger" onClick={() => setPendingDelete(solve.id)}>
                        Delete
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </Panel>
          <p className="muted">{sessions.length} sessions stored</p>
        </>
      )}

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
    </div>
  )
}
