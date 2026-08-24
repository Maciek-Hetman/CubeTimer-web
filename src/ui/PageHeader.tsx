import type { ReactNode } from 'react'

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className="page-header row wrap" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <div className="stack" style={{ gap: 4 }}>
        <h1>{title}</h1>
        {subtitle ? <p className="muted">{subtitle}</p> : null}
      </div>
      {actions}
    </header>
  )
}
