import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useApp } from '../../app/AppProviders'
import { eventLabel, type CubeEvent, type CubeSession, type Solve } from '../../domain/models'
import { formatSolveTime } from '../../domain/stats/formatTime'
import { Button } from '../../ui/Button'
import { Dialog } from '../../ui/Dialog'
import { EmptyState } from '../../ui/EmptyState'
import { PageHeader } from '../../ui/PageHeader'
import { Panel } from '../../ui/Panel'
import { EyeIcon, ChevronDownIcon } from '../../ui/NavIcons'
import {
  countSolvesBySession,
  listOrphanSolves,
  listSolvesForSession,
} from '../../data/repositories/solves'

const PUZZLE_IDS: Record<CubeEvent, string> = {
  '2x2': '2x2x2',
  '3x3': '3x3x3',
  '4x4': '4x4x4',
  '5x5': '5x5x5',
  megaminx: 'megaminx',
  pyraminx: 'pyraminx',
}

const PAGE_SIZE = 20
const SOLVES_PER_GROUP = 200

export function HistoryPage() {
  const { solveStats, sessions, settings, currentSession, ownerId, updateSolvePenalty, deleteSolve } =
    useApp()
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [previewSolve, setPreviewSolve] = useState<Solve | null>(null)

  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(1)

  const toggleSession = (sessionId: string) => {
    setExpandedSessions((prev) => {
      const next = new Set(prev)
      if (next.has(sessionId)) {
        next.delete(sessionId)
      } else {
        next.add(sessionId)
      }
      return next
    })
  }

  const counts = useLiveQuery(
    async () =>
      ownerId
        ? countSolvesBySession(ownerId, settings.event)
        : { counts: new Map<string, number>(), orphanCount: 0 },
    [ownerId, settings.event],
  )

  const listItems = useMemo(() => {
    const items: Array<{
      id: string
      title: string
      subtitle: string
      solveCount: number
      session: CubeSession | null
    }> = [...sessions]
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
      .map((session) => ({
        id: session.id,
        title: session.name || 'Unnamed Session',
        subtitle: `${eventLabel(session.event)} · ${new Date(session.startedAt).toLocaleDateString()}`,
        solveCount: counts?.counts.get(session.id) ?? 0,
        session,
      }))
    if ((counts?.orphanCount ?? 0) > 0) {
      items.push({
        id: 'orphan',
        title: 'Uncategorized Solves',
        subtitle: 'No session',
        solveCount: counts?.orphanCount ?? 0,
        session: null,
      })
    }
    return items
  }, [sessions, counts])

  const totalPages = Math.max(1, Math.ceil(listItems.length / PAGE_SIZE))
  const currentItems = listItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const openPreview = (solve: Solve) => {
    void import('cubing/twisty').then(() => setPreviewSolve(solve))
  }

  return (
    <div className="stack narrow-page">
      <PageHeader
        title="History"
        subtitle={`${eventLabel(settings.event)}${currentSession ? ` · ${currentSession.name}` : ''}`}
      />

      {solveStats.count === 0 ? (
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
            {currentItems.map((item) => {
              const isExpanded = expandedSessions.has(item.id)
              return (
                <SessionGroup
                  key={item.id}
                  ownerId={ownerId}
                  session={item.session}
                  event={settings.event}
                  title={item.title}
                  subtitle={item.subtitle}
                  solveCount={item.solveCount}
                  expanded={isExpanded}
                  onToggle={() => toggleSession(item.id)}
                  onPreview={openPreview}
                  onDelete={setPendingDelete}
                  updateSolvePenalty={updateSolvePenalty}
                />
              )
            })}

            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
                <Button
                  type="button"
                  disabled={page === 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <span className="muted">Page {page} of {totalPages}</span>
                <Button
                  type="button"
                  disabled={page === totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
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

function SessionGroup({
  ownerId,
  session,
  event,
  title,
  subtitle,
  solveCount,
  expanded,
  onToggle,
  onPreview,
  onDelete,
  updateSolvePenalty,
}: {
  ownerId: string
  session: CubeSession | null
  event: CubeEvent
  title: string
  subtitle: string
  solveCount: number
  expanded: boolean
  onToggle: () => void
  onPreview: (solve: Solve) => void
  onDelete: (solveId: string) => void
  updateSolvePenalty: (solveId: string, penalty: Solve['penalty']) => Promise<void>
}) {
  const solves = useLiveQuery(
    async () =>
      expanded ? (session ? listSolvesForSession(ownerId, session.id, SOLVES_PER_GROUP) : listOrphanSolves(ownerId, event, SOLVES_PER_GROUP)) : [],
    [expanded, ownerId, event, session?.id],
  )

  return (
    <div className="session-group" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '16px', marginBottom: '16px' }}>
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '8px 0' }}
        onClick={onToggle}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: '1.1em' }}>{title}</h3>
          <div className="muted" style={{ fontSize: '0.9em' }}>{subtitle} · {solveCount} solves</div>
        </div>
        <Button type="button" variant="ghost" className="icon">
          <ChevronDownIcon style={{ transform: expanded ? 'rotate(180deg)' : 'none' }} />
        </Button>
      </div>

      {expanded && (
        <div className="stack" style={{ marginTop: '16px', paddingLeft: '16px', borderLeft: '2px solid var(--border)' }}>
          {solves?.length === 0 && <p className="muted">No solves in this session.</p>}
          {solves?.map((solve) => (
            <SolveRow
              key={solve.id}
              solve={solve}
              onPreview={onPreview}
              onDelete={onDelete}
              updateSolvePenalty={updateSolvePenalty}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function SolveRow({
  solve,
  onPreview,
  onDelete,
  updateSolvePenalty,
}: {
  solve: Solve
  onPreview: (solve: Solve) => void
  onDelete: (solveId: string) => void
  updateSolvePenalty: (solveId: string, penalty: Solve['penalty']) => Promise<void>
}) {
  return (
    <div className="history-row">
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
            onClick={() => onPreview(solve)}
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
            onClick={() => onDelete(solve.id)}
            title="Delete solve"
          >
            ×
          </Button>
        </div>
      </div>
    </div>
  )
}