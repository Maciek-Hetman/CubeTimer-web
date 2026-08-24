import type { HTMLAttributes, ReactNode } from 'react'

export function Panel({
  muted = false,
  className = '',
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { muted?: boolean; children?: ReactNode }) {
  return (
    <div className={['panel', muted ? 'panel-muted' : '', className].filter(Boolean).join(' ')} {...props}>
      {children}
    </div>
  )
}
