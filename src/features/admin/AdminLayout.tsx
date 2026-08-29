import { useCallback, useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { getOverviewStats, getRequestStats, getRequestTypeStats } from '../../api/admin'
import {
  ApiError,
  type AdminOverviewStats,
  type AdminRequestStats,
  type AdminRequestTypeStats,
} from '../../api/types'
import { useApp } from '../../app/AppProviders'
import { Alert } from '../../ui/Alert'
import { Button } from '../../ui/Button'
import { PageHeader } from '../../ui/PageHeader'
import { ADMIN_RANGE_LABELS, ADMIN_RANGES, adminStatsQueryForRange, type AdminRange } from './adminRange'

export interface AdminContextType {
  overview: AdminOverviewStats | null
  requests: AdminRequestStats | null
  requestTypes: AdminRequestTypeStats | null
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
  const [requestTypes, setRequestTypes] = useState<AdminRequestTypeStats | null>(null)
  const loadIdRef = useRef(0)

  const load = useCallback(async () => {
    const loadId = ++loadIdRef.current
    setLoading(true)
    setError('')
    const query = adminStatsQueryForRange(range)
    try {
      const [nextOverview, nextRequests, nextRequestTypes] = await Promise.all([
        getOverviewStats(authenticatedRequest),
        getRequestStats(authenticatedRequest, query),
        getRequestTypeStats(authenticatedRequest, query),
      ])
      if (loadId !== loadIdRef.current) {
        return
      }
      setOverview(nextOverview)
      setRequests(nextRequests)
      setRequestTypes(nextRequestTypes)
    } catch (err) {
      if (loadId !== loadIdRef.current) {
        return
      }
      setOverview(null)
      setRequests(null)
      setRequestTypes(null)
      if (err instanceof ApiError && err.status === 403) {
        setError('You do not have permission to view admin metrics.')
      } else if (err instanceof ApiError && err.status === 401) {
        setError('Sign in again to view admin metrics.')
      } else {
        setError(err instanceof ApiError ? err.message : 'Could not load admin metrics.')
      }
    } finally {
      if (loadId === loadIdRef.current) {
        setLoading(false)
      }
    }
  }, [authenticatedRequest, range])

  useEffect(() => {
    void load()
  }, [load])

  const isOverview = location.pathname === '/admin' || location.pathname === '/admin/overview'
  const isErrors = location.pathname === '/admin/errors'

  return (
    <div className="stack admin-dashboard">
      <PageHeader
        title="Admin"
        subtitle="CubeSync platform metrics"
        actions={
          <div className="row wrap admin-toolbar">
            {!isOverview && !isErrors && (
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
            {!isErrors && (
              <Button type="button" onClick={() => void load()} loading={loading}>
                Retry
              </Button>
            )}
          </div>
        }
      />

      <nav className="admin-tabs" aria-label="Admin">
        <NavLink to="/admin/overview" end>Overview</NavLink>
        <NavLink to="/admin/traffic" end>Traffic</NavLink>
        <NavLink to="/admin/errors" end>Errors</NavLink>
      </nav>

      {error ? <Alert tone="error">{error}</Alert> : null}

      <Outlet context={{ overview, requests, requestTypes, loading, error, load } satisfies AdminContextType} />
    </div>
  )
}
