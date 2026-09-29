import { useSyncExternalStore } from 'react'

const BASE_PX = 16

function readUiScale(): number {
  const px = Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
  return Number.isFinite(px) && px > 0 ? px / BASE_PX : 1
}

// Cached so getSnapshot doesn't force a style recalc on every render. Only refreshed on
// resize: a change to the browser's default font size isn't picked up until the next one.
let cached: number | null = null
const listeners = new Set<() => void>()

function onResize() {
  const next = readUiScale()
  if (next === cached) return
  cached = next
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  if (listeners.size === 0) window.addEventListener('resize', onResize)
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      window.removeEventListener('resize', onResize)
      // Nobody is listening for resizes any more, so the cache can go stale.
      cached = null
    }
  }
}

function getSnapshot(): number {
  cached ??= readUiScale()
  return cached
}

/**
 * Root font size relative to 16px. The root font size grows with the viewport on large
 * desktop screens (see global.css), so px-only APIs (Recharts, IntersectionObserver
 * margins, measured font sizes) multiply by this to stay in step with rem-sized CSS.
 */
export function useUiScale(): number {
  return useSyncExternalStore(subscribe, getSnapshot, () => 1)
}

/** Converts a px value designed for a 16px root into px at the current scale. */
export function scalePx(px: number, scale: number): number {
  return Math.round(px * scale)
}
