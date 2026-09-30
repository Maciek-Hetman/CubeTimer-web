import { registerSW } from 'virtual:pwa-register'
import { appUpdater } from './appUpdate'

// Browsers only look for a new service worker on navigation, which a long-lived timer tab or an installed app
// rarely does, so check on a timer and whenever the app comes back to the foreground.
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000
const MIN_FOREGROUND_CHECK_GAP_MS = 5 * 60 * 1000
const CHUNK_RELOAD_KEY = 'cubetimer:chunk-reload-at'

export function registerAppUpdates() {
  registerSW({
    immediate: true,
    // The worker skips waiting, so this fires once the new version is active; reload when it's harmless.
    onNeedReload: () => appUpdater.updateReady(),
    onRegisteredSW(_swUrl, registration) {
      if (!registration) {
        return
      }
      let lastCheck = Date.now()
      const check = () => {
        if (!navigator.onLine || registration.installing) {
          return
        }
        lastCheck = Date.now()
        registration.update().catch(() => {})
      }
      window.setInterval(check, UPDATE_CHECK_INTERVAL_MS)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && Date.now() - lastCheck > MIN_FOREGROUND_CHECK_GAP_MS) {
          check()
        }
      })
    },
  })

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      appUpdater.woke()
    } else {
      appUpdater.hidden()
    }
  })

  // A page still running an old bundle can ask for a lazy chunk the new deploy removed. Reload onto the new
  // version, but only once in a while so a chunk that is genuinely broken can't loop.
  window.addEventListener('vite:preloadError', () => {
    try {
      const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) ?? 0)
      if (Date.now() - last < 60_000) {
        return
      }
      sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()))
    } catch {
      return
    }
    window.location.reload()
  })
}
