import { useMemo } from 'react'
import { useOutletContext } from 'react-router-dom'
import type { AdminErrorStatsPoint } from '../../api/types'
import { EmptyState } from '../../ui/EmptyState'
import { Panel } from '../../ui/Panel'
import type { AdminContextType } from './AdminLayout'

export function AdminErrorsPage() {
  const { errors, loading } = useOutletContext<AdminContextType>()

  const errorRows = useMemo(() => aggregateErrors(errors), [errors])

  if (loading && errors.length === 0) {
    return (
      <Panel className="stack" role="status">
        <p className="muted" style={{ margin: 0 }}>
          Loading error data…
        </p>
      </Panel>
    )
  }

  return (
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
