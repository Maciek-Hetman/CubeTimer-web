import type { ReactNode } from 'react'

export function Field({
  label,
  children,
  className = '',
}: {
  label: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <label className={['field', className].filter(Boolean).join(' ')}>
      <span>{label}</span>
      {children}
    </label>
  )
}
