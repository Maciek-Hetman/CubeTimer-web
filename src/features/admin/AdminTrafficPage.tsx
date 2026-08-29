import { useMemo } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
  background: 'var(--surface)',
  borderRadius: 8,
  boxShadow: 'var(--shadow-md)',
}

const REQUEST_TYPE_LABELS: Record<string, string> = {
  auth: 'Auth',
  account: 'Account',
  sync: 'Sync',
  snapshot: 'Snapshot',
  sessions: 'Sessions',
  stats: 'Stats',
  other: 'Other',
}

const REQUEST_TYPE_COLORS: Record<string, string> = {
  auth: 'var(--accent)',
  account: 'var(--success)',
  sync: 'var(--warning)',
  snapshot: 'var(--danger)',
  sessions: 'var(--accent-soft)',
  stats: 'var(--warning-soft)',
  other: 'var(--text-muted)',
}

export function AdminTrafficPage() {
  const { requests, requestTypes, loading } = useOutletContext<AdminContextType>()

  const chartData = useMemo(() => {
    if (!requests || !requests.points) return []
    return requests.points.map(point => {
      const minutesInBucket = requests.interval === 'day' ? 24 * 60 : 60
      const throughputRpm = point.request_count / minutesInBucket
      
      const successRate = point.request_count > 0 ? (point.status_2xx / point.request_count) * 100 : 0
      const errorRate = point.request_count > 0 ? ((point.status_4xx + point.status_5xx) / point.request_count) * 100 : 0
      
      return {
        ...point,
        throughput_rpm: throughputRpm,
        success_rate: successRate,
        error_rate: errorRate
      }
    })
  }, [requests])

  const typeData = useMemo(() => {
    if (!requestTypes || !requestTypes.types) return []
    return [...requestTypes.types]
      .sort((a, b) => b.request_count - a.request_count)
      .map(entry => ({
        ...entry,
        label: REQUEST_TYPE_LABELS[entry.type] ?? entry.type,
      }))
  }, [requestTypes])

  const typeTotal = useMemo(
    () => typeData.reduce((sum, entry) => sum + entry.request_count, 0),
    [typeData],
  )

  if (loading && (!requests || chartData.length === 0)) {
    return (
      <Panel className="stack" role="status">
        <p className="muted" style={{ margin: 0 }}>
          Loading traffic data…
        </p>
      </Panel>
    )
  }

  if (!requests) return null

  return (
    <Panel className="stack">
      <h2>Requests</h2>
      {chartData.length === 0 ? (
        <EmptyState title="No request data" description="There are no requests in this range." />
      ) : (
        <div className="admin-charts">
          <div className="admin-chart">
            <h3>Request types</h3>
            {typeData.length === 0 ? (
              <EmptyState title="No request type data" description="There are no requests in this range." />
            ) : (
              <>
                <div className="admin-chart-canvas">
                  <ResponsiveContainer>
                    <BarChart data={typeData} layout="vertical" margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis type="number" stroke="var(--text-muted)" allowDecimals={false} />
                      <YAxis type="category" dataKey="label" width={84} stroke="var(--text-muted)" />
                      <Tooltip
                        contentStyle={chartTooltipStyle}
                        formatter={(value) => [`${Number(value).toLocaleString()} requests`, undefined]}
                      />
                      <Bar dataKey="request_count" name="Requests" radius={[0, 4, 4, 0]}>
                        {typeData.map(entry => (
                          <Cell key={entry.type} fill={REQUEST_TYPE_COLORS[entry.type] ?? 'var(--text-muted)'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="admin-table-wrap">
                  <table className="data-table admin-table">
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th className="num">Requests</th>
                        <th className="num">Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {typeData.map(entry => (
                        <tr key={entry.type}>
                          <td>{entry.label}</td>
                          <td className="num">{entry.request_count.toLocaleString()}</td>
                          <td className="num">
                            {typeTotal > 0 ? `${((entry.request_count / typeTotal) * 100).toFixed(1)}%` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="muted" style={{ marginTop: 'var(--space-2)', marginBottom: 0, fontSize: 'var(--text-sm)' }}>
                    "Other" covers unmatched and unknown routes, such as 404s, as well as the API version endpoint
                    ({'/v1'}). Health checks and admin stats requests are not recorded at all.
                  </p>
                </div>
              </>
            )}
          </div>
          <div className="admin-chart">
            <h3>Volume and status</h3>
            <div className="admin-chart-canvas">
              <ResponsiveContainer>
                <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
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
            <h3>Throughput</h3>
            <div className="admin-chart-canvas">
              <ResponsiveContainer>
                <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="bucket" tickFormatter={formatBucket} stroke="var(--text-muted)" minTickGap={24} />
                  <YAxis width={48} stroke="var(--text-muted)" tickFormatter={(value: number) => `${value.toFixed(1)}`} />
                  <Tooltip
                    contentStyle={chartTooltipStyle}
                    labelFormatter={formatBucket}
                    formatter={(value) => [`${Number(value).toFixed(2)} RPM`, undefined]}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="throughput_rpm"
                    name="Requests / min"
                    stroke="var(--accent)"
                    dot={false}
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="admin-chart">
            <h3>Success & Error Rates</h3>
            <div className="admin-chart-canvas">
              <ResponsiveContainer>
                <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="bucket" tickFormatter={formatBucket} stroke="var(--text-muted)" minTickGap={24} />
                  <YAxis width={48} stroke="var(--text-muted)" domain={[0, 100]} tickFormatter={(value: number) => `${Math.round(value)}%`} />
                  <Tooltip
                    contentStyle={chartTooltipStyle}
                    labelFormatter={formatBucket}
                    formatter={(value) => [`${Number(value).toFixed(2)}%`, undefined]}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="success_rate"
                    name="Success Rate"
                    stroke="var(--success)"
                    dot={false}
                    strokeWidth={2}
                  />
                  <Line
                    type="monotone"
                    dataKey="error_rate"
                    name="Error Rate"
                    stroke="var(--danger)"
                    dot={false}
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="admin-chart">
            <h3>Latency</h3>
            <div className="admin-chart-canvas">
              <ResponsiveContainer>
                <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
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
