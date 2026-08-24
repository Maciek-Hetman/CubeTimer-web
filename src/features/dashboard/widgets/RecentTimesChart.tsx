import { useMemo } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useApp } from '../../../app/AppProviders'
import { effectiveTimeMs } from '../../../domain/models'
import { formatDuration } from '../../../domain/stats/formatTime'

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
    return <p className="muted">No times yet</p>
  }

  return (
    <div style={{ width: '100%', height: 180 }}>
      <ResponsiveContainer>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="index" hide />
          <YAxis
            tickFormatter={(value: number) => formatDuration(value)}
            width={56}
            stroke="var(--text-muted)"
          />
          <Tooltip formatter={(value) => formatDuration(Number(value))} />
          <Line type="monotone" dataKey="ms" stroke="var(--accent)" dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
