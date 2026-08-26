import { lazy, Suspense } from 'react'
import { TimerPage } from '../features/timer/TimerPage'
import { useMediaQuery } from '../ui/useMediaQuery'
import { useApp } from './AppProviders'

const DesktopDashboard = lazy(() =>
  import('../features/dashboard/DesktopDashboard').then((m) => ({ default: m.DesktopDashboard })),
)

export function HomePage() {
  const { settings } = useApp()
  const isDesktop = useMediaQuery('(min-width: 1200px)')
  
  if (isDesktop) {
    return settings.enableWidgets !== false ? (
      <Suspense fallback={null}>
        <DesktopDashboard />
      </Suspense>
    ) : (
      <TimerPage variant="desktop" />
    )
  }
  return <TimerPage />
}
