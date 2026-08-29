import type { ReactNode } from 'react'

export function StatGrid({
  items,
  columns,
  size = 'normal',
  className,
}: {
  items: Array<[string, ReactNode]>
  columns?: number
  size?: 'normal' | 'large'
  className?: string
}) {
  return (
    <div
      className={`stat-grid ${size === 'large' ? 'stat-grid-large' : ''} ${className ?? ''}`}
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
