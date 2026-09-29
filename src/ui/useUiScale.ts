import { useSyncExternalStore } from 'react'

const BASE_PX = 16

export function readUiScale(): number {
  const px = Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
  return Number.isFinite(px) && px > 0 ? px / BASE_PX : 1
}

function subscribe(onChange: () => void) {
  window.addEventListener('resize', onChange)
  return () => window.removeEventListener('resize', onChange)
}

/**
 * Root font size relative to 16px. The root font size grows with the viewport on large
 * desktop screens (see global.css), so px-only APIs (Recharts, IntersectionObserver
 * margins, canvas-ish measurements) multiply by this to stay in step with rem-sized CSS.
 */
export function useUiScale(): number {
  return useSyncExternalStore(subscribe, readUiScale, () => 1)
}

/** Converts a px value designed for a 16px root into px at the current scale. */
export function scalePx(px: number, scale: number): number {
  return Math.round(px * scale)
}
