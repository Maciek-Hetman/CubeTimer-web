import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useApp } from '../../app/AppContext'
import {
  EVENTS,
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
import { Select } from '../../ui/Select'
import { EyeIcon, ChevronDownIcon, TrashIcon, PencilIcon, ShareIcon } from '../../ui/NavIcons'
import { listSessions } from '../../data/repositories/sessions'
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

type EventFilter = CubeEvent | 'all'

const ALL_EVENTS = 'all'

function parseEventFilter(value: string | null): EventFilter | null {
  if (value === ALL_EVENTS) {
    return ALL_EVENTS
  }
  return EVENTS.find((event) => event === value) ?? null
}

function formatSessionDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function HistoryPage() {
  const {
    settings,
    ownerId,
    updateSolvePenalty,
    deleteSolve,
    removeSession,
    renameSession,
  } = useApp()
  const [searchParams, setSearchParams] = useSearchParams()
  // Without an explicit filter, show the event the timer is on.
  const eventFilter = parseEventFilter(searchParams.get('event')) ?? settings.event
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [pendingSessionDelete, setPendingSessionDelete] = useState<CubeSession | null>(null)
  const [pendingSessionRename, setPendingSessionRename] = useState<CubeSession | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [previewSolve, setPreviewSolve] = useState<Solve | null>(null)

  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set())
  // Page is tied to the filter it was chosen under, so any filter change (back/forward, URL edit) resets it.
  const [pageState, setPageState] = useState<{ filter: EventFilter; page: number }>({
    filter: eventFilter,
    page: 1,
  })
  const page = pageState.filter === eventFilter ? pageState.page : 1
  const setPage = (next: number) => setPageState({ filter: eventFilter, page: next })

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

  const changeEventFilter = (value: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('event', value)
        return next
      },
      { replace: true },
    )
  }

  // One pass over all events feeds both the list and the per-event filter totals; the list is filtered in listItems.
  const history = useLiveQuery(async () => {
    if (!ownerId) {
      return null
    }
    const [sessions, summary] = await Promise.all([listSessions(ownerId), countSolvesBySession(ownerId)])
    return { sessions, summary }
  }, [ownerId])

  const listItems = useMemo(() => {
    if (!history) {
      return []
    }
    const { sessions, summary } = history
    const matches = (event: CubeEvent) => eventFilter === ALL_EVENTS || event === eventFilter
    const items: Array<{
      id: string
      title: string
      subtitle: string
      event: CubeEvent
      solveCount: number
      avgTime: number | null
      devices: TimingDevice[]
      session: CubeSession | null
    }> = []
    // listSessions returns newest first.
    for (const session of sessions) {
      const group = summary.sessions.get(session.id)
      if (!group || !matches(session.event)) {
        continue
      }
      items.push({
        id: session.id,
        title: session.name || 'Unnamed Session',
        subtitle: `${eventLabel(session.event)} · ${formatSessionDate(session.startedAt)}`,
        event: session.event,
        solveCount: group.count,
        avgTime: group.avgTime,
        devices: group.devices,
        session,
      })
    }
    for (const event of EVENTS) {
      const group = summary.orphans.get(event)
      if (!group || !matches(event)) {
        continue
      }
      items.push({
        id: `orphan:${event}`,
        title: 'Uncategorized Solves',
        subtitle: `${eventLabel(event)} · No session`,
        event,
        solveCount: group.count,
        avgTime: group.avgTime,
        devices: group.devices,
        session: null,
      })
    }
    return items
  }, [history, eventFilter])

  const totals = history?.summary.totals
  const totalSolves = totals ? [...totals.values()].reduce((sum, count) => sum + count, 0) : 0
  const filteredSolves = eventFilter === ALL_EVENTS ? totalSolves : (totals?.get(eventFilter) ?? 0)
  const filterOptions = [
    { value: ALL_EVENTS, label: `All events (${totalSolves})` },
    ...EVENTS.map((event) => ({ value: event, label: `${eventLabel(event)} (${totals?.get(event) ?? 0})` })),
  ]

  const totalPages = Math.max(1, Math.ceil(listItems.length / PAGE_SIZE))
  // Deleting sessions can leave the stored page past the end.
  const currentPage = Math.min(page, totalPages)
  const currentItems = listItems.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

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
        actions={
          totalSolves > 0 ? (
            <Select
              size="small"
              aria-label="Filter by event"
              value={eventFilter}
              onChange={changeEventFilter}
              options={filterOptions}
            />
          ) : null
        }
      />

      {!history ? null : totalSolves === 0 ? (
        <EmptyState
          title="No solves yet"
          action={
            <Link className="btn primary" to="/">
              Open timer
            </Link>
          }
        />
      ) : listItems.length === 0 ? (
        <EmptyState
          title={`No ${eventFilter === ALL_EVENTS ? '' : `${eventLabel(eventFilter)} `}solves yet`}
          action={
            <Button type="button" onClick={() => changeEventFilter(ALL_EVENTS)}>
              Show all events
            </Button>
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
                  event={item.event}
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
                  disabled={currentPage === 1}
                  onClick={() => setPage(currentPage - 1)}
                >
                  Previous
                </Button>
                <span className="muted">Page {currentPage} of {totalPages}</span>
                <Button
                  type="button"
                  disabled={currentPage === totalPages}
                  onClick={() => setPage(currentPage + 1)}
                >
                  Next
                </Button>
              </div>
            )}
          </div>
          <p className="muted history-footer">
            {listItems.length} {listItems.length === 1 ? 'session' : 'sessions'} · {filteredSolves}{' '}
            {filteredSolves === 1 ? 'solve' : 'solves'}
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
