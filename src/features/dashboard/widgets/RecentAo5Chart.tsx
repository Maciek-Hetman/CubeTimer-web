import { useMemo } from 'react'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Link } from 'react-router-dom'
import { useApp } from '../../../app/AppProviders'
import { averageOfN } from '../../../domain/stats/averages'
import { formatDuration } from '../../../domain/stats/formatTime'
import { EmptyState } from '../../../ui/EmptyState'

export function RecentAo5Chart() {
  const { solves } = useApp()
  const data = useMemo(() => {
    const points = []
    for (let i = 0; i < 20; i++) {
      if (i + 4 >= solves.length) break
      const ao5 = averageOfN(solves.slice(i, i + 5), 5)
      if (ao5 !== null) {
        points.push({
          ms: ao5,
          label: solves[i].id,
        })
      }
    }
    return points.toReversed().map((point, index) => ({
      ...point,
      index: index + 1,
    }))
  }, [solves])

  if (data.length === 0) {
    return (
      <EmptyState
        title="No Ao5s yet"
        description="Complete 5 solves to see your Ao5 trend."
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
            <linearGradient id="colorMsAo5" x1="0" y1="0" x2="0" y2="1">
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
              background: 'var(--surface-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 8,
            }}
            formatter={(value) => formatDuration(Number(value))}
          />
          <Area
            type="monotone"
            dataKey="ms"
            name="Ao5"
            stroke="var(--accent)"
            fillOpacity={1}
            fill="url(#colorMsAo5)"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
