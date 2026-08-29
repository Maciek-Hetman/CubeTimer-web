import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { useLiveQuery } from 'dexie-react-hooks'
import { useApp } from '../../app/AppProviders'
import { eventLabel } from '../../domain/models'
import { formatAverage, formatTotalTime } from '../../domain/stats/formatTime'
import { collectChartSeries, computeSolveStats } from '../../data/repositories/solveStats'
import { Button } from '../../ui/Button'
import { EmptyState } from '../../ui/EmptyState'
import { PageHeader } from '../../ui/PageHeader'
import { Panel } from '../../ui/Panel'
import { StatGrid } from '../../ui/StatGrid'

const CHART_SERIES = [
  { key: 'time', label: 'Time', color: '#8884d8' },
  { key: 'ao5', label: 'Ao5', color: '#22c55e' },
  { key: 'ao12', label: 'Ao12', color: '#f59e0b' },
] as const

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null || isNaN(delta)) return null
  const isImprovement = delta < 0
  const color = isImprovement ? '#22c55e' : '#ef4444' // fallback to raw colors
  const sign = isImprovement ? '-' : '+'
  const absDelta = Math.abs(delta)
  return (
    <span style={{ color, fontSize: '0.85em', marginLeft: 8 }}>
      {sign}{formatAverage(absDelta)}
    </span>
  )
}

