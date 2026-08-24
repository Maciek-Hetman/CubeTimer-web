import { useApp } from '../app/AppProviders'
import { MoonIcon, SunIcon } from './NavIcons'
import { Button } from './Button'
import { useMediaQuery } from './useMediaQuery'

export function ThemeToggle() {
  const { settings, updateSettings } = useApp()
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)')
  const isDark = settings.theme === 'dark' || (settings.theme === 'system' && systemDark)
  const nextTheme = isDark ? 'light' : 'dark'

  return (
    <Button
      type="button"
      variant="ghost"
      className="icon"
      aria-label={`Switch to ${nextTheme} mode`}
      title={`Switch to ${nextTheme} mode`}
      onClick={() => void updateSettings({ theme: nextTheme })}
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </Button>
  )
}
