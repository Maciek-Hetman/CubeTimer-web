import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useApp } from '../../app/AppContext'
import { eventLabel, STATS_CHART_SCALES, STATS_CHART_SCALE_LABELS, type StatsChartScale } from '../../domain/models'
import { formatAverage, formatSolveTime, formatTotalTime } from '../../domain/stats/formatTime'
import { collectChartSeries, computeSolveStats, type SolveStats } from '../../data/repositories/solveStats'
import { EmptyState } from '../../ui/EmptyState'
import { PageHeader } from '../../ui/PageHeader'
import { Panel } from '../../ui/Panel'
import { ProgressChart } from './ProgressChart'
import './StatsPage.css'

type TimeStatKey = 'best' | 'worst' | 'mean' | 'stdDev' | 'ao5' | 'ao12' | 'ao50' | 'ao100'

interface TimeStat {
  key: TimeStatKey
  label: string
  /** Solves needed before the stat can exist; below that it reads as "—" rather than DNF. */
  needs: number
}

type AverageKey = 'ao5' | 'ao12' | 'ao50' | 'ao100'

const PB_STATS: Array<{ label: string; best: keyof SolveStats; current: AverageKey | null; needs: number }> = [
  { label: 'Single', best: 'best', current: null, needs: 1 },
  { label: 'Ao5', best: 'bestAo5', current: 'ao5', needs: 5 },
  { label: 'Ao12', best: 'bestAo12', current: 'ao12', needs: 12 },
  { label: 'Ao50', best: 'bestAo50', current: 'ao50', needs: 50 },
  { label: 'Ao100', best: 'bestAo100', current: 'ao100', needs: 100 },
]

const SESSION_GROUPS: Array<{ title: string; stats: TimeStat[] }> = [
  {
    title: 'Singles',
    stats: [
      { key: 'best', label: 'Best', needs: 1 },
      { key: 'worst', label: 'Worst', needs: 1 },
      { key: 'mean', label: 'Mean', needs: 1 },
      { key: 'stdDev', label: 'Std dev', needs: 1 },
    ],
  },
  {
    title: 'Averages',
    stats: [
      { key: 'ao5', label: 'Ao5', needs: 5 },
      { key: 'ao12', label: 'Ao12', needs: 12 },
      { key: 'ao50', label: 'Ao50', needs: 50 },
      { key: 'ao100', label: 'Ao100', needs: 100 },
    ],
  },
]

const SCALE_SHORT_LABELS: Record<StatsChartScale, string> = {
  all: 'All',
  '1000': '1000',
  '500': '500',
  '250': '250',
  '100': '100',
}

function formatStat(value: number | null, needs: number, count: number): string {
  if (value !== null) return formatAverage(value)
  return count < needs ? '—' : 'DNF'
}

function formatTimeStat(stats: SolveStats, stat: TimeStat): string {
  // A spread has no DNF form: with no timed solves there is simply nothing to measure.
  if (stat.key === 'stdDev' && stats.stdDev === null) return '—'
  return formatStat(stats[stat.key], stat.needs, stats.count)
}

function formatPercent(part: number, whole: number): string {
  if (whole === 0) return '0%'
  const pct = (part / whole) * 100
  return `${pct < 10 && pct > 0 ? pct.toFixed(1) : Math.round(pct)}%`
}

function Section({
  title,
  description,
  actions,
  children,
}: {
  title: string
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="stats-section" aria-label={title}>
      <header className="stats-section-head">
        <div className="stats-section-titles">
          <h2>{title}</h2>
          {description ? <p className="muted">{description}</p> : null}
        </div>
        {actions}
      </header>
      {children}
    </section>
  )
}

function Delta({ current, previous, against }: { current: number | null; previous: number | null; against: string }) {
  if (current === null || previous === null) return null
  const diff = current - previous
  const magnitude = formatAverage(Math.abs(diff))
  if (Math.abs(diff) < 10) {
    return (
      <span className="stats-delta" title={`Same as ${against}`}>
        ±{magnitude}
      </span>
    )
  }
  // Every compared stat is a time or a spread, so lower is always better.
  const better = diff < 0
  return (
    <span
      className={`stats-delta ${better ? 'better' : 'worse'}`}
      title={`${magnitude} ${better ? 'better' : 'worse'} than ${against}`}
    >
      <span aria-hidden="true">{better ? '↓' : '↑'}</span>
      {better ? '−' : '+'}
      {magnitude}
    </span>
  )
}

