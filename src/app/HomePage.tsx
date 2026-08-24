import { TimerPage } from '../features/timer/TimerPage'
import { DesktopDashboard } from '../features/dashboard/DesktopDashboard'
import { useMediaQuery } from '../ui/useMediaQuery'

export function HomePage() {
  const isDesktop = useMediaQuery('(min-width: 1200px)')
  return isDesktop ? <DesktopDashboard /> : <TimerPage />
}
