import { useMemo } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Link } from 'react-router-dom'
import { useApp } from '../../../app/AppProviders'
import { effectiveTimeMs } from '../../../domain/models'
import { formatDuration } from '../../../domain/stats/formatTime'
import { EmptyState } from '../../../ui/EmptyState'

export function RecentTimesChart() {
  const { solves } = useApp()
  const data = useMemo(
    () =>
      solves
        .slice(0, 50)
        .toReversed()
        .map((solve, index) => ({
          index: index + 1,
          ms: effectiveTimeMs(solve),
          label: solve.id,
        }))
        .filter((point) => point.ms !== null),
    [solves],
  )

  if (data.length === 0) {
    return (
      <EmptyState
        title="No times yet"
        description="Save a solve to see your trend."
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
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="index" hide />
          <YAxis tickFormatter={(value: number) => formatDuration(value)} width={56} stroke="var(--text-muted)" />
          <Tooltip
            contentStyle={{
              background: 'var(--surface-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 8,
            }}
            formatter={(value) => formatDuration(Number(value))}
          />
          <Line type="monotone" dataKey="ms" stroke="var(--accent)" dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
