import { useId, useMemo } from 'react'
import { buildActivityCalendar, type ActivityLevel } from '../../domain/stats/activity'
import { Panel } from '../../ui/Panel'

/** Monday first. Unlabelled rows still get a cell, so the pinned column covers every row. */
const WEEKDAYS = ['Mon', '', 'Wed', '', 'Fri', '', '']
const LEVELS: ActivityLevel[] = [0, 1, 2, 3, 4]
const DAY = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })

function plural(count: number, word: string): string {
  return `${count.toLocaleString()} ${count === 1 ? word : `${word}s`}`
}

export function ActivityCalendar({ counts, today }: { counts: ReadonlyMap<string, number>; today: Date }) {
  const headingId = useId()
  const calendar = useMemo(() => buildActivityCalendar(counts, today), [counts, today])
  const summary = `${plural(calendar.total, 'solve')} on ${plural(calendar.activeDays, 'day')} in the last year`

  // Grid row 1 holds the months and column 1 the weekdays, so days start at row 2, column 2.
  return (
    <Panel role="region" aria-labelledby={headingId} className="stats-activity stack">
      <div className="stats-panel-header">
        <h3 id={headingId}>Activity</h3>
        <p className="muted">{summary}</p>
      </div>
      {/* Scrolls on narrow screens; rtl makes it start at the latest weeks without measuring anything. */}
      <div className="stats-activity-scroll">
        <div className="stats-activity-grid" role="img" aria-label={`Solves per day: ${summary}`}>
          {calendar.months.map((month) => (
            <span key={`${month.week}-${month.label}`} className="stats-activity-month" style={{ gridColumn: month.week + 2 }}>
              {month.label}
            </span>
          ))}
          {WEEKDAYS.map((label, row) => (
            <span key={row} className="stats-activity-weekday" style={{ gridRow: row + 2 }}>
              {label}
            </span>
          ))}
          {calendar.weeks.map((week, weekIndex) =>
            week.map((day, dayIndex) => (
              <span
                key={day.key}
                className="stats-activity-day"
                data-level={day.level}
                style={{ gridColumn: weekIndex + 2, gridRow: dayIndex + 2 }}
                title={`${day.count === 0 ? 'No solves' : plural(day.count, 'solve')} on ${DAY.format(day.date)}`}
              />
            )),
          )}
        </div>
      </div>
      <div className="stats-activity-legend" aria-hidden="true">
        Less
        {LEVELS.map((level) => (
          <span key={level} className="stats-activity-day" data-level={level} />
        ))}
        More
      </div>
    </Panel>
  )
}
