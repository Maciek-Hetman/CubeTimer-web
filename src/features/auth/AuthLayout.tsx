import type { ReactNode } from 'react'
import { AppBrand } from '../../ui/AppBrand'
import { Panel } from '../../ui/Panel'

export function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="auth-layout">
      <AppBrand />
      <Panel className="stack">
        <h1>{title}</h1>
        {children}
      </Panel>
    </div>
  )
}
