import { afterEach, describe, expect, it, vi } from 'vitest'
import { ACTIVITY_WEEKS, activityLevel, activityStart, buildActivityCalendar, dayKey } from './activity'

// Wednesday 30 September 2026, mid-afternoon local time.
const TODAY = new Date(2026, 8, 30, 15, 0)

describe('dayKey', () => {
  it('uses the local calendar day, zero-padded', () => {
    expect(dayKey(new Date(2026, 0, 5, 0, 10))).toBe('2026-01-05')
    expect(dayKey(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31')
  })
})

describe('activityStart', () => {
  it('opens on the Monday 52 weeks before this week', () => {
    const start = activityStart(TODAY)
    expect(dayKey(start)).toBe('2025-09-29')
    expect(start.getDay()).toBe(1)
    expect(start.getHours()).toBe(0)
  })

  it('treats Sunday as the end of the week, not the start', () => {
    expect(dayKey(activityStart(new Date(2026, 9, 4, 9)))).toBe('2025-09-29')
    expect(dayKey(activityStart(new Date(2026, 9, 5, 9)))).toBe('2025-10-06')
  })
})

describe('activityLevel', () => {
  it('shades in quarters of a busy day, and busier days in the darkest shade', () => {
    expect(activityLevel(0, 100)).toBe(0)
    expect(activityLevel(1, 100)).toBe(1)
    expect(activityLevel(25, 100)).toBe(1)
    expect(activityLevel(26, 100)).toBe(2)
    expect(activityLevel(75, 100)).toBe(3)
    expect(activityLevel(76, 100)).toBe(4)
    expect(activityLevel(300, 100)).toBe(4)
  })
})

describe('buildActivityCalendar', () => {
  it('lays out a year of Monday-first weeks ending today', () => {
    const calendar = buildActivityCalendar(new Map(), TODAY)

    expect(calendar.weeks).toHaveLength(ACTIVITY_WEEKS)
    expect(calendar.weeks[0][0].key).toBe('2025-09-29')
    expect(calendar.weeks.slice(0, -1).every((week) => week.length === 7)).toBe(true)
    // Monday to Wednesday of the current week; nothing after today.
    expect(calendar.weeks.at(-1)?.map((day) => day.key)).toEqual(['2026-09-28', '2026-09-29', '2026-09-30'])
  })

  it('labels each month on the week its first day falls in', () => {
    const { months } = buildActivityCalendar(new Map(), TODAY)

    expect(months).toHaveLength(12)
    // 1 Oct 2025 is the Wednesday of the first week; 1 Nov is 33 days in.
    expect(months[0]).toEqual({ label: 'Oct', week: 0 })
    expect(months[1]).toEqual({ label: 'Nov', week: 4 })
  })

  it('leaves out a month that starts too close to the end to fit its name', () => {
    // 1 Oct 2026 lands in the last week column; the label would be cut off at the edge.
    const { weeks, months } = buildActivityCalendar(new Map(), new Date(2026, 9, 1, 12))

    expect(weeks.at(-1)?.at(-1)?.key).toBe('2026-10-01')
    // October 2025 to September 2026; this October would make it 13.
    expect(months).toHaveLength(12)
    expect(months.every((month) => month.week + 3 <= weeks.length)).toBe(true)
  })

  it('counts solves and active days inside the range only', () => {
    const counts = new Map([
      ['2025-09-28', 99], // the Sunday before the calendar starts
      ['2025-09-29', 3],
      ['2026-06-01', 12],
      ['2026-09-30', 30],
      ['2026-10-01', 99], // tomorrow
    ])
    const calendar = buildActivityCalendar(counts, TODAY)
    const days = calendar.weeks.flat()

    expect(calendar.total).toBe(45)
    expect(calendar.activeDays).toBe(3)
    expect(days.find((day) => day.key === '2026-09-30')?.level).toBe(4)
    expect(days.find((day) => day.key === '2026-06-01')?.level).toBe(2)
    expect(days.find((day) => day.key === '2025-09-29')?.level).toBe(1)
    expect(days.find((day) => day.key === '2025-10-01')?.level).toBe(0)
  })

  it("doesn't let one marathon day flatten every other day to the palest shade", () => {
    const counts = new Map<string, number>()
    // Twenty ordinary days of 10 to 48 solves, then one day of 500.
    for (let i = 0; i < 20; i += 1) {
      counts.set(dayKey(new Date(2026, 5, i + 1)), 10 + i * 2)
    }
    counts.set('2026-09-01', 500)
    const levels = new Set(
      buildActivityCalendar(counts, TODAY)
        .weeks.flat()
        .filter((day) => day.count > 0 && day.count < 500)
        .map((day) => day.level),
    )

    expect([...levels].sort()).toEqual([1, 2, 3, 4])
  })

  it('counts the current streak up to today, or yesterday while today is still empty', () => {
    const days = (...keys: string[]) => new Map(keys.map((key) => [key, 5]))
    // A five-day run in June, then the last three days before today.
    const june = ['2026-06-10', '2026-06-11', '2026-06-12', '2026-06-13', '2026-06-14']
    const recent = ['2026-09-27', '2026-09-28', '2026-09-29']

    const notYetToday = buildActivityCalendar(days(...june, ...recent), TODAY)
    expect(notYetToday.currentStreak).toBe(3)
    expect(notYetToday.longestStreak).toBe(5)

    const today = buildActivityCalendar(days(...june, ...recent, '2026-09-30'), TODAY)
    expect(today.currentStreak).toBe(4)

    const broken = buildActivityCalendar(days(...june, '2026-09-27', '2026-09-28'), TODAY)
    expect(broken.currentStreak).toBe(0)
    expect(broken.longestStreak).toBe(5)

    const none = buildActivityCalendar(new Map(), TODAY)
    expect([none.currentStreak, none.longestStreak]).toEqual([0, 0])
  })

  describe('across daylight saving changes', () => {
    afterEach(() => {
      vi.unstubAllEnvs()
    })

    // Warsaw changes clocks at 2–3 a.m.; Santiago at midnight, so some days have no 00:00.
    for (const zone of ['Europe/Warsaw', 'America/Santiago']) {
      it(`gives every day exactly one cell in ${zone}`, () => {
        vi.stubEnv('TZ', zone)
        expect(new Date(2026, 0, 15).getTimezoneOffset()).not.toBe(new Date(2026, 6, 15).getTimezoneOffset())

        const keys = buildActivityCalendar(new Map(), TODAY)
          .weeks.flat()
          .map((day) => day.key)

        expect(keys).toHaveLength(52 * 7 + 3)
        expect(new Set(keys).size).toBe(keys.length)
        for (let i = 1; i < keys.length; i += 1) {
          const gap = Date.parse(`${keys[i]}T00:00:00Z`) - Date.parse(`${keys[i - 1]}T00:00:00Z`)
          expect(gap).toBe(86_400_000)
        }
      })
    }
  })
})
