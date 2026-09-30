import { registerSW } from 'virtual:pwa-register'
import { appUpdater } from './appUpdate'

// Browsers only look for a new service worker on navigation, which a long-lived timer tab or an installed app
// rarely does, so check on a timer and whenever the app comes back to the foreground.
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000
const MIN_FOREGROUND_CHECK_GAP_MS = 5 * 60 * 1000
const CHUNK_RELOAD_KEY = 'cubetimer:chunk-reload-at'

let registered = false

export function registerAppUpdates() {
  if (registered) {
    return
  }
  registered = true

  let registration: ServiceWorkerRegistration | undefined
  let lastCheck = Date.now()

  const check = () => {
    if (!registration || !navigator.onLine || registration.installing) {
      return
    }
    lastCheck = Date.now()
    registration.update().catch(() => {})
  }

  registerSW({
    immediate: true,
    // registerType is 'autoUpdate': the worker skips waiting, and once a new version activates (found at load or
    // by a later check) the plugin calls onNeedReload. It reloads the page itself when this callback is missing —
    // mid-solve included — so it must stay; the updater picks a harmless moment instead.
    onNeedReload: () => appUpdater.updateReady(),
    onRegisteredSW(_swUrl, reg) {
      registration = reg
    },
  })

  const interval = window.setInterval(check, UPDATE_CHECK_INTERVAL_MS)
  const onVisibility = () => {
    if (document.visibilityState === 'visible') {
      appUpdater.woke()
      if (Date.now() - lastCheck > MIN_FOREGROUND_CHECK_GAP_MS) {
        check()
      }
    } else {
      appUpdater.hidden()
    }
  }
  document.addEventListener('visibilitychange', onVisibility)

  // A page still running an old bundle can ask for a lazy chunk the new deploy removed. Reload onto the new
  // version, but only once in a while so a chunk that is genuinely broken can't loop, and never mid-solve.
  const reloadForChunkError = () => {
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
  }
  const onPreloadError = () => appUpdater.whenNotHeld(reloadForChunkError)
  window.addEventListener('vite:preloadError', onPreloadError)

  import.meta.hot?.dispose(() => {
    window.clearInterval(interval)
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('vite:preloadError', onPreloadError)
    registered = false
  })
}
