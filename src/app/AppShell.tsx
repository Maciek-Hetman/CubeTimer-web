import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { ConflictBanner } from '../features/sync/ConflictBanner'
import { SyncIndicator } from '../features/sync/SyncIndicator'
import { AppBrand } from '../ui/AppBrand'
import { SettingsIcon, StatsIcon, TimerIcon } from '../ui/NavIcons'
import { useMediaQuery } from '../ui/useMediaQuery'

const NAV_ITEMS = [
  { to: '/', label: 'Timer', end: true, icon: <TimerIcon /> },
  { to: '/stats', label: 'Stats', end: false, icon: <StatsIcon /> },
  { to: '/settings', label: 'Settings', end: false, icon: <SettingsIcon /> },
] as const

export function AppShell() {
  const location = useLocation()
  const isWide = useMediaQuery('(min-width: 768px)')
  const isDesktop = useMediaQuery('(min-width: 1200px)')
  const isAuthRoute =
    location.pathname.startsWith('/login') ||
    location.pathname.startsWith('/register') ||
    location.pathname.startsWith('/verify-email') ||
    location.pathname.startsWith('/reset-password') ||
    location.pathname.startsWith('/forgot-password')
  const showHeaderNav = !isAuthRoute && isWide
  const showBottomNav = !isAuthRoute && !isWide
  const isDesktopHome = isDesktop && location.pathname === '/'

  const mainClass = [
    'app-main',
    isDesktopHome ? 'desktop-timer' : '',
    isAuthRoute ? 'auth-route' : '',
    showHeaderNav ? 'has-header' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="app-shell">
      {showHeaderNav ? (
        <header className="app-header">
          <AppBrand />
          <nav className="header-nav" aria-label="Primary">
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end}>
                {item.icon}
                {item.label}
              </NavLink>
            ))}
          </nav>
          <SyncIndicator />
        </header>
      ) : null}
      <main className={mainClass}>
        <ConflictBanner />
        {!isAuthRoute && !showHeaderNav ? <SyncIndicator /> : null}
        <Outlet />
      </main>
      {showBottomNav ? (
        <nav className="bottom-nav" aria-label="Primary">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end}>
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>
      ) : null}
    </div>
  )
}
