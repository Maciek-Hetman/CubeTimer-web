import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useApp } from '../../app/AppContext'
import {
  effectiveTimeMs,
  eventLabel,
  normalizeTimingDevice,
  type CubeEvent,
  type CubeSession,
  type Solve,
  type TimingDevice,
} from '../../domain/models'
import { formatAverage, formatSolveTime } from '../../domain/stats/formatTime'
import { Button } from '../../ui/Button'
import { Dialog } from '../../ui/Dialog'
import { EmptyState } from '../../ui/EmptyState'
import { PageHeader } from '../../ui/PageHeader'
import { EyeIcon, ChevronDownIcon, TrashIcon, PencilIcon, ShareIcon } from '../../ui/NavIcons'
import {
  countSolvesBySession,
  listOrphanSolves,
  listSolvesForSession,
} from '../../data/repositories/solves'
import { TimingDeviceBadge } from './TimingDeviceBadge'
import { shareSolve, type ShareResult } from './shareSolve'

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

const PENALTY_LABELS: Record<Solve['penalty'], string> = {
  none: 'None',
  plus_two: '+2',
  dnf: 'DNF',
}

function formatSessionDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function HistoryPage() {
  const {
    solveStats,
    sessions,
    settings,
    currentSession,
    ownerId,
    updateSolvePenalty,
    deleteSolve,
    removeSession,
    renameSession,
  } = useApp()
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [pendingSessionDelete, setPendingSessionDelete] = useState<CubeSession | null>(null)
  const [pendingSessionRename, setPendingSessionRename] = useState<CubeSession | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
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

  const sessionSummary = useLiveQuery(
    async () =>
      ownerId
        ? countSolvesBySession(ownerId, settings.event)
        : {
            counts: new Map<string, number>(),
            averages: new Map<string, number | null>(),
            orphanCount: 0,
            orphanAvgTime: null,
            devices: new Map<string, TimingDevice[]>(),
            orphanDevices: [],
          },
    [ownerId, settings.event],
  )

  const listItems = useMemo(() => {
    const items: Array<{
      id: string
      title: string
      subtitle: string
      solveCount: number
      avgTime: number | null
      devices: TimingDevice[]
      session: CubeSession | null
    }> = [...sessions]
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
      .map((session) => ({
        id: session.id,
        title: session.name || 'Unnamed Session',
        subtitle: `${eventLabel(session.event)} · ${formatSessionDate(session.startedAt)}`,
        solveCount: sessionSummary?.counts.get(session.id) ?? 0,
        avgTime: sessionSummary?.averages.get(session.id) ?? null,
        devices: sessionSummary?.devices.get(session.id) ?? [],
        session,
      }))
      .filter((item) => sessionSummary === undefined || item.solveCount > 0)
    if ((sessionSummary?.orphanCount ?? 0) > 0) {
      items.push({
        id: 'orphan',
        title: 'Uncategorized Solves',
        subtitle: 'No session',
        solveCount: sessionSummary?.orphanCount ?? 0,
        avgTime: sessionSummary?.orphanAvgTime ?? null,
        devices: sessionSummary?.orphanDevices ?? [],
        session: null,
      })
    }
    return items
  }, [sessions, sessionSummary])

  const totalPages = Math.max(1, Math.ceil(listItems.length / PAGE_SIZE))
  const currentItems = listItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const openPreview = (solve: Solve) => {
    void import('cubing/twisty').then(() => setPreviewSolve(solve))
  }

  const openRenameSession = (session: CubeSession) => {
    setPendingSessionRename(session)
    setRenameDraft(session.name)
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
          action={
            <Link className="btn primary" to="/">
              Open timer
            </Link>
          }
        />
      ) : (
        <>
          <div className="stack session-list">
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
                  avgTime={item.avgTime}
                  devices={item.devices}
                  expanded={isExpanded}
                  onToggle={() => toggleSession(item.id)}
                  onPreview={openPreview}
                  onDelete={setPendingDelete}
                  onDeleteSession={setPendingSessionDelete}
                  onRenameSession={openRenameSession}
                  updateSolvePenalty={updateSolvePenalty}
                />
              )
            })}

            {totalPages > 1 && (
              <div className="history-pagination">
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
          </div>
          <p className="muted history-footer">
            {listItems.length} {listItems.length === 1 ? 'session' : 'sessions'} · {solveStats.count}{' '}
            {solveStats.count === 1 ? 'solve' : 'solves'}
          </p>
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

      {pendingSessionRename ? (
        <Dialog
          title="Rename session"
          onClose={() => setPendingSessionRename(null)}
          footer={
            <div className="row wrap">
              <Button type="button" onClick={() => setPendingSessionRename(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={() => {
                  const next = renameDraft.trim()
                  if (next && next !== pendingSessionRename.name) {
                    void renameSession(pendingSessionRename.id, next)
                  }
                  setPendingSessionRename(null)
                }}
              >
                Save
              </Button>
            </div>
          }
        >
          <form
            onSubmit={(event) => {
              event.preventDefault()
              const next = renameDraft.trim()
              if (next && next !== pendingSessionRename.name) {
                void renameSession(pendingSessionRename.id, next)
              }
              setPendingSessionRename(null)
            }}
          >
            <label className="field">
              Session name
              <input
                autoFocus
                value={renameDraft}
                onChange={(event) => setRenameDraft(event.target.value)}
                aria-label="Session name"
                placeholder="Session name"
              />
            </label>
          </form>
        </Dialog>
      ) : null}

      {pendingSessionDelete ? (
        <Dialog
          title="Delete session"
          onClose={() => setPendingSessionDelete(null)}
          footer={
            <div className="row wrap">
              <Button type="button" onClick={() => setPendingSessionDelete(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={() => {
                  void removeSession(pendingSessionDelete.id)
                  setPendingSessionDelete(null)
                }}
              >
                Delete
              </Button>
            </div>
          }
        >
          <p>
            Delete <strong>{pendingSessionDelete.name || 'Unnamed Session'}</strong> and all of its
            solves? This cannot be undone.
          </p>
        </Dialog>
      ) : null}

      {previewSolve ? (
        <Dialog
          title="Solve Preview"
          onClose={() => setPreviewSolve(null)}
          footer={
            <div className="row wrap">
              <ShareSolveButton solve={previewSolve} />
              <Button type="button" onClick={() => setPreviewSolve(null)}>
                Close
              </Button>
            </div>
          }
        >
          <div className="solve-preview">
            <div className={`solve-preview-time${previewSolve.penalty === 'dnf' ? ' dnf' : ''}`}>
              {formatSolveTime(previewSolve)}
            </div>
            <dl className="solve-details">
              <div>
                <dt>Date</dt>
                <dd>{new Date(previewSolve.solvedAt).toLocaleString()}</dd>
              </div>
              <div>
                <dt>Event</dt>
                <dd>{eventLabel(previewSolve.event)}</dd>
              </div>
              <div>
                <dt>Timed with</dt>
                <dd>
                  <TimingDeviceBadge device={normalizeTimingDevice(previewSolve.timingDevice)} />
                </dd>
              </div>
              <div>
                <dt>Penalty</dt>
                <dd>{PENALTY_LABELS[previewSolve.penalty]}</dd>
              </div>
            </dl>

            {previewSolve.scramble && (
              <>
                <div className="solve-preview-cube">
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
                <div className="solve-preview-scramble">{previewSolve.scramble}</div>
              </>
            )}
          </div>
        </Dialog>
      ) : null}
    </div>
  )
}

const SHARE_FEEDBACK: Partial<Record<ShareResult, string>> = {
  copied: 'Copied!',
  failed: "Couldn't share",
}

function ShareSolveButton({ solve }: { solve: Solve }) {
  const [feedback, setFeedback] = useState<string | null>(null)

  useEffect(() => {
    if (!feedback) {
      return
    }
    const timeout = window.setTimeout(() => setFeedback(null), 2000)
    return () => window.clearTimeout(timeout)
  }, [feedback])

  return (
    <Button
      type="button"
      variant="primary"
      onClick={() => {
        void shareSolve(solve).then((result) => setFeedback(SHARE_FEEDBACK[result] ?? null))
      }}
    >
      <ShareIcon />
      <span aria-live="polite">{feedback ?? 'Share'}</span>
    </Button>
  )
}

function SessionGroup({
  ownerId,
  session,
  event,
  title,
  subtitle,
  solveCount,
  avgTime,
  devices,
  expanded,
  onToggle,
  onPreview,
  onDelete,
  onDeleteSession,
  onRenameSession,
  updateSolvePenalty,
}: {
  ownerId: string
  session: CubeSession | null
  event: CubeEvent
  title: string
  subtitle: string
  solveCount: number
  avgTime: number | null
  devices: TimingDevice[]
  expanded: boolean
  onToggle: () => void
  onPreview: (solve: Solve) => void
  onDelete: (solveId: string) => void
  onDeleteSession: (session: CubeSession) => void
  onRenameSession: (session: CubeSession) => void
  updateSolvePenalty: (solveId: string, penalty: Solve['penalty']) => Promise<void>
}) {
  const solves = useLiveQuery(
    async () =>
      // null while collapsed so expanding doesn't briefly show the empty-session message.
      expanded ? (session ? listSolvesForSession(ownerId, session.id, SOLVES_PER_GROUP) : listOrphanSolves(ownerId, event, SOLVES_PER_GROUP)) : null,
    [expanded, ownerId, event, session?.id],
  )

  const bestSolveId = useMemo(() => {
    let best: { id: string; ms: number } | null = null
    for (const solve of solves ?? []) {
      const ms = effectiveTimeMs(solve)
      if (ms !== null && (best === null || ms < best.ms)) {
        best = { id: solve.id, ms }
      }
    }
    return best?.id ?? null
  }, [solves])

  const solvesLabel = `${solveCount} ${solveCount === 1 ? 'solve' : 'solves'}`
  const mean = formatAverage(avgTime)

  return (
    <section className={`session-group${expanded ? ' expanded' : ''}`}>
      <div className="session-group-header" onClick={onToggle}>
        <div className="session-group-title">
          <h3>{title}</h3>
          <div className="session-group-meta">
            <span className="muted">{subtitle}</span>
            {devices.length > 0 ? (
              <span className="session-group-devices">
                {devices.map((device) => (
                  <TimingDeviceBadge key={device} device={device} iconOnly />
                ))}
              </span>
            ) : null}
          </div>
        </div>
        <div className="session-group-stats" aria-label={`${solvesLabel}, mean ${mean}`}>
          <div className="session-stat">
            <span className="session-stat-value">{solveCount}</span>
            <span className="session-stat-label">{solveCount === 1 ? 'solve' : 'solves'}</span>
          </div>
          <div className="session-stat">
            <span className="session-stat-value">{mean}</span>
            <span className="session-stat-label">mean</span>
          </div>
        </div>
        <div className="session-group-actions">
          {session ? (
            <>
              <Button
                type="button"
                variant="ghost"
                className="icon"
                aria-label={`Rename session ${title}`}
                title="Rename session"
                onClick={(event) => {
                  event.stopPropagation()
                  onRenameSession(session)
                }}
              >
                <PencilIcon />
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="icon danger"
                aria-label={`Delete session ${title}`}
                title="Delete session"
                onClick={(event) => {
                  event.stopPropagation()
                  onDeleteSession(session)
                }}
              >
                <TrashIcon />
              </Button>
            </>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            className="icon"
            aria-label={expanded ? 'Collapse session' : 'Expand session'}
            aria-expanded={expanded}
          >
            <ChevronDownIcon style={{ transform: expanded ? 'rotate(180deg)' : 'none' }} />
          </Button>
        </div>
      </div>

      {expanded && (
        <ol className="session-group-solves">
          {solves?.length === 0 && <li className="muted">No solves in this session.</li>}
          {solves?.map((solve, index) => (
            <SolveRow
              key={solve.id}
              solve={solve}
              number={solveCount - index}
              best={solve.id === bestSolveId && (solves?.length ?? 0) > 1}
              onPreview={onPreview}
              onDelete={onDelete}
              updateSolvePenalty={updateSolvePenalty}
            />
          ))}
        </ol>
      )}
    </section>
  )
}

function SolveRow({
  solve,
  number,
  best,
  onPreview,
  onDelete,
  updateSolvePenalty,
}: {
  solve: Solve
  number: number
  best: boolean
  onPreview: (solve: Solve) => void
  onDelete: (solveId: string) => void
  updateSolvePenalty: (solveId: string, penalty: Solve['penalty']) => Promise<void>
}) {
  const device = normalizeTimingDevice(solve.timingDevice)
  const timeClass = solve.penalty === 'dnf' ? ' dnf' : best ? ' best' : ''
  return (
    <li className="history-row">
      <span className="history-index">{number}</span>
      <span className={`history-time${timeClass}`} title={best ? 'Best in session' : undefined}>
        {formatSolveTime(solve)}
      </span>
      <span className="history-meta">
        <TimingDeviceBadge device={device} />
        <time className="muted" dateTime={solve.solvedAt}>
          {new Date(solve.solvedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
        </time>
      </span>
      <div className="solve-controls">
        <Button type="button" aria-label="Preview solve" onClick={() => onPreview(solve)} title="Preview solve">
          <EyeIcon />
        </Button>
        <Button
          type="button"
          className={solve.penalty === 'plus_two' ? 'active' : ''}
          aria-pressed={solve.penalty === 'plus_two'}
          onClick={() => void updateSolvePenalty(solve.id, solve.penalty === 'plus_two' ? 'none' : 'plus_two')}
        >
          +2
        </Button>
        <Button
          type="button"
          className={solve.penalty === 'dnf' ? 'active' : ''}
          aria-pressed={solve.penalty === 'dnf'}
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
    </li>
  )
}
