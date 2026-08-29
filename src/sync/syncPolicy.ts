export function isTokenExpired(
  expiresAtMs: number,
  nowMs: number = Date.now(),
  skewMs = 30_000,
): boolean {
  return expiresAtMs > 0 && nowMs >= expiresAtMs - skewMs
}

export function shouldSkipSync(options: {
  pendingMutations: number
  lastSyncedAt: string | null
  nowMs: number
  minIntervalMs: number
}): boolean {
  if (options.pendingMutations > 0) {
    return false
  }
  if (!options.lastSyncedAt) {
    return false
  }
  return options.nowMs - new Date(options.lastSyncedAt).getTime() < options.minIntervalMs
}