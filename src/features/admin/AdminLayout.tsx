import { useCallback, useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { getErrorStats, getOverviewStats, getRequestStats } from '../../api/admin'
import { ApiError, type AdminErrorStatsPoint, type AdminOverviewStats, type AdminRequestStats } from '../../api/types'
import { useApp } from '../../app/AppProviders'
import { Alert } from '../../ui/Alert'
import { Button } from '../../ui/Button'
import { PageHeader } from '../../ui/PageHeader'
import { ADMIN_RANGE_LABELS, ADMIN_RANGES, adminStatsQueryForRange, type AdminRange } from './adminRange'

export interface AdminContextType {
  overview: AdminOverviewStats | null
  requests: AdminRequestStats | null
  errors: AdminErrorStatsPoint[]
  loading: boolean
  error: string
  load: () => Promise<void>
}

export function AdminLayout() {
  const { authenticatedRequest } = useApp()
  const location = useLocation()
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

  const isOverview = location.pathname === '/admin' || location.pathname === '/admin/overview'

  return (
    <div className="stack admin-dashboard">
      <PageHeader
        title="Admin"
        subtitle="CubeSync platform metrics"
        actions={
          <div className="row wrap admin-toolbar">
            {!isOverview && (
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
            )}
            <Button type="button" onClick={() => void load()} loading={loading}>
              Retry
            </Button>
          </div>
        }
      />

      <nav className="admin-tabs" aria-label="Admin">
        <NavLink to="/admin/overview" end>Overview</NavLink>
        <NavLink to="/admin/traffic" end>Traffic</NavLink>
        <NavLink to="/admin/errors" end>Errors</NavLink>
      </nav>

      {error ? <Alert tone="error">{error}</Alert> : null}

      <Outlet context={{ overview, requests, errors, loading, error, load } satisfies AdminContextType} />
    </div>
  )
}
