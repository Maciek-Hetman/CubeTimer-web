import type { ReactNode } from 'react'
import { Panel } from './Panel'

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description?: ReactNode
  action?: ReactNode
}) {
  return (
    <Panel className="empty-state stack">
      <h2>{title}</h2>
      {description ? <p className="muted">{description}</p> : null}
      {action}
    </Panel>
  )
}
