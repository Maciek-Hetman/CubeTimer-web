import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { getErrorStats, getOverviewStats, getRequestStats } from '../../api/admin'
import { ApiError, type AdminErrorStatsPoint, type AdminOverviewStats, type AdminRequestStats } from '../../api/types'
import { useApp } from '../../app/AppProviders'
import { Alert } from '../../ui/Alert'
import { Button } from '../../ui/Button'
import { EmptyState } from '../../ui/EmptyState'
import { PageHeader } from '../../ui/PageHeader'
import { Panel } from '../../ui/Panel'
import { StatGrid } from '../../ui/StatGrid'
import { ADMIN_RANGE_LABELS, ADMIN_RANGES, adminStatsQueryForRange, type AdminRange } from './adminRange'

const chartTooltipStyle = {
  background: 'var(--surface-elevated)',
  border: '1px solid var(--border)',
  borderRadius: 8,
}

export function AdminDashboardPage() {
  const { authenticatedRequest } = useApp()
  const [range, setRange] = useState<AdminRange>('7d')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [overview, setOverview] = useState<AdminOverviewStats | null>(null)
  const [requests, setRequests] = useState<AdminRequestStats | null>(null)
  const [errors, setErrors] = useState<AdminErrorStatsPoint[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const query = adminStatsQueryForRange(range)
    try {
      const [nextOverview, nextRequests, nextErrors] = await Promise.all([
        getOverviewStats(authenticatedRequest),
        getRequestStats(authenticatedRequest, query),
        getErrorStats(authenticatedRequest, query),
      ])
      setOverview(nextOverview)
      setRequests(nextRequests)
      setErrors(nextErrors.points)
    } catch (err) {
      setOverview(null)
      setRequests(null)
      setErrors([])
      if (err instanceof ApiError && err.status === 403) {
        setError('You do not have permission to view admin metrics.')
      } else if (err instanceof ApiError && err.status === 401) {
        setError('Sign in again to view admin metrics.')
      } else {
        setError(err instanceof ApiError ? err.message : 'Could not load admin metrics.')
      }
    } finally {
      setLoading(false)
    }
  }, [authenticatedRequest, range])

  useEffect(() => {
    void load()
  }, [load])

  const requestPoints = requests?.points ?? []
  const errorRows = useMemo(() => aggregateErrors(errors), [errors])

  return (
    <div className="stack admin-dashboard">
      <PageHeader
        title="Admin"
        subtitle="CubeSync platform metrics"
        actions={
          <div className="row wrap admin-toolbar">
            <div className="segmented" role="group" aria-label="Time range">
              {ADMIN_RANGES.map((value) => (
                <Button
                  key={value}
                  type="button"
                  variant={range === value ? 'primary' : 'default'}
                  aria-pressed={range === value}
                  onClick={() => setRange(value)}
                >
                  {ADMIN_RANGE_LABELS[value]}
                </Button>
              ))}
            </div>
            <Button type="button" onClick={() => void load()} loading={loading}>
              Retry
            </Button>
          </div>
        }
      />

      {error ? <Alert tone="error">{error}</Alert> : null}

      {loading && !overview ? (
        <Panel className="stack" role="status">
          <p className="muted" style={{ margin: 0 }}>
            Loading platform metrics…
          </p>
        </Panel>
      ) : null}

      {overview ? (
        <>
          <Panel className="stack">
            <h2>Overview</h2>
            <StatGrid
              items={[
                ['Users', formatCount(overview.total_users)],
                ['Verified', formatCount(overview.verified_users)],
                ['New 24h', formatCount(overview.new_users_24h)],
                ['New 7d', formatCount(overview.new_users_7d)],
                ['New 30d', formatCount(overview.new_users_30d)],
                ['Active 24h', formatCount(overview.active_users_24h)],
                ['Active 7d', formatCount(overview.active_users_7d)],
                ['Active 30d', formatCount(overview.active_users_30d)],
                ['Devices', formatCount(overview.total_devices)],
                ['Sessions', formatCount(overview.total_sessions)],
                ['Solves', formatCount(overview.total_solves)],
              ]}
            />
          </Panel>

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

          <Panel className="stack">
            <h2>Errors by route</h2>
            {errorRows.length === 0 ? (
              <EmptyState title="No errors" description="No 4xx or 5xx responses were recorded in this range." />
            ) : (
              <div className="admin-table-wrap">
                <table className="data-table admin-table">
                  <thead>
                    <tr>
                      <th>Method</th>
                      <th>Route</th>
                      <th className="num">Status</th>
                      <th className="num">Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {errorRows.map((row) => (
                      <tr key={`${row.method}:${row.route}:${row.status_code}`}>
                        <td>{row.method}</td>
                        <td>{row.route}</td>
                        <td className="num">{row.status_code}</td>
                        <td className="num">{formatCount(row.request_count)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      ) : null}
    </div>
  )
}

function aggregateErrors(points: AdminErrorStatsPoint[]) {
  const totals = new Map<string, AdminErrorStatsPoint>()
  for (const point of points) {
    const key = `${point.method}\0${point.route}\0${point.status_code}`
    const current = totals.get(key)
    if (current) {
      current.request_count += point.request_count
    } else {
      totals.set(key, {
        bucket: point.bucket,
        method: point.method,
        route: point.route,
        status_code: point.status_code,
        request_count: point.request_count,
      })
    }
  }
  return [...totals.values()].sort((a, b) => b.request_count - a.request_count || a.route.localeCompare(b.route))
}

function formatCount(value: number) {
  return value.toLocaleString()
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