function KeyValueList({ items }: { items: Array<[string, ReactNode]> }) {
  return (
    <dl className="stats-list">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function StatsPage() {
  const { solveStats, sessions, settings, updateSettings, currentSession, ownerId, recentSolves } = useApp()

  const chartScale: StatsChartScale = settings.statsChartScale ?? 'all'
  const event = eventLabel(settings.event)

  // Sessions are listed newest-first, so the session before the current one is the next entry.
  const previousSession = useMemo(() => {
    if (!currentSession) return null
    const currentIndex = sessions.findIndex((s) => s.id === currentSession.id)
    return currentIndex >= 0 ? (sessions[currentIndex + 1] ?? null) : null
  }, [sessions, currentSession])

  const sessionStats = useLiveQuery(
    async () =>
      currentSession ? computeSolveStats(ownerId, settings.event, currentSession.id) : null,
    [ownerId, settings.event, currentSession?.id],
  )

  const previousSessionStats = useLiveQuery(
    async () =>
      previousSession ? computeSolveStats(ownerId, settings.event, previousSession.id) : null,
    [ownerId, settings.event, previousSession?.id],
  )

  const chartData = useLiveQuery(
    async () => collectChartSeries(ownerId, settings.event, chartScale),
    [ownerId, settings.event, chartScale],
  )

  const latestSolve = recentSolves[0]
  const comparison: SolveStats | null =
    previousSession && previousSessionStats && previousSessionStats.count > 0 ? previousSessionStats : null

  const rangeControl = (
    <div className="stats-range" role="group" aria-label="Graph scale">
      {STATS_CHART_SCALES.map((scale) => (
        <button
          key={scale}
          type="button"
          aria-label={STATS_CHART_SCALE_LABELS[scale]}
          aria-pressed={chartScale === scale}
          onClick={() => void updateSettings({ statsChartScale: scale })}
        >
          {SCALE_SHORT_LABELS[scale]}
        </button>
      ))}
    </div>
  )

  return (
    <div className="stats-page">
      <PageHeader
        title="Stats"
        subtitle={`${event}${currentSession ? ` · ${currentSession.name}` : ''}`}
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
          <Section title="Personal bests" description={`Fastest results across all ${event} solves`}>
            <div className="stats-pb-grid">
              {PB_STATS.map((pb) => {
                const hasEnough = solveStats.count >= pb.needs
                let current: ReactNode
                if (!hasEnough) {
                  current = `Needs ${pb.needs} solves`
                } else if (pb.current === null) {
                  current = (
                    <>
                      Latest <strong>{latestSolve ? formatSolveTime(latestSolve) : '—'}</strong>
                    </>
                  )
                } else {
                  current = (
                    <>
                      Current <strong>{formatStat(solveStats[pb.current], pb.needs, solveStats.count)}</strong>
                    </>
                  )
                }
                return (
                  <Panel key={pb.label} className="stats-pb">
                    <div className="stats-pb-label">{pb.label}</div>
                    <div className="stats-pb-value">
                      {formatStat(solveStats[pb.best], pb.needs, solveStats.count)}
                    </div>
                    <div className="stats-pb-current">{current}</div>
                  </Panel>
                )
              })}
            </div>
          </Section>

          <Section
            title="Progress"
            description="Every single, with rolling Ao5 and Ao12 on top"
            actions={rangeControl}
          >
            <ProgressChart data={chartData ?? []} />
          </Section>

          {currentSession ? (
            <Section
              title="Current session"
              description={
                <>
                  {currentSession.name} · {sessionStats?.count ?? 0} solves ·{' '}
                  {formatTotalTime(sessionStats?.totalTime ?? 0)}
                </>
              }
              actions={
                comparison && previousSession ? (
                  <p className="stats-compare-note">
                    Changes vs <strong>{previousSession.name}</strong>
                  </p>
                ) : null
              }
            >
              <Panel className="stats-session">
                {!sessionStats || sessionStats.count === 0 ? (
                  <p className="muted stats-session-empty">No solves in this session yet.</p>
                ) : (
                  SESSION_GROUPS.map((group) => (
                    <div key={group.title} className="stats-group">
                      <h3>{group.title}</h3>
                      <div className="stats-tile-grid">
                        {group.stats.map((stat) => (
                          <div key={stat.key} className="stats-tile">
                            <div className="stats-tile-label">{stat.label}</div>
                            <div className="stats-tile-value">{formatTimeStat(sessionStats, stat)}</div>
                            {comparison && previousSession ? (
                              <Delta
                                current={sessionStats[stat.key]}
                                previous={comparison[stat.key]}
                                against={previousSession.name}
                              />
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </Panel>
            </Section>
          ) : null}

          <Section title="All time" description={`Everything you've logged for ${event}`}>
            <div className="stats-card-grid">
              <Panel className="stats-card">
                <h3>Consistency</h3>
                <KeyValueList
                  items={[
                    ['Mean', formatTimeStat(solveStats, { key: 'mean', label: 'Mean', needs: 1 })],
                    ['Std dev', formatTimeStat(solveStats, { key: 'stdDev', label: 'Std dev', needs: 1 })],
                    ['Worst', formatTimeStat(solveStats, { key: 'worst', label: 'Worst', needs: 1 })],
                    [
                      'DNF rate',
                      <>
                        {formatPercent(solveStats.dnfCount, solveStats.count)}
                        <span className="stats-list-aside">
                          {solveStats.dnfCount} {solveStats.dnfCount === 1 ? 'DNF' : 'DNFs'}
                        </span>
                      </>,
                    ],
                  ]}
                />
              </Panel>
              <Panel className="stats-card">
                <h3>Volume</h3>
                <KeyValueList
                  items={[
                    ['Solves', solveStats.count.toLocaleString()],
                    ['Sessions', sessions.length.toLocaleString()],
                    ['Total time', formatTotalTime(solveStats.totalTime)],
                  ]}
                />
              </Panel>
            </div>
          </Section>
        </>
      )}
    </div>
  )
}
