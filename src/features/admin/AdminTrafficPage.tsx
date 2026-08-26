import { useOutletContext } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { EmptyState } from '../../ui/EmptyState'
import { Panel } from '../../ui/Panel'
import type { AdminContextType } from './AdminLayout'

const chartTooltipStyle = {
  background: 'var(--surface-elevated)',
  border: '1px solid var(--border)',
  borderRadius: 8,
}

export function AdminTrafficPage() {
  const { requests, loading } = useOutletContext<AdminContextType>()

  if (loading && !requests) {
    return (
      <Panel className="stack" role="status">
        <p className="muted" style={{ margin: 0 }}>
          Loading traffic data…
        </p>
      </Panel>
    )
  }

  if (!requests) return null

  const requestPoints = requests.points ?? []

  return (
    <Panel className="stack">
      <h2>Requests</h2>
      {requestPoints.length === 0 ? (
        <EmptyState title="No request data" description="There are no requests in this range." />
      ) : (
        <div className="admin-charts">
          <div className="admin-chart">
            <h3>Volume and status</h3>
            <div className="admin-chart-canvas">
              <ResponsiveContainer>
                <BarChart data={requestPoints} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="bucket" tickFormatter={formatBucket} stroke="var(--text-muted)" minTickGap={24} />
                  <YAxis width={40} stroke="var(--text-muted)" allowDecimals={false} />
                  <Tooltip contentStyle={chartTooltipStyle} labelFormatter={formatBucket} />
                  <Legend />
                  <Bar dataKey="status_2xx" name="2xx" stackId="status" fill="var(--success)" />
                  <Bar dataKey="status_3xx" name="3xx" stackId="status" fill="var(--accent)" />
                  <Bar dataKey="status_4xx" name="4xx" stackId="status" fill="var(--warning)" />
                  <Bar dataKey="status_5xx" name="5xx" stackId="status" fill="var(--danger)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="admin-chart">
            <h3>Latency</h3>
            <div className="admin-chart-canvas">
              <ResponsiveContainer>
                <LineChart data={requestPoints} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="bucket" tickFormatter={formatBucket} stroke="var(--text-muted)" minTickGap={24} />
                  <YAxis width={48} stroke="var(--text-muted)" tickFormatter={(value: number) => `${Math.round(value)}`} />
                  <Tooltip
                    contentStyle={chartTooltipStyle}
                    labelFormatter={formatBucket}
                    formatter={(value) => [`${Number(value).toFixed(1)} ms`, undefined]}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="average_duration_ms"
                    name="Average ms"
                    stroke="var(--accent)"
                    dot={false}
                    strokeWidth={2}
                  />
                  <Line
                    type="monotone"
                    dataKey="max_duration_ms"
                    name="Max ms"
                    stroke="var(--danger)"
                    dot={false}
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </Panel>
  )
}

function formatBucket(value: unknown) {
  if (typeof value !== 'string') {
    return String(value ?? '')
  }
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) {
    return value
  }
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
