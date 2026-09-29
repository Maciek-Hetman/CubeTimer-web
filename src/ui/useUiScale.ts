import { useSyncExternalStore } from 'react'

const BASE_PX = 16

function readUiScale(): number {
  const px = Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
  return Number.isFinite(px) && px > 0 ? px / BASE_PX : 1
}

// Cached so getSnapshot doesn't force a style recalc on every render.
let cached: number | null = null
const listeners = new Set<() => void>()
let probe: HTMLElement | null = null
let probeObserver: ResizeObserver | null = null

function refresh() {
  const next = readUiScale()
  if (next === cached) return
  cached = next
  listeners.forEach((listener) => listener())
}

// A hidden 1rem box resizes whenever the root font size changes, whatever the cause:
// viewport resize, browser zoom, or a new default font size in the browser settings.
function startWatching() {
  window.addEventListener('resize', refresh)
  if (typeof ResizeObserver === 'undefined') return
  probe = document.createElement('div')
  probe.setAttribute('aria-hidden', 'true')
  probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;width:1rem;height:0;overflow:hidden'
  document.body.append(probe)
  probeObserver = new ResizeObserver(refresh)
  probeObserver.observe(probe)
}

function stopWatching() {
  window.removeEventListener('resize', refresh)
  probeObserver?.disconnect()
  probe?.remove()
  probeObserver = null
  probe = null
  // Nobody is watching any more, so the cache can go stale.
  cached = null
}

function subscribe(listener: () => void) {
  if (listeners.size === 0) startWatching()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) stopWatching()
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
