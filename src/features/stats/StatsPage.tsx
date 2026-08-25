import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { useApp } from '../../app/AppProviders'
import { eventLabel } from '../../domain/models'
import { averageOfN, bestAverageOfN, bestSingle, meanOfSolves, worstSingle } from '../../domain/stats/averages'
import { formatAverage } from '../../domain/stats/formatTime'
import { EmptyState } from '../../ui/EmptyState'
import { PageHeader } from '../../ui/PageHeader'
import { Panel } from '../../ui/Panel'
import { StatGrid } from '../../ui/StatGrid'

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
  const { solves, sessions, settings, currentSession } = useApp()

  const sessionSolves = useMemo(
    () => (currentSession ? solves.filter((solve) => solve.sessionId === currentSession.id) : solves),
    [currentSession, solves],
  )

  const previousSession = useMemo(() => {
    if (!currentSession) return null
    const currentIndex = sessions.findIndex((s) => s.id === currentSession.id)
    if (currentIndex > 0) {
      return sessions[currentIndex - 1]
    }
    return null
  }, [sessions, currentSession])

  const previousSessionSolves = useMemo(
    () => (previousSession ? solves.filter((solve) => solve.sessionId === previousSession.id) : []),
    [previousSession, solves],
  )

  const summary = useMemo(
    () => ({
      count: solves.length,
      best: bestSingle(solves),
      worst: worstSingle(solves),
      mean: meanOfSolves(solves),
      ao5: averageOfN(solves, 5),
      ao12: averageOfN(solves, 12),
      bestAo5: bestAverageOfN(solves, 5),
      bestAo12: bestAverageOfN(solves, 12),
    }),
    [solves],
  )

  const sessionSummary = useMemo(
    () => ({
      count: sessionSolves.length,
      best: bestSingle(sessionSolves),
      mean: meanOfSolves(sessionSolves),
      ao5: averageOfN(sessionSolves, 5),
    }),
    [sessionSolves],
  )

  const previousSessionSummary = useMemo(
    () => ({
      best: bestSingle(previousSessionSolves),
      mean: meanOfSolves(previousSessionSolves),
      ao5: averageOfN(previousSessionSolves, 5),
    }),
    [previousSessionSolves],
  )

  const getDelta = (current: number | null, previous: number | null) => {
    if (current === null || previous === null) return null
    return current - previous
  }

  const chartData = useMemo(() => {
    const reversed = [...solves].reverse()
    return reversed.map((solve, i) => {
      const time = solve.penalty === 'dnf' ? null : solve.durationMs + (solve.penalty === 'plus_two' ? 2000 : 0)
      return {
        index: i + 1,
        time: time ? time / 1000 : null,
      }
    })
  }, [solves])

  return (
    <div className="stack">
      <PageHeader
        title="Stats"
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
          <div className="row wrap" style={{ gap: '16px' }}>
            <Panel style={{ flex: 1, minWidth: '150px' }}>
              <div className="muted" style={{ fontSize: '0.9em' }}>PB Time</div>
              <div style={{ fontSize: '1.5em', fontWeight: 'bold', color: 'var(--color-primary, #3b82f6)' }}>
                {formatAverage(summary.best)}
              </div>
            </Panel>
            <Panel style={{ flex: 1, minWidth: '150px' }}>
              <div className="muted" style={{ fontSize: '0.9em' }}>PB Ao5</div>
              <div style={{ fontSize: '1.5em', fontWeight: 'bold', color: 'var(--color-primary, #3b82f6)' }}>
                {formatAverage(summary.bestAo5)}
              </div>
            </Panel>
            <Panel style={{ flex: 1, minWidth: '150px' }}>
              <div className="muted" style={{ fontSize: '0.9em' }}>PB Ao12</div>
              <div style={{ fontSize: '1.5em', fontWeight: 'bold', color: 'var(--color-primary, #3b82f6)' }}>
                {formatAverage(summary.bestAo12)}
              </div>
            </Panel>
          </div>

          <Panel className="stack">
            <h2>Times Graph</h2>
            <div style={{ width: '100%', height: 250 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <Line type="monotone" dataKey="time" stroke="#8884d8" dot={false} isAnimationActive={false} />
                  <XAxis dataKey="index" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} width={40} />
                  <Tooltip labelFormatter={(label) => `Solve ${label}`} formatter={(val: any) => [`${Number(val).toFixed(2)}s`, 'Time']} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel className="stack">
            <h2>All-time</h2>
            <StatGrid
              items={[
                ['Solves', String(summary.count)],
                ['Worst', formatAverage(summary.worst)],
                ['Mean', formatAverage(summary.mean)],
                ['Ao5', formatAverage(summary.ao5)],
                ['Ao12', formatAverage(summary.ao12)],
              ]}
            />
          </Panel>

          <Panel className="stack">
            <h2>Current session</h2>
            <StatGrid
              items={[
                ['Solves', String(sessionSummary.count)],
                [
                  'Best',
                  <span key="best">
                    {formatAverage(sessionSummary.best)}
                    {previousSessionSolves.length > 0 && <DeltaBadge delta={getDelta(sessionSummary.best, previousSessionSummary.best)} />}
                  </span>,
                ],
                [
                  'Mean',
                  <span key="mean">
                    {formatAverage(sessionSummary.mean)}
                    {previousSessionSolves.length > 0 && <DeltaBadge delta={getDelta(sessionSummary.mean, previousSessionSummary.mean)} />}
                  </span>,
                ],
                [
                  'Ao5',
                  <span key="ao5">
                    {formatAverage(sessionSummary.ao5)}
                    {previousSessionSolves.length > 0 && <DeltaBadge delta={getDelta(sessionSummary.ao5, previousSessionSummary.ao5)} />}
                  </span>,
                ],
              ]}
            />
          </Panel>
        </>
      )}
    </div>
  )
}
