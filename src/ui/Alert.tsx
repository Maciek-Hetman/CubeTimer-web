import type { ReactNode } from 'react'

export function Alert({
  tone = 'info',
  children,
  role = 'alert',
}: {
  tone?: 'info' | 'error' | 'success' | 'warning'
  children: ReactNode
  role?: 'alert' | 'status'
}) {
  const toneClass = tone === 'info' ? '' : tone
  return (
    <div className={['alert', toneClass].filter(Boolean).join(' ')} role={role}>
      {children}
    </div>
  )
}
