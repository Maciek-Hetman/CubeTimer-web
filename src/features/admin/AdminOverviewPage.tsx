import { useOutletContext } from 'react-router-dom'
import { Panel } from '../../ui/Panel'
import { StatGrid } from '../../ui/StatGrid'
import type { AdminContextType } from './AdminLayout'

export function AdminOverviewPage() {
  const { overview, loading } = useOutletContext<AdminContextType>()

  if (loading && !overview) {
    return (
      <Panel className="stack" role="status">
        <p className="muted" style={{ margin: 0 }}>
          Loading platform metrics…
        </p>
      </Panel>
    )
  }

  if (!overview) return null

  const verificationRate = overview.total_users > 0 
    ? (overview.verified_users / overview.total_users) * 100 
    : 0
  const activeRatio30d = overview.total_users > 0 
    ? (overview.active_users_30d / overview.total_users) * 100 
    : 0
  const avgSolvesSession = overview.total_sessions > 0 
    ? overview.total_solves / overview.total_sessions 
    : 0

  return (
    <div className="stack">
      <Panel className="stack">
        <h2>Key Metrics</h2>
        <StatGrid
          items={[
            ['Verification Rate', `${verificationRate.toFixed(1)}%`],
            ['30d Active Ratio', `${activeRatio30d.toFixed(1)}%`],
            ['Avg Solves / Session', formatCount(Math.round(avgSolvesSession))],
          ]}
        />
      </Panel>

      <Panel className="stack">
        <h2>User Base</h2>
        <StatGrid
          items={[
            ['Total Users', formatCount(overview.total_users)],
            ['Verified', formatCount(overview.verified_users)],
            ['Devices', formatCount(overview.total_devices)],
            ['Sessions', formatCount(overview.total_sessions)],
            ['Solves', formatCount(overview.total_solves)],
          ]}
        />
      </Panel>

      <Panel className="stack">
        <h2>Growth & Engagement</h2>
        <StatGrid
          items={[
            ['New 24h', formatCount(overview.new_users_24h)],
            ['New 7d', formatCount(overview.new_users_7d)],
            ['New 30d', formatCount(overview.new_users_30d)],
            ['Active 24h', formatCount(overview.active_users_24h)],
            ['Active 7d', formatCount(overview.active_users_7d)],
            ['Active 30d', formatCount(overview.active_users_30d)],
          ]}
        />
      </Panel>
    </div>
  )
}

function formatCount(value: number) {
  return value.toLocaleString()
}
