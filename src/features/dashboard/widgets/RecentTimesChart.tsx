import { useMemo } from 'react'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Link } from 'react-router-dom'
import { useSolves } from '../../../contexts/SolvesContext'
import { effectiveTimeMs } from '../../../domain/models'
import { formatDuration } from '../../../domain/stats/formatTime'
import { EmptyState } from '../../../ui/EmptyState'

export function RecentTimesChart() {
  const { recentSolves } = useSolves()
  const data = useMemo(
    () =>
      recentSolves
        .slice(0, 20)
        .toReversed()
        .map((solve, index) => ({
          index: index + 1,
          ms: effectiveTimeMs(solve),
          label: solve.id,
        }))
        .filter((point) => point.ms !== null),
    [recentSolves],
  )

  if (data.length === 0) {
    return (
      <EmptyState
        title="No times yet"
        action={
          <Link className="btn primary" to="/">
            Open timer
          </Link>
        }
      />
    )
  }

  return (
    <div style={{ width: '100%', height: 180 }}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 0, bottom: 8, left: 0 }}>
          <defs>
            <linearGradient id="colorMs" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="index" hide />
          <YAxis
            hide
            domain={[
              (dataMin: number) => dataMin - 500,
              (dataMax: number) => dataMax + 500,
            ]}
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
            labelStyle={{ color: 'var(--text-muted)' }}
            formatter={(value) => formatDuration(Number(value))}
          />
          <Area
            type="monotone"
            dataKey="ms"
            name="Time"
            stroke="var(--accent)"
            fillOpacity={1}
            fill="url(#colorMs)"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
