// A new deploy is installed and activated by the service worker in the background, but the open page keeps
// running the old bundle until it reloads. The updater reloads it for the user at a moment that costs them
// nothing: right after the app was opened or brought back, on the next in-app navigation, or while the tab is
// hidden — and never while something (a solve in progress) holds it off.

/** How long after the app is opened or brought back to the foreground an update may reload it outright. */
export const WAKE_WINDOW_MS = 30_000

export interface AppUpdaterEnv {
  now(): number
  reload(): void
  isHidden(): boolean
  /** True while the user is typing into a field, whose contents a reload would lose. */
  isEditing(): boolean
}

export interface AppUpdater {
  /** The service worker has activated a newer version than the one this page runs. */
  updateReady(): void
  /** The app was opened or brought back to the foreground. */
  woke(): void
  /** The tab was hidden. */
  hidden(): void
  /** The user moved to another page in the app. */
  navigated(): void
  /** Defers any reload until the returned release function is called. */
  hold(): () => void
}

export function createAppUpdater(env: AppUpdaterEnv): AppUpdater {
  let pending = false
  let reloading = false
  let holds = 0
  let wokeAt = env.now()

  function tryApply(navigating: boolean) {
    if (!pending || reloading || holds > 0) {
      return
    }
    if (!navigating) {
      const unnoticed = env.isHidden() || env.now() - wokeAt < WAKE_WINDOW_MS
      if (!unnoticed || env.isEditing()) {
        return
      }
    }
    reloading = true
    env.reload()
  }

  return {
    updateReady() {
      pending = true
      tryApply(false)
    },
    woke() {
      wokeAt = env.now()
      tryApply(false)
    },
    hidden() {
      tryApply(false)
    },
    navigated() {
      tryApply(true)
    },
    hold() {
      holds += 1
      let released = false
      return () => {
        if (released) {
          return
        }
        released = true
        holds -= 1
        tryApply(false)
      }
    },
  }
}

const NON_TEXT_INPUTS = new Set(['button', 'checkbox', 'color', 'file', 'image', 'radio', 'range', 'reset', 'submit'])

function isEditingText(): boolean {
  const active = document.activeElement
  if (!(active instanceof HTMLElement)) {
    return false
  }
  if (active instanceof HTMLInputElement) {
    return !NON_TEXT_INPUTS.has(active.type)
  }
  return active instanceof HTMLTextAreaElement || active.isContentEditable
}

export const appUpdater = createAppUpdater({
  now: () => Date.now(),
  reload: () => window.location.reload(),
  isHidden: () => document.visibilityState === 'hidden',
  isEditing: isEditingText,
})
