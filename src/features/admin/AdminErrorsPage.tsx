import { Fragment, useCallback, useEffect, useState } from 'react'
import { getErrorLogs } from '../../api/admin'
import { ApiError, type AdminErrorLog } from '../../api/types'
import { useApp } from '../../app/AppProviders'
import { Alert } from '../../ui/Alert'
import { Button } from '../../ui/Button'
import { EmptyState } from '../../ui/EmptyState'
import { Panel } from '../../ui/Panel'

export function AdminErrorsPage() {
  const { authenticatedRequest } = useApp()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [logs, setLogs] = useState<AdminErrorLog[]>([])
  const [nextCursor, setNextCursor] = useState<string | undefined>()
  const [expandedTraceId, setExpandedTraceId] = useState<number | null>(null)

  const load = useCallback(async (before?: string, append = false) => {
    setLoading(true)
    setError('')
    try {
      const response = await getErrorLogs(authenticatedRequest, { before })
      const incoming = response.errors || []
      setLogs((prev) => (append ? [...prev, ...incoming] : incoming))
      setNextCursor(response.next_cursor)
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setError('You do not have permission to view admin metrics.')
      } else if (err instanceof ApiError && err.status === 401) {
        setError('Sign in again to view admin metrics.')
      } else {
        setError(err instanceof ApiError ? err.message : 'Could not load error logs.')
      }
    } finally {
      setLoading(false)
    }
  }, [authenticatedRequest])

  useEffect(() => {
    void load()
  }, [load])

  if (loading && logs.length === 0) {
    return (
      <Panel className="stack" role="status">
        <p className="muted" style={{ margin: 0 }}>
          Loading error logs…
        </p>
      </Panel>
    )
  }

  return (
    <Panel className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2>Error Logs</h2>
        <Button onClick={() => void load()} loading={loading}>Refresh</Button>
      </div>
      
      {error && <Alert tone="error">{error}</Alert>}
      
      {logs.length === 0 ? (
        <EmptyState title="No errors" description="No errors were found." />
      ) : (
        <div className="admin-table-wrap">
          <table className="data-table admin-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Method</th>
                <th>Route</th>
                <th className="num">Status</th>
                <th>User ID</th>
                <th>Message</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <Fragment key={log.id}>
                  <tr>
                    <td style={{ whiteSpace: 'nowrap' }}>{new Date(log.created_at).toLocaleString()}</td>
                    <td>{log.method}</td>
                    <td>{log.route}</td>
                    <td className="num">{log.status}</td>
                    <td>{log.user_id ? <span className="chip">{log.user_id}</span> : <span className="muted">-</span>}</td>
                    <td>
                      <div><strong>{log.code}</strong></div>
                      <div className="muted">{log.message}</div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button 
                        className="btn compact ghost" 
                        onClick={() => setExpandedTraceId(expandedTraceId === log.id ? null : log.id)}
                      >
                        {expandedTraceId === log.id ? 'Hide Details' : 'View Details'}
                      </button>
                    </td>
                  </tr>
                  {expandedTraceId === log.id && (
                    <tr>
                      <td colSpan={7} style={{ padding: '16px', background: 'var(--surface-muted)', borderTop: '1px solid var(--border)' }}>
                        <pre style={{ margin: 0, padding: '12px', background: 'var(--surface)', boxShadow: 'var(--shadow-sm)', borderRadius: 'var(--radius-sm)', overflowX: 'auto', fontSize: '12px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                          <code>{JSON.stringify(log, null, 2)}</code>
                        </pre>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
          
          {nextCursor && (
            <div style={{ marginTop: '16px', textAlign: 'center' }}>
              <Button onClick={() => void load(nextCursor, true)} loading={loading}>
                Load More
              </Button>
            </div>
          )}
        </div>
      )}
    </Panel>
  )
}
