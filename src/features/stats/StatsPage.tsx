import { useId, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useLiveQuery } from 'dexie-react-hooks'
import { useApp } from '../../app/AppContext'
import {
  eventLabel,
  STATS_CHART_SCALES,
  STATS_CHART_SCALE_LABELS,
  type CubeSession,
  type StatsChartScale,
} from '../../domain/models'
import { formatAverage, formatDuration, formatTotalTime } from '../../domain/stats/formatTime'
import {
  collectChartSeries,
  computeSolveStats,
  type ChartPoint,
  type SolveStats,
} from '../../data/repositories/solveStats'
import { Button } from '../../ui/Button'
import { EmptyState } from '../../ui/EmptyState'
import { PageHeader } from '../../ui/PageHeader'
import { Panel } from '../../ui/Panel'
import { StatGrid } from '../../ui/StatGrid'
import { scalePx, useUiScale } from '../../ui/useUiScale'
import { formatAxisSeconds, formatChartSeconds, solveTicks } from './chartAxes'

const CHART_SERIES = [
  // Single times are the noisy backdrop; the rolling averages carry the trend.
  { key: 'time', label: 'Time', color: 'var(--accent)', strokeWidth: 1, strokeOpacity: 0.45 },
  { key: 'ao5', label: 'Ao5', color: 'var(--chart-ao5)', strokeWidth: 2, strokeOpacity: 1 },
  { key: 'ao12', label: 'Ao12', color: 'var(--chart-ao12)', strokeWidth: 2, strokeOpacity: 1 },
] as const

type SeriesKey = (typeof CHART_SERIES)[number]['key']

const NO_CHART_POINTS: ChartPoint[] = []

/** A stat that needs `needed` solves: a dash until there are enough, then the time (or DNF). */
function formatStat(value: number | null, count: number, needed = 1): string {
  return count < needed ? '—' : formatAverage(value)
}

export function StatsPage() {
  const { solveStats, sessions, settings, updateSettings, currentSession, ownerId } = useApp()
  const chartScale: StatsChartScale = settings.statsChartScale ?? 'all'

  // Sessions come newest first, so the one before the current session sits right after it.
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

  return (
    <div className="stack">
      <PageHeader title="Stats" subtitle={eventLabel(settings.event)} />

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
        <div className="stats-layout">
          <PersonalBests stats={solveStats} />
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
          <AllTimeTotals stats={solveStats} />
        </div>
      )}
    </div>
  )
}

interface Kpi {
  label: string
  /** Null until there are enough solves for the stat. */
  value: string | null
  context: string
  contextValue?: string
}

/** A personal best over `n` solves, next to where that average stands now. */
function bestAverageKpi(label: string, n: number, best: number | null, current: number | null, count: number): Kpi {
  if (count < n) {
    return { label, value: null, context: `Needs ${n} solves` }
  }
  return { label, value: formatAverage(best), context: 'Current', contextValue: formatAverage(current) }
}

function PersonalBests({ stats }: { stats: SolveStats }) {
  const headingId = useId()
  const { count } = stats
  const headline: Kpi[] = [
    { label: 'Single', value: formatStat(stats.best, count), context: 'Mean', contextValue: formatStat(stats.mean, count) },
    bestAverageKpi('Ao5', 5, stats.bestAo5, stats.ao5, count),
    bestAverageKpi('Ao12', 12, stats.bestAo12, stats.ao12, count),
  ]
  const longer: Kpi[] = [
    bestAverageKpi('Ao50', 50, stats.bestAo50, stats.ao50, count),
    bestAverageKpi('Ao100', 100, stats.bestAo100, stats.ao100, count),
  ]

  return (
    <Panel role="region" aria-labelledby={headingId} className="stats-bests stack">
      <h2 id={headingId}>Personal bests</h2>
      <div className="stats-bests-groups">
        <KpiList items={headline} />
        <KpiList items={longer} secondary />
      </div>
    </Panel>
  )
}

