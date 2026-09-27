/** Rounds a raw step up to 1, 2 or 5 times a power of ten. */
export function niceStep(span: number, targetCount: number): number {
  if (!(span > 0) || targetCount < 1) {
    return 1
  }
  const raw = span / targetCount
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const normalized = raw / magnitude
  const factor = normalized < 1.5 ? 1 : normalized < 3 ? 2 : normalized < 7 ? 5 : 10
  return factor * magnitude
}

export interface ValueScale {
  domain: [number, number]
  ticks: number[]
  step: number
}

/**
 * A y-axis scale that fits [min, max] with a little headroom and snaps both ends to
 * round tick values, so the data never touches the plot edges and ticks read cleanly.
 * Never extends below zero.
 */
export function niceValueScale(min: number, max: number, targetCount = 5): ValueScale {
  let lo = min
  let hi = max
  if (hi - lo < 1e-9) {
    lo -= 0.5
    hi += 0.5
  }
  const pad = (hi - lo) * 0.02
  lo = Math.max(0, lo - pad)
  hi += pad
  let step = niceStep(hi - lo, targetCount)
  // Snapping both ends outward can add a tick or two; step up until the count fits.
  while (Math.ceil(hi / step) - Math.floor(lo / step) > targetCount + 1) {
    step = nextNiceStep(step)
  }
  const start = Math.max(0, Math.floor(lo / step) * step)
  const end = Math.ceil(hi / step) * step
  const ticks: number[] = []
  for (let value = start; value <= end + step / 2; value += step) {
    ticks.push(roundTo(value, step))
  }
  return { domain: [ticks[0], ticks[ticks.length - 1]], ticks, step }
}

/** Whole-number ticks inside [min, max] for the solve-number axis. */
export function integerTicks(min: number, max: number, targetCount = 6): number[] {
  if (max <= min) {
    return [min]
  }
  const step = Math.max(1, niceStep(max - min, targetCount))
  const ticks: number[] = []
  for (let value = Math.ceil(min / step) * step; value <= max; value += step) {
    ticks.push(value)
  }
  return ticks
}

/** Formats a seconds tick using as many decimals as the step needs; m:ss past a minute. */
export function formatSecondsTick(seconds: number, step: number): string {
  const decimals = step >= 1 ? 0 : step >= 0.1 ? 1 : 2
  const rounded = Number(seconds.toFixed(decimals))
  if (rounded < 60) {
    return rounded.toFixed(decimals)
  }
  const minutes = Math.floor(rounded / 60)
  const rest = (rounded - minutes * 60).toFixed(decimals)
  const width = decimals > 0 ? decimals + 3 : 2
  return `${minutes}:${rest.padStart(width, '0')}`
}

function nextNiceStep(step: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(step))
  const factor = Math.round(step / magnitude)
  return (factor < 2 ? 2 : factor < 5 ? 5 : 10) * magnitude
}

function roundTo(value: number, step: number): number {
  const decimals = Math.max(0, -Math.floor(Math.log10(step)) + 1)
  return Number(value.toFixed(decimals))
}
