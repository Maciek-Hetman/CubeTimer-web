import { useMemo, useState } from 'react'
import { useApp } from '../../app/AppProviders'
import { eventLabel, type Penalty } from '../../domain/models'
import { averageOfN, bestAverageOfN, bestSingle, meanOfSolves, worstSingle } from '../../domain/stats/averages'
import { formatAverage, formatSolveTime } from '../../domain/stats/formatTime'

export function StatsPage() {
  const { solves, sessions, settings, currentSession, updateSolvePenalty, deleteSolve } = useApp()
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)

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
      <header>
        <h1 style={{ margin: '8px 0' }}>Stats</h1>
        <p className="muted">
          {eventLabel(settings.event)}
          {currentSession ? ` · ${currentSession.name}` : ''}
        </p>
      </header>

      {solves.length === 0 ? (
        <div className="panel" style={{ textAlign: 'center' }}>
          No solves yet
        </div>
      ) : (
        <>
          <section className="panel">
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
          </section>
          <section className="panel">
            <h2>Current session</h2>
            <StatGrid
              items={[
                ['Solves', String(sessionSummary.count)],
                ['Best', formatAverage(sessionSummary.best)],
                ['Mean', formatAverage(sessionSummary.mean)],
                ['Ao5', formatAverage(sessionSummary.ao5)],
              ]}
            />
          </section>
          <section className="panel">
            <h2>History</h2>
            <p className="muted">Showing last {Math.min(200, solves.length)} of {solves.length}</p>
            <div className="stack">
              {solves.slice(0, 200).map((solve) => (
                <div key={solve.id} className="row wrap" style={{ justifyContent: 'space-between' }}>
                  <div>
                    <strong className="chip">{formatSolveTime(solve)}</strong>
                    <div className="muted" style={{ fontSize: '0.85rem' }}>
                      {new Date(solve.solvedAt).toLocaleString()}
                    </div>
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
                    <button type="button" className="btn danger" onClick={() => setPendingDelete(solve.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
          <p className="muted">{sessions.length} sessions stored</p>
        </>
      )}

      {pendingDelete ? (
        <div className="dialog-backdrop" onClick={() => setPendingDelete(null)}>
          <div className="dialog" onClick={(event) => event.stopPropagation()}>
            <p>Delete this solve?</p>
            <div className="row">
              <button type="button" className="btn" onClick={() => setPendingDelete(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn danger"
                onClick={() => {
                  void deleteSolve(pendingDelete)
                  setPendingDelete(null)
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function StatGrid({ items }: { items: Array<[string, string]> }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
      {items.map(([label, value]) => (
        <div key={label}>
          <div className="muted">{label}</div>
          <div style={{ fontFamily: 'var(--mono)' }}>{value}</div>
        </div>
      ))}
    </div>
  )
}