function KpiList({ items, secondary = false }: { items: Kpi[]; secondary?: boolean }) {
  return (
    <dl className={['stats-kpis', secondary ? 'secondary' : ''].filter(Boolean).join(' ')}>
      {items.map((item) => (
        <div key={item.label} className="stats-kpi">
          <dt>{item.label}</dt>
          <dd className={item.value === null ? 'stats-kpi-value pending' : 'stats-kpi-value'}>{item.value ?? '—'}</dd>
          <dd className="stats-kpi-context">
            {item.context}
            {item.contextValue ? <span> {item.contextValue}</span> : null}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function CurrentSession({
  session,
  stats,
  previousSession,
  previousStats,
}: {
  session: CubeSession | null
  stats: SolveStats | null | undefined
  previousSession: CubeSession | null
  previousStats: SolveStats | null | undefined
}) {
  const headingId = useId()
  const compared = previousSession && previousStats && previousStats.count > 0 ? previousStats : null

  let body
  if (!session) {
    body = <p className="muted stats-session-empty">No active session. Your next solve starts one.</p>
  } else if (!stats) {
    body = null
  } else if (stats.count === 0) {
    body = <p className="muted stats-session-empty">No solves in this session yet.</p>
  } else {
    const rows = [
      { label: 'Ao5', value: formatStat(stats.ao5, stats.count, 5), delta: difference(stats.ao5, compared?.ao5) },
      { label: 'Ao12', value: formatStat(stats.ao12, stats.count, 12), delta: difference(stats.ao12, compared?.ao12) },
      { label: 'Mean', value: formatStat(stats.mean, stats.count), delta: difference(stats.mean, compared?.mean) },
      { label: 'Best', value: formatStat(stats.best, stats.count), delta: difference(stats.best, compared?.best) },
    ]
    body = (
      <>
        <p className="stats-session-meta">
          {stats.count.toLocaleString()} {stats.count === 1 ? 'solve' : 'solves'} · {formatTotalTime(stats.totalTime)}
        </p>
        <dl className="stats-session-list">
          {rows.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd className="stats-session-value">{row.value}</dd>
              {row.delta === null ? null : (
                <dd>
                  <Delta value={row.delta} />
                </dd>
              )}
            </div>
          ))}
        </dl>
        {compared && previousSession ? (
          <p className="muted stats-session-note">Compared with {previousSession.name}</p>
        ) : null}
      </>
    )
  }

  return (
    <Panel role="region" aria-labelledby={headingId} className="stats-session">
      <div className="stats-session-header">
        <h2 id={headingId}>Current session</h2>
        {session ? <p className="muted">{session.name}</p> : null}
      </div>
      {body}
    </Panel>
  )
}

function difference(current: number | null, previous: number | null | undefined): number | null {
  return current === null || previous === null || previous === undefined ? null : current - previous
}

/** Change against the previous session. Lower times are better. */
function Delta({ value }: { value: number }) {
  const amount = formatDuration(Math.abs(value))
  if (amount === formatDuration(0)) {
    return (
      <span className="stats-delta same">
        <span aria-hidden="true">±{amount}</span>
        <span className="sr-only">Same as the previous session</span>
      </span>
    )
  }
  const faster = value < 0
  return (
    <span className={`stats-delta ${faster ? 'better' : 'worse'}`}>
      <span aria-hidden="true">
        {faster ? '−' : '+'}
        {amount}
      </span>
      <span className="sr-only">
        {amount} {faster ? 'faster' : 'slower'} than the previous session
      </span>
    </span>
  )
}

function ProgressChart({
  data,
  scale,
  onScaleChange,
}: {
  data: ChartPoint[]
  scale: StatsChartScale
  onScaleChange: (scale: StatsChartScale) => void
}) {
  const headingId = useId()
  const uiScale = useUiScale()
  const [hiddenSeries, setHiddenSeries] = useState<Partial<Record<SeriesKey, boolean>>>({})
  const xTicks = useMemo(() => solveTicks(data), [data])
  const tick = { fill: 'var(--text-muted)', fontSize: scalePx(12, uiScale) }

  const toggleSeries = (key: SeriesKey) =>
    setHiddenSeries((prev) => ({ ...prev, [key]: !prev[key] }))

  return (
    <Panel role="region" aria-labelledby={headingId} className="stats-progress stack">
      <div className="stats-panel-header">
        <h2 id={headingId}>Progress</h2>
        <div className="stats-range" role="group" aria-label="Graph scale">
          {STATS_CHART_SCALES.map((option) => (
            <Button
              key={option}
              type="button"
              variant="ghost"
              aria-pressed={scale === option}
              aria-label={STATS_CHART_SCALE_LABELS[option]}
              title={`${STATS_CHART_SCALE_LABELS[option]} solves`}
              onClick={() => onScaleChange(option)}
            >
              {option === 'all' ? STATS_CHART_SCALE_LABELS.all : option}
            </Button>
          ))}
        </div>
      </div>
      <div className="stats-chart">
        <div className="stats-chart-canvas">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="index"
                type="number"
                domain={['dataMin', 'dataMax']}
                ticks={xTicks}
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                minTickGap={scalePx(24, uiScale)}
                tick={tick}
              />
              <YAxis
                domain={['auto', 'auto']}
                tickLine={false}
                axisLine={false}
                tickFormatter={formatAxisSeconds}
                tick={tick}
                width={scalePx(40, uiScale)}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--surface)',
                  borderColor: 'var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  boxShadow: 'var(--shadow-md)',
                  color: 'var(--text)',
                }}
                itemStyle={{ color: 'var(--text)' }}
                labelStyle={{ color: 'var(--text-muted)', fontWeight: 600 }}
                labelFormatter={(label) => `Solve ${label}`}
                formatter={(value, name) => [formatChartSeconds(Number(value)), String(name)]}
                itemSorter={(item) => CHART_SERIES.findIndex((series) => series.key === item.dataKey)}
              />
              {CHART_SERIES.map((series) =>
                hiddenSeries[series.key] ? null : (
                  <Line
                    key={series.key}
                    type="monotone"
                    dataKey={series.key}
                    name={series.label}
                    stroke={series.color}
                    strokeWidth={series.strokeWidth}
                    strokeOpacity={series.strokeOpacity}
                    dot={false}
                    activeDot={{ r: scalePx(4, uiScale) }}
                    isAnimationActive={false}
                  />
                ),
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="stats-legend" role="group" aria-label="Chart series visibility">
        {CHART_SERIES.map((series) => {
          const hidden = Boolean(hiddenSeries[series.key])
          return (
            <Button
              key={series.key}
              type="button"
              variant="ghost"
              aria-pressed={!hidden}
              onClick={() => toggleSeries(series.key)}
            >
              <span aria-hidden="true" className="stats-legend-key" style={{ backgroundColor: series.color }} />
              {series.label}
            </Button>
          )
        })}
      </div>
    </Panel>
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
          ['Total time', formatTotalTime(stats.totalTime)],
          ['Std dev', stats.stdDev === null ? '—' : formatDuration(stats.stdDev)],
          ['Worst', formatAverage(stats.worst)],
        ]}
      />
    </Panel>
  )
}
