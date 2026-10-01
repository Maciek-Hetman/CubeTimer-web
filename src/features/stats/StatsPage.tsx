import { useId, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useApp } from '../../app/AppContext'
import { listSessions } from '../../data/repositories/sessions'
import {
  collectChartSeries,
  computeSolveStats,
  countSolvesByDay,
  summarizeEvents,
  type ChartPoint,
  type SolveStats,
} from '../../data/repositories/solveStats'
import {
  EVENTS,
  eventLabel,
  isCubeEvent,
  type CubeEvent,
  type CubeSession,
  type StatsChartScale,
} from '../../domain/models'
import { activityStart, dayKey } from '../../domain/stats/activity'
import { formatAverage, formatDuration, formatTotalTime } from '../../domain/stats/formatTime'
import { EmptyState } from '../../ui/EmptyState'
import { PageHeader } from '../../ui/PageHeader'
import { Panel } from '../../ui/Panel'
import { StatGrid } from '../../ui/StatGrid'
import { ActivityCalendar } from './ActivityCalendar'
import { CurrentAverages, PersonalBests } from './AverageSections'
import { CurrentSession } from './CurrentSession'
import { EventBreakdown } from './EventBreakdown'
import { ProgressChart } from './ProgressChart'

const NO_CHART_POINTS: ChartPoint[] = []

export function StatsPage() {
  const { solveStats, settings, updateSettings, ownerId } = useApp()
  const [searchParams] = useSearchParams()
  // The page can show any event without moving the timer off the one it's on.
  const requested = searchParams.get('event')
  const event = isCubeEvent(requested) ? requested : settings.event
  const chartScale: StatsChartScale = settings.statsChartScale ?? 'all'
  const groupHeadingId = useId()

  const live = useLiveQuery(
    async () => ({ event, stats: await computeSolveStats(ownerId, event) }),
    [ownerId, event],
  )
  // The app keeps the timer's event summarized already, so that can show while this query catches up.
  const appStats = event === settings.event && solveStats.count > 0 ? { event, stats: solveStats } : undefined
  const shown = live?.event === event ? live : (appStats ?? live)
  // Switching events keeps the last event on screen, dimmed, until the new one arrives.
  const switching = shown !== undefined && shown.event !== event

  const eventSessions = useLiveQuery(
    async () => ({ event, sessions: await listSessions(ownerId, event) }),
    [ownerId, event],
  )
  const sessions = eventSessions?.event === event ? eventSessions.sessions : undefined
  const currentSessionId = settings.currentSessionIds[event]
  // Undefined while loading, so the card doesn't claim there's no session in the meantime.
  const currentSession = sessions ? (sessions.find((s) => s.id === currentSessionId) ?? null) : undefined

  // Sessions come newest first, so the one before the current session sits right after it.
  const previousSession = useMemo(() => {
    if (!sessions || !currentSession) return null
    const currentIndex = sessions.findIndex((s) => s.id === currentSession.id)
    return currentIndex >= 0 ? (sessions[currentIndex + 1] ?? null) : null
  }, [sessions, currentSession])

  const sessionStats = useSessionStats(ownerId, event, currentSession)
  const previousSessionStats = useSessionStats(ownerId, event, previousSession)

  const chartData = useLiveQuery(
    async () => collectChartSeries(ownerId, event, chartScale),
    [ownerId, event, chartScale],
  )

  const eventSummaries = useLiveQuery(() => summarizeEvents(ownerId), [ownerId])

  // Keyed by day so the calendar rolls over at midnight.
  const todayKey = dayKey(new Date())
  const activity = useLiveQuery(async () => {
    const today = new Date()
    return { today, counts: await countSolvesByDay(ownerId, activityStart(today)) }
  }, [ownerId, todayKey])

  const eventsWithSolves = useMemo(
    () => (eventSummaries ? new Set(eventSummaries.map((entry) => entry.event)) : null),
    [eventSummaries],
  )

  const stats = shown?.stats
  let body = null
  if (stats && stats.count === 0) {
    body = (
      <EmptyState
        title="No solves yet"
        description={`Solves you time for ${eventLabel(event)} show up here.`}
        action={
          <Link className="btn primary" to="/">
            Open timer
          </Link>
        }
      />
    )
  } else if (stats) {
    body = (
      <div className={switching ? 'stats-layout switching' : 'stats-layout'} aria-busy={switching || undefined}>
        <PersonalBests stats={stats} />
        <CurrentAverages stats={stats} />
        <CurrentSession
          session={currentSession}
          stats={sessionStats}
          previousSession={previousSession}
          previousStats={previousSessionStats}
        />
        <ProgressChart
          data={chartData ?? NO_CHART_POINTS}
          scale={chartScale}
          onScaleChange={(scale) => void updateSettings({ statsChartScale: scale })}
        />
        <AllTimeTotals stats={stats} />
      </div>
    )
  }

  return (
    <div className="stack">
      <PageHeader title="Stats" actions={<EventSwitcher selected={event} withSolves={eventsWithSolves} />} />
      {body}
      {stats && activity && eventSummaries && eventSummaries.length > 0 ? (
        <section className="stats-group" aria-labelledby={groupHeadingId}>
          <h2 id={groupHeadingId} className="stats-group-title">
            All events
          </h2>
          <ActivityCalendar counts={activity.counts} today={activity.today} />
          <EventBreakdown events={eventSummaries} selected={event} />
        </section>
      ) : null}
    </div>
  )
}

/** A session's stats; undefined while they load or when there's no session, never another session's. */
function useSessionStats(ownerId: string, event: CubeEvent, session: CubeSession | null | undefined) {
  const result = useLiveQuery(
    async () => (session ? { id: session.id, stats: await computeSolveStats(ownerId, event, session.id) } : null),
    [ownerId, event, session?.id],
  )
  return session && result?.id === session.id ? result.stats : undefined
}

function EventSwitcher({ selected, withSolves }: { selected: CubeEvent; withSolves: ReadonlySet<CubeEvent> | null }) {
  return (
    <nav className="stats-events" aria-label="Event">
      {EVENTS.map((event) => {
        const empty = withSolves !== null && !withSolves.has(event)
        return (
          <Link
            key={event}
            to={`?event=${event}`}
            replace
            aria-current={event === selected ? 'page' : undefined}
            className={empty ? 'empty' : undefined}
            title={empty ? 'No solves yet' : undefined}
          >
            {eventLabel(event)}
          </Link>
        )
      })}
    </nav>
  )
}

function penaltyRate(part: number, total: number) {
  return (
    <>
      {`${((part / total) * 100).toFixed(1)}%`}
      <span className="stats-rate-count"> ({part.toLocaleString()})</span>
    </>
  )
}

function AllTimeTotals({ stats }: { stats: SolveStats }) {
  const headingId = useId()
  return (
    <Panel muted role="region" aria-labelledby={headingId} className="stats-all-time">
      <h2 id={headingId}>All-time</h2>
      <StatGrid
        items={[
          ['Solves', stats.count.toLocaleString()],
          ['Mean', formatAverage(stats.mean)],
          ['Std dev', stats.stdDev === null ? '—' : formatDuration(stats.stdDev)],
          ['Worst', formatAverage(stats.worst)],
          ['Total time', formatTotalTime(stats.totalTime)],
          ['+2 rate', penaltyRate(stats.plusTwoCount, stats.count)],
          ['DNF rate', penaltyRate(stats.dnfCount, stats.count)],
        ]}
      />
    </Panel>
  )
}
