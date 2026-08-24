import { Link } from 'react-router-dom'

export function AppLogo({ className = '' }: { className?: string }) {
  return <span className={['app-logo', className].filter(Boolean).join(' ')} aria-hidden="true" />
}

export function AppBrand({ to = '/' }: { to?: string }) {
  return (
    <Link className="app-brand" to={to}>
      <AppLogo />
      CubeTimer
    </Link>
  )
}
