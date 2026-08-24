import type { ReactNode } from 'react'

export function StatGrid({ items }: { items: Array<[string, string]> }) {
  return (
    <div className="stat-grid">
      {items.map(([label, value]) => (
        <div key={label} className="stat-card">
          <div className="muted">{label}</div>
          <div className="value">{value}</div>
        </div>
      ))}
    </div>
  )
}

export function Toast({ children }: { children: ReactNode }) {
  return (
    <div className="toast" role="status" aria-live="polite">
      {children}
    </div>
  )
}