export function StatsPage() {
  const { solveStats, sessions, settings, currentSession, ownerId } = useApp()
  const [hiddenSeries, setHiddenSeries] = useState<Record<string, boolean>>({})

  const toggleSeries = (key: string) =>
    setHiddenSeries((prev) => ({ ...prev, [key]: !prev[key] }))

  const previousSession = useMemo(() => {
    if (!currentSession) return null
    const currentIndex = sessions.findIndex((s) => s.id === currentSession.id)
    if (currentIndex > 0) {
      return sessions[currentIndex - 1]
    }
    return null
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
    async () => collectChartSeries(ownerId, settings.event),
    [ownerId, settings.event],
  )

  const sessionSummary = useMemo(
    () => ({
      count: sessionStats?.count ?? 0,
      best: sessionStats?.best ?? null,
      mean: sessionStats?.mean ?? null,
      stdDev: sessionStats?.stdDev ?? null,
      totalTime: sessionStats?.totalTime ?? 0,
      ao5: sessionStats?.ao5 ?? null,
      ao50: sessionStats?.ao50 ?? null,
      ao100: sessionStats?.ao100 ?? null,
    }),
    [sessionStats],
  )

  const previousSessionSummary = useMemo(
    () => ({
      best: previousSessionStats?.best ?? null,
      mean: previousSessionStats?.mean ?? null,
      stdDev: previousSessionStats?.stdDev ?? null,
      ao5: previousSessionStats?.ao5 ?? null,
      ao50: previousSessionStats?.ao50 ?? null,
      ao100: previousSessionStats?.ao100 ?? null,
    }),
    [previousSessionStats],
  )

  const getDelta = (current: number | null, previous: number | null) => {
    if (current === null || previous === null) return null
    return current - previous
  }

  return (
    <div className="stack">
      <PageHeader
        title="Stats"
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
          <div className="row wrap" style={{ gap: '16px' }}>
            <Panel style={{ flex: 1, minWidth: '150px' }}>
              <div className="muted" style={{ fontSize: '0.9em' }}>PB Time</div>
              <div style={{ fontSize: '1.5em', fontWeight: 'bold', color: 'var(--color-primary, #3b82f6)' }}>
                {formatAverage(solveStats.best)}
              </div>
            </Panel>
            <Panel style={{ flex: 1, minWidth: '150px' }}>
              <div className="muted" style={{ fontSize: '0.9em' }}>PB Ao5</div>
              <div style={{ fontSize: '1.5em', fontWeight: 'bold', color: 'var(--color-primary, #3b82f6)' }}>
                {formatAverage(solveStats.bestAo5)}
              </div>
            </Panel>
            <Panel style={{ flex: 1, minWidth: '150px' }}>
              <div className="muted" style={{ fontSize: '0.9em' }}>PB Ao12</div>
              <div style={{ fontSize: '1.5em', fontWeight: 'bold', color: 'var(--color-primary, #3b82f6)' }}>
                {formatAverage(solveStats.bestAo12)}
              </div>
            </Panel>
            <Panel style={{ flex: 1, minWidth: '150px' }}>
              <div className="muted" style={{ fontSize: '0.9em' }}>PB Ao50</div>
              <div style={{ fontSize: '1.5em', fontWeight: 'bold', color: 'var(--color-primary, #3b82f6)' }}>
                {formatAverage(solveStats.bestAo50)}
              </div>
            </Panel>
            <Panel style={{ flex: 1, minWidth: '150px' }}>
              <div className="muted" style={{ fontSize: '0.9em' }}>PB Ao100</div>
              <div style={{ fontSize: '1.5em', fontWeight: 'bold', color: 'var(--color-primary, #3b82f6)' }}>
                {formatAverage(solveStats.bestAo100)}
              </div>
            </Panel>
          </div>

          <Panel className="stack">
            <h2>Times Graph</h2>
            <div style={{ width: '100%', height: 250 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData ?? []} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  {CHART_SERIES.map(
                    (series) =>
                      !hiddenSeries[series.key] && (
                        <Line
                          key={series.key}
                          type="monotone"
                          dataKey={series.key}
                          name={series.label}
                          stroke={series.color}
                          dot={false}
                          isAnimationActive={false}
                        />
                      ),
                  )}
                  <XAxis dataKey="index" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} width={40} />
                  <Tooltip
                    labelFormatter={(label) => `Solve ${label}`}
                    formatter={(value, name) => [`${Number(value).toFixed(2)}s`, String(name)]}
                  />
                  <Legend />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="segmented" role="group" aria-label="Chart series visibility">
              {CHART_SERIES.map((series) => {
                const hidden = Boolean(hiddenSeries[series.key])
                return (
                  <Button
                    key={series.key}
                    type="button"
                    variant={hidden ? 'default' : 'primary'}
                    aria-pressed={!hidden}
                    onClick={() => toggleSeries(series.key)}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        display: 'inline-block',
                        width: 10,
                        height: 10,
                        marginRight: 6,
                        borderRadius: '50%',
                        backgroundColor: series.color,
                        opacity: hidden ? 0.35 : 1,
                      }}
                    />
                    {series.label}
                  </Button>
                )
              })}
            </div>
          </Panel>

          <div className="row wrap" style={{ gap: 'var(--space-4)', alignItems: 'flex-start' }}>
            <Panel className="stack" style={{ flex: 1, minWidth: '250px' }}>
              <h2>All-time</h2>
              <StatGrid
                items={[
                  ['Solves', String(solveStats.count)],
                  ['Total Time', formatTotalTime(solveStats.totalTime)],
                  ['Worst', formatAverage(solveStats.worst)],
                  ['Mean', formatAverage(solveStats.mean)],
                  ['Std Dev', formatAverage(solveStats.stdDev)],
                  ['Ao5', formatAverage(solveStats.ao5)],
                  ['Ao12', formatAverage(solveStats.ao12)],
                  ['Ao50', formatAverage(solveStats.ao50)],
                  ['Ao100', formatAverage(solveStats.ao100)],
                ]}
              />
            </Panel>

            <Panel className="stack" style={{ flex: 1, minWidth: '250px' }}>
              <h2>Current session</h2>
              <StatGrid
                items={[
                  ['Solves', String(sessionSummary.count)],
                  ['Total Time', formatTotalTime(sessionSummary.totalTime)],
                  [
                    'Best',
                    <span key="best">
                      {formatAverage(sessionSummary.best)}
                      {previousSessionSummary.best !== null && <DeltaBadge delta={getDelta(sessionSummary.best, previousSessionSummary.best)} />}
                    </span>,
                  ],
                  [
                    'Mean',
                    <span key="mean">
                      {formatAverage(sessionSummary.mean)}
                      {previousSessionSummary.mean !== null && <DeltaBadge delta={getDelta(sessionSummary.mean, previousSessionSummary.mean)} />}
                    </span>,
                  ],
                  [
                    'Std Dev',
                    <span key="stdDev">
                      {formatAverage(sessionSummary.stdDev)}
                      {previousSessionSummary.stdDev !== null && <DeltaBadge delta={getDelta(sessionSummary.stdDev, previousSessionSummary.stdDev)} />}
                    </span>,
                  ],
                  [
                    'Ao5',
                    <span key="ao5">
                      {formatAverage(sessionSummary.ao5)}
                      {previousSessionSummary.ao5 !== null && <DeltaBadge delta={getDelta(sessionSummary.ao5, previousSessionSummary.ao5)} />}
                    </span>,
                  ],
                  [
                    'Ao50',
                    <span key="ao50">
                      {formatAverage(sessionSummary.ao50)}
                      {previousSessionSummary.ao50 !== null && <DeltaBadge delta={getDelta(sessionSummary.ao50, previousSessionSummary.ao50)} />}
                    </span>,
                  ],
                  [
                    'Ao100',
                    <span key="ao100">
                      {formatAverage(sessionSummary.ao100)}
                      {previousSessionSummary.ao100 !== null && <DeltaBadge delta={getDelta(sessionSummary.ao100, previousSessionSummary.ao100)} />}
                    </span>,
                  ],
                ]}
              />
            </Panel>
          </div>
        </>
      )}
    </div>
  )
}