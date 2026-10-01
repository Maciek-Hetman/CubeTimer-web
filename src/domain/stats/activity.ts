/** Weeks in the activity calendar: a year back, plus the week in progress. */
export const ACTIVITY_WEEKS = 53

const MONTH = new Intl.DateTimeFormat('en-GB', { month: 'short' })
/** Week columns a month name needs; one starting closer to the end would be cut off. */
const MONTH_LABEL_WEEKS = 3

/** A local calendar day as YYYY-MM-DD. */
export function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** Local midnight on the Monday that opens the calendar, 52 weeks before this week's Monday. */
export function activityStart(today: Date): Date {
  const sinceMonday = (today.getDay() + 6) % 7
  return new Date(today.getFullYear(), today.getMonth(), today.getDate() - sinceMonday - (ACTIVITY_WEEKS - 1) * 7)
}

export type ActivityLevel = 0 | 1 | 2 | 3 | 4

export interface ActivityDay {
  key: string
  date: Date
  count: number
  level: ActivityLevel
}

export interface ActivityCalendar {
  /** Monday-first weeks, oldest first. The current week stops at today. */
  weeks: ActivityDay[][]
  /** Month names, each on the week its first day falls in, if there's room for it before the end. */
  months: Array<{ label: string; week: number }>
  total: number
  activeDays: number
  /** Consecutive days with solves up to today, or up to yesterday while today has none yet. */
  currentStreak: number
  longestStreak: number
}

/**
 * Shade in quarters of a busy day's volume. `busy` is a high percentile rather than the
 * maximum, so one marathon day can't wash every ordinary session out to the palest shade.
 */
export function activityLevel(count: number, busy: number): ActivityLevel {
  if (count <= 0 || busy <= 0) return 0
  return Math.min(4, Math.ceil((4 * count) / busy)) as ActivityLevel
}

/** The 95th percentile of active days' counts. */
function busyDay(counts: number[]): number {
  const active = counts.filter((count) => count > 0).sort((a, b) => a - b)
  return active.length === 0 ? 0 : active[Math.ceil(active.length * 0.95) - 1]
}

export function buildActivityCalendar(counts: ReadonlyMap<string, number>, today: Date): ActivityCalendar {
  const start = activityStart(today)
  const todayKey = dayKey(today)
  const days: Array<Omit<ActivityDay, 'level'>> = []
  const months: ActivityCalendar['months'] = []
  let total = 0
  let activeDays = 0

  for (let offset = 0; offset < ACTIVITY_WEEKS * 7; offset += 1) {
    // Noon, so a DST switch at midnight can't skip or repeat a day.
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset, 12)
    const key = dayKey(date)
    const count = counts.get(key) ?? 0
    if (date.getDate() === 1) {
      months.push({ label: MONTH.format(date), week: Math.floor(offset / 7) })
    }
    days.push({ key, date, count })
    total += count
    if (count > 0) activeDays += 1
    if (key === todayKey) break
  }

  let longestStreak = 0
  let run = 0
  for (const day of days) {
    run = day.count > 0 ? run + 1 : 0
    longestStreak = Math.max(longestStreak, run)
  }
  // Today without solves yet doesn't end the streak; it only ends once a whole day goes by.
  let last = days.length - 1
  if (last >= 0 && days[last].count === 0) last -= 1
  let currentStreak = 0
  while (last >= 0 && days[last].count > 0) {
    currentStreak += 1
    last -= 1
  }

  const busy = busyDay(days.map((day) => day.count))
  const weeks: ActivityDay[][] = []
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7).map((day) => ({ ...day, level: activityLevel(day.count, busy) })))
  }
  return {
    weeks,
    months: months.filter((month) => month.week + MONTH_LABEL_WEEKS <= weeks.length),
    total,
    activeDays,
    currentStreak,
    longestStreak,
  }
}
