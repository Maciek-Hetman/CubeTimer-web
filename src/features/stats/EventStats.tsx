import { useId, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useApp } from '../../app/AppContext'
import { listSessions } from '../../data/repositories/sessions'
import {
  collectChartSeries,
  computeSolveStats,
  type SolveStats,
} from '../../data/repositories/solveStats'
import { eventLabel, type CubeEvent, type CubeSession, type StatsChartScale } from '../../domain/models'
import { formatAverage, formatDuration, formatTotalTime } from '../../domain/stats/formatTime'
import { EmptyState } from '../../ui/EmptyState'
import { Panel } from '../../ui/Panel'
import { StatGrid } from '../../ui/StatGrid'
import { CurrentAverages, PersonalBests } from './AverageSections'
import { CurrentSession } from './CurrentSession'
import { ProgressChart } from './ProgressChart'
import { StatsLoading } from './StatsLoading'

/** One event's tab: bests, current averages, the session, progress and all-time totals. */
export function EventStats({ event }: { event: CubeEvent }) {
  const { solveStats, settings, updateSettings, ownerId } = useApp()
  const chartScale: StatsChartScale = settings.statsChartScale ?? 'all'

  const live = useLiveQuery(
    async () => ({ event, stats: await computeSolveStats(ownerId, event) }),
    [ownerId, event],
  )
  // The app keeps the timer's whole event summarized (the same computeSolveStats call), so that can
  // show while this query catches up.
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

  // Tagged with its inputs so a scale change keeps the previous points, dimmed, until the new ones land.
  const chartResult = useLiveQuery(
    async () => ({ event, scale: chartScale, points: await collectChartSeries(ownerId, event, chartScale) }),
    [ownerId, event, chartScale],
  )
  const chartData = chartResult?.event === event ? chartResult.points : undefined
  const chartStale = chartResult !== undefined && chartResult.event === event && chartResult.scale !== chartScale

  const stats = shown?.stats
  // Switching away from an event without solves has nothing worth holding on screen.
  if (!stats || (stats.count === 0 && switching)) {
    return <StatsLoading />
  }
  if (stats.count === 0) {
    return (
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
  }
  return (
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
        data={chartData}
        stale={chartStale}
        scale={chartScale}
        onScaleChange={(scale) => void updateSettings({ statsChartScale: scale })}
      />
      <AllTimeTotals stats={stats} />
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
