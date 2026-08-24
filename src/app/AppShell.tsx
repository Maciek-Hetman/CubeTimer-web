import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { ConflictBanner } from '../features/sync/ConflictBanner'
import { SyncIndicator } from '../features/sync/SyncIndicator'
import { useMediaQuery } from '../ui/useMediaQuery'

export function AppShell() {
  const location = useLocation()
  const isDesktop = useMediaQuery('(min-width: 1200px)')
  const isAuthRoute =
    location.pathname.startsWith('/login') ||
    location.pathname.startsWith('/register') ||
    location.pathname.startsWith('/verify-email') ||
    location.pathname.startsWith('/reset-password') ||
    location.pathname.startsWith('/forgot-password')
  const showBottomNav = !isAuthRoute && (!isDesktop || location.pathname !== '/')

  return (
    <div className="app-shell">
      <main className={`app-main${isDesktop && location.pathname === '/' ? ' desktop-timer' : ''}`}>
        <ConflictBanner />
        {!isAuthRoute ? <SyncIndicator /> : null}
        <Outlet />
      </main>
      {showBottomNav ? (
        <nav className="bottom-nav" aria-label="Primary">
          <NavLink to="/" end>
            Timer
          </NavLink>
          <NavLink to="/stats">Stats</NavLink>
          <NavLink to="/settings">Settings</NavLink>
        </nav>
      ) : null}
    </div>
  )
}
