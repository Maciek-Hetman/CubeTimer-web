import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../../app/AppProviders'
import { eventLabel, type CubeEvent, type Solve } from '../../domain/models'
import { formatSolveTime } from '../../domain/stats/formatTime'
import { Button } from '../../ui/Button'
import { Dialog } from '../../ui/Dialog'
import { EmptyState } from '../../ui/EmptyState'
import { PageHeader } from '../../ui/PageHeader'
import { Panel } from '../../ui/Panel'
import { EyeIcon, ChevronDownIcon } from '../../ui/NavIcons'
import 'cubing/twisty'

const PUZZLE_IDS: Record<CubeEvent, string> = {
  '2x2': '2x2x2',
  '3x3': '3x3x3',
  '4x4': '4x4x4',
  '5x5': '5x5x5',
  megaminx: 'megaminx',
  pyraminx: 'pyraminx',
}

const PAGE_SIZE = 20

export function HistoryPage() {
  const { solves, sessions, settings, currentSession, updateSolvePenalty, deleteSolve } = useApp()
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [previewSolve, setPreviewSolve] = useState<Solve | null>(null)
  
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(1)

  const toggleSession = (sessionId: string) => {
    setExpandedSessions(prev => {
      const next = new Set(prev)
      if (next.has(sessionId)) {
        next.delete(sessionId)
      } else {
        next.add(sessionId)
      }
      return next
    })
  }

  const listItems = useMemo(() => {
    // Sort sessions by most recent startedAt descending
    const sortedSessions = [...sessions].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    
    const items = sortedSessions.map(session => {
      const sSolves = solves
        .filter(s => s.sessionId === session.id)
        .sort((a, b) => new Date(b.solvedAt).getTime() - new Date(a.solvedAt).getTime())
      return {
        id: session.id,
        title: session.name || 'Unnamed Session',
        subtitle: `${eventLabel(session.event)} · ${new Date(session.startedAt).toLocaleDateString()}`,
        solves: sSolves
      }
    })

    const orphans = solves
      .filter(s => !s.sessionId)
      .sort((a, b) => new Date(b.solvedAt).getTime() - new Date(a.solvedAt).getTime())
      
    if (orphans.length > 0) {
      items.push({
        id: 'orphan',
        title: 'Uncategorized Solves',
        subtitle: 'No session',
        solves: orphans
      })
    }
    return items
  }, [sessions, solves])

  const totalPages = Math.max(1, Math.ceil(listItems.length / PAGE_SIZE))
  const currentItems = listItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

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
            {currentItems.map(item => {
              const isExpanded = expandedSessions.has(item.id)
              return (
                <div key={item.id} className="session-group" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '16px', marginBottom: '16px' }}>
                  <div 
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '8px 0' }}
                    onClick={() => toggleSession(item.id)}
                  >
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1.1em' }}>{item.title}</h3>
                      <div className="muted" style={{ fontSize: '0.9em' }}>{item.subtitle} · {item.solves.length} solves</div>
                    </div>
                    <Button type="button" variant="ghost" className="icon">
                      <ChevronDownIcon style={{ transform: isExpanded ? 'rotate(180deg)' : 'none' }} />
                    </Button>
                  </div>
                  
                  {isExpanded && (
                    <div className="stack" style={{ marginTop: '16px', paddingLeft: '16px', borderLeft: '2px solid var(--border)' }}>
                      {item.solves.length === 0 && <p className="muted">No solves in this session.</p>}
                      {item.solves.map(solve => (
                        <div key={solve.id} className="history-row">
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', minWidth: 0 }}>
                              <strong className="chip" style={{ margin: 0 }}>{formatSolveTime(solve)}</strong>
                              <span className="muted" style={{ fontSize: '0.85em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {new Date(solve.solvedAt).toLocaleTimeString()}
                              </span>
                            </div>
                            <div className="solve-controls">
                              <Button
                                type="button"
                                aria-label="Preview solve"
                                onClick={() => setPreviewSolve(solve)}
                                title="Preview solve"
                              >
                                <EyeIcon />
                              </Button>
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
                                aria-label="Delete solve"
                                onClick={() => setPendingDelete(solve.id)}
                                title="Delete solve"
                              >
                                ×
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}

            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
                <Button 
                  type="button" 
                  disabled={page === 1} 
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <span className="muted">Page {page} of {totalPages}</span>
                <Button 
                  type="button" 
                  disabled={page === totalPages} 
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                >
                  Next
                </Button>
              </div>
            )}
          </Panel>
          <p className="muted">{listItems.length} sessions stored</p>
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

      {previewSolve ? (
        <Dialog
          title="Solve Preview"
          onClose={() => setPreviewSolve(null)}
          footer={
            <div className="row wrap">
              <Button type="button" onClick={() => setPreviewSolve(null)}>
                Close
              </Button>
            </div>
          }
        >
          <div className="stack" style={{ alignItems: 'center', gap: '16px' }}>
            <div style={{ fontSize: '2em', fontWeight: 'bold' }}>
              {formatSolveTime(previewSolve)}
            </div>
            <div className="muted">
              {new Date(previewSolve.solvedAt).toLocaleString()}
            </div>
            
            {previewSolve.scramble && (
              <>
                <div style={{ width: '250px', height: '250px', margin: '0 auto', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                  <twisty-player
                    puzzle={PUZZLE_IDS[previewSolve.event] || '3x3x3'}
                    experimental-setup-alg={previewSolve.scramble}
                    visualization="2D"
                    control-panel="none"
                    background="none"
                    viewer-link="none"
                    style={{ width: '100%', height: '100%' }}
                  ></twisty-player>
                </div>
                <div className="muted" style={{ textAlign: 'center', fontSize: '0.9em', wordBreak: 'break-word', userSelect: 'text' }}>
                  {previewSolve.scramble}
                </div>
              </>
            )}
          </div>
        </Dialog>
      ) : null}
    </div>
  )
}
