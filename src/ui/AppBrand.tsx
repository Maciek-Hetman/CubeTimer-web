import { Link } from 'react-router-dom'

export function AppBrand({ to = '/' }: { to?: string }) {
  return (
    <Link className="app-brand" to={to}>
      CubeTimer
    </Link>
  )
}
