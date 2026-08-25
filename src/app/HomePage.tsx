import { TimerPage } from '../features/timer/TimerPage'
import { DesktopDashboard } from '../features/dashboard/DesktopDashboard'
import { useMediaQuery } from '../ui/useMediaQuery'
import { useApp } from './AppProviders'

export function HomePage() {
  const { settings } = useApp()
  const isDesktop = useMediaQuery('(min-width: 1200px)')
  
  if (isDesktop) {
    return settings.enableWidgets !== false ? <DesktopDashboard /> : <TimerPage variant="desktop" />
  }
  return <TimerPage />
}
