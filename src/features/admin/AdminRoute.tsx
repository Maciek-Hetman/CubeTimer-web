import type { ReactNode } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useApp } from '../../app/AppProviders'
import { EmptyState } from '../../ui/EmptyState'
import { PageHeader } from '../../ui/PageHeader'

export function AdminRoute({ children }: { children: ReactNode }) {
  const { user } = useApp()
  const location = useLocation()

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (user.user_role !== 'admin') {
    return (
      <div className="stack">
        <PageHeader title="Admin" subtitle="Platform metrics" />
        <EmptyState
          title="Access denied"
          description="This dashboard is only available to administrators."
          action={
            <Link className="btn primary" to="/">
              Back to timer
            </Link>
          }
        />
      </div>
    )
  }

  return children
}
