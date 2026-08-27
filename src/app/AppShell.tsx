import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { ConflictBanner } from '../features/sync/ConflictBanner'
import { SyncIndicator } from '../features/sync/SyncIndicator'
import { AccountButton, AccountTabIcon } from '../features/account/AccountButton'
import { AppBrand } from '../ui/AppBrand'
import { Button } from '../ui/Button'
import { CheckIcon, EditWidgetsIcon, SettingsIcon, ShieldIcon, StatsIcon, TimerIcon, HistoryIcon } from '../ui/NavIcons'
import { useMediaQuery } from '../ui/useMediaQuery'
import { ThemeToggle } from '../ui/ThemeToggle'
import { useApp } from './AppProviders'

export interface ShellOutletContext {
  widgetEditing: boolean
  setWidgetEditing: (value: boolean | ((current: boolean) => boolean)) => void
}

export function AppShell() {
  const { user, isAdmin, settings, customBackground } = useApp()
  const location = useLocation()
  const isWide = useMediaQuery('(min-width: 768px)')
  const isDesktop = useMediaQuery('(min-width: 1200px)')
  const isAuthRoute =
    location.pathname.startsWith('/login') ||
    location.pathname.startsWith('/register') ||
    location.pathname.startsWith('/verify-email') ||
    location.pathname.startsWith('/reset-password') ||
    location.pathname.startsWith('/forgot-password')
  const navItems = [
    { to: '/', label: 'Timer', end: true, icon: <TimerIcon /> },
    { to: '/stats', label: 'Stats', end: false, icon: <StatsIcon /> },
    { to: '/history', label: 'History', end: false, icon: <HistoryIcon /> },
    ...(isAdmin ? [{ to: '/admin', label: 'Admin', end: false, icon: <ShieldIcon /> }] : []),
    { to: '/settings', label: 'Settings', end: false, icon: <SettingsIcon /> },
    ...(!isWide ? [{ to: user ? '/account' : '/login', label: user ? 'Account' : 'Sign in', end: false, icon: <AccountTabIcon /> }] : []),
  ]

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

  const shellStyle = useMemo(() => {
    if (settings.backgroundType === 'preset' && settings.backgroundPreset) {
      return { background: settings.backgroundPreset }
    }
    if (settings.backgroundType === 'custom' && customBackground) {
      return {
        backgroundImage: `url(${customBackground})`,
        backgroundSize: settings.backgroundImageSizing === 'stretch' ? '100% 100%' : 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }
    }
    return undefined
  }, [settings.backgroundType, settings.backgroundPreset, settings.backgroundImageSizing, customBackground])

  return (
    <div className="app-shell">
      {shellStyle && <div className="app-background" style={shellStyle} />}
      {showHeaderNav ? (
        <header className="app-header">
          <AppBrand />
          <nav className="header-nav" aria-label="Primary">
            {navItems.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end}>
                {item.icon}
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="header-actions">
            {isDesktopHome && settings.enableWidgets !== false ? (
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
            <ThemeToggle />
            <AccountButton />
          </div>
        </header>
      ) : null}
      <main className={mainClass}>
        <ConflictBanner />
        {showSync && (!showHeaderNav || !user) ? <SyncIndicator /> : null}

        <Outlet context={outletContext} />
      </main>
      {showBottomNav ? (
        <nav className={['bottom-nav', isAdmin ? 'has-admin' : ''].filter(Boolean).join(' ')} aria-label="Primary">
          {navItems.map((item) => (
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
