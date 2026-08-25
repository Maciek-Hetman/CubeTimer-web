import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../../app/AppProviders'
import { eventLabel } from '../../domain/models'
import { formatSolveTime } from '../../domain/stats/formatTime'
import { Button } from '../../ui/Button'
import { Dialog } from '../../ui/Dialog'
import { EmptyState } from '../../ui/EmptyState'
import { PageHeader } from '../../ui/PageHeader'
import { Panel } from '../../ui/Panel'

export function HistoryPage() {
  const { solves, sessions, settings, currentSession, updateSolvePenalty, deleteSolve } = useApp()
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)

  const sessionById = useMemo(() => new Map(sessions.map((session) => [session.id, session])), [sessions])

  return (
    <div className="stack narrow-page">
      <PageHeader
        title="History"
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
            <p className="muted">
              Showing last {Math.min(200, solves.length)} of {solves.length}
            </p>
            <div>
              {solves.slice(0, 200).map((solve) => {
                const sessionName = solve.sessionId ? sessionById.get(solve.sessionId)?.name : null
                return (
                  <div key={solve.id} className="history-row">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', minWidth: 0 }}>
                        <strong className="chip" style={{ margin: 0 }}>{formatSolveTime(solve)}</strong>
                        <span className="muted" style={{ fontSize: '0.85em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {new Date(solve.solvedAt).toLocaleString()}
                          {sessionName ? ` · ${sessionName}` : ''}
                        </span>
                      </div>
                      <div className="solve-controls">
                        <Button
                          type="button"
                          className={solve.penalty === 'plus_two' ? 'active' : ''}
                          onClick={() => void updateSolvePenalty(solve.id, solve.penalty === 'plus_two' ? 'none' : 'plus_two')}
                        >
                          +2
                        </Button>
                        <Button
                          type="button"
                          className={solve.penalty === 'dnf' ? 'active' : ''}
                          onClick={() => void updateSolvePenalty(solve.id, solve.penalty === 'dnf' ? 'none' : 'dnf')}
                        >
                          DNF
                        </Button>
                        <Button
                          type="button"
                          className="delete"
                          onClick={() => setPendingDelete(solve.id)}
                          title="Delete solve"
                        >
                          ×
                        </Button>
                      </div>
                    </div>
                    {solve.scramble ? (
                      <div className="history-meta muted" style={{ fontSize: '0.8em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {solve.scramble}
                      </div>
                    ) : null}
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
