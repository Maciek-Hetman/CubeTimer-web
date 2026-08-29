import { useMemo } from 'react'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Link } from 'react-router-dom'
import { useApp } from '../../../app/AppProviders'
import { averageOfN } from '../../../domain/stats/averages'
import { formatDuration } from '../../../domain/stats/formatTime'
import { EmptyState } from '../../../ui/EmptyState'

export function RecentAo5Chart() {
  const { recentSolves } = useApp()
  const data = useMemo(() => {
    const points = []
    for (let i = 0; i < 20; i++) {
      if (i + 4 >= recentSolves.length) break
      const ao5 = averageOfN(recentSolves.slice(i, i + 5), 5)
      if (ao5 !== null) {
        points.push({
          ms: ao5,
          label: recentSolves[i].id,
        })
      }
    }
    return points.toReversed().map((point, index) => ({
      ...point,
      index: index + 1,
    }))
  }, [recentSolves])

  if (data.length === 0) {
    return (
      <EmptyState
        title="No Ao5s yet"
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
              background: 'var(--surface)',
              borderRadius: 8,
              boxShadow: 'var(--shadow-md)',
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
