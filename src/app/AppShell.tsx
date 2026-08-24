import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { ConflictBanner } from '../features/sync/ConflictBanner'
import { SyncIndicator } from '../features/sync/SyncIndicator'
import { AppBrand } from '../ui/AppBrand'
import { Button } from '../ui/Button'
import { CheckIcon, EditWidgetsIcon, SettingsIcon, StatsIcon, TimerIcon } from '../ui/NavIcons'
import { useMediaQuery } from '../ui/useMediaQuery'

const NAV_ITEMS = [
  { to: '/', label: 'Timer', end: true, icon: <TimerIcon /> },
  { to: '/stats', label: 'Stats', end: false, icon: <StatsIcon /> },
  { to: '/settings', label: 'Settings', end: false, icon: <SettingsIcon /> },
] as const

export interface ShellOutletContext {
  widgetEditing: boolean
  setWidgetEditing: (value: boolean | ((current: boolean) => boolean)) => void
}

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
  const isHome = location.pathname === '/'
  const isDesktopHome = isDesktop && isHome
  const showSync = !isAuthRoute && !isHome
  const [widgetEditing, setWidgetEditing] = useState(false)

  useEffect(() => {
    if (!isDesktopHome) {
      setWidgetEditing(false)
    }
  }, [isDesktopHome])

  const outletContext = useMemo<ShellOutletContext>(
    () => ({ widgetEditing, setWidgetEditing }),
    [widgetEditing],
  )

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
          <div className="header-actions">
            {isDesktopHome ? (
              <Button
                type="button"
                variant="ghost"
                className="icon"
                aria-pressed={widgetEditing}
                aria-label={widgetEditing ? 'Done editing widgets' : 'Edit widgets'}
                title={widgetEditing ? 'Done' : 'Edit widgets'}
                onClick={() => setWidgetEditing((value) => !value)}
              >
                {widgetEditing ? <CheckIcon /> : <EditWidgetsIcon />}
              </Button>
            ) : null}
            {showSync ? <SyncIndicator /> : null}
          </div>
        </header>
      ) : null}
      <main className={mainClass}>
        <ConflictBanner />
        {showSync && !showHeaderNav ? <SyncIndicator /> : null}
        <Outlet context={outletContext} />
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
