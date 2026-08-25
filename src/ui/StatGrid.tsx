import type { ReactNode } from 'react'

export function StatGrid({ items, columns }: { items: Array<[string, ReactNode]>; columns?: number }) {
  return (
    <div
      className="stat-grid"
      style={columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}
    >
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
