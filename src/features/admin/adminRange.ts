import type { AdminStatsQuery } from '../../api/types'

export const ADMIN_RANGES = ['24h', '7d', '30d'] as const

export type AdminRange = (typeof ADMIN_RANGES)[number]

export const ADMIN_RANGE_LABELS: Record<AdminRange, string> = {
  '24h': '24 hours',
  '7d': '7 days',
  '30d': '30 days',
}

export function adminStatsQueryForRange(range: AdminRange, now = new Date()): AdminStatsQuery {
  const to = new Date(now)
  const from = new Date(now)
  if (range === '24h') {
    from.setTime(to.getTime() - 24 * 60 * 60 * 1000)
    return { from: from.toISOString(), to: to.toISOString(), interval: 'hour' }
  }
  if (range === '7d') {
    from.setTime(to.getTime() - 7 * 24 * 60 * 60 * 1000)
    return { from: from.toISOString(), to: to.toISOString(), interval: 'day' }
  }
  from.setTime(to.getTime() - 30 * 24 * 60 * 60 * 1000)
  return { from: from.toISOString(), to: to.toISOString(), interval: 'day' }
}
