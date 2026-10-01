import { useId } from 'react'
import type { ActivityCalendar as Calendar, ActivityLevel } from '../../domain/stats/activity'
import { Panel } from '../../ui/Panel'
import { plural } from './plural'

/** Monday first. Unlabelled rows still get a cell, so the pinned column covers every row. */
const WEEKDAYS = ['Mon', '', 'Wed', '', 'Fri', '', '']
const LEVELS: ActivityLevel[] = [0, 1, 2, 3, 4]
const DAY = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })

export function ActivityCalendar({ calendar }: { calendar: Calendar }) {
  const headingId = useId()
  const summary = `${plural(calendar.total, 'solve')} on ${plural(calendar.activeDays, 'day')} in the last year`

  const busiestDays = calendar.weeks
    .flat()
    .filter((day) => day.count > 0)
    .sort((a, b) => b.count - a.count || b.date.getTime() - a.date.getTime())
    .slice(0, 5)

  // Grid row 1 holds the months and column 1 the weekdays, so days start at row 2, column 2.
  return (
    <Panel role="region" aria-labelledby={headingId} className="stats-activity stack">
      <div className="stats-panel-header">
        <h2 id={headingId}>Activity</h2>
        <p className="muted">{summary}</p>
      </div>
      {/* Scrolls on narrow screens; rtl makes it start at the latest weeks without measuring anything.
          A day's own count is a hover detail (its title). Assistive tech gets the summary label and
          the most active days listed below; 371 focusable cells would bury keyboard users instead. */}
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
      {busiestDays.length > 0 && (
        <div className="sr-only">
          <p>Most active days</p>
          <ul>
            {busiestDays.map((day) => (
              <li key={day.key}>
                {DAY.format(day.date)}: {plural(day.count, 'solve')}
              </li>
            ))}
          </ul>
        </div>
      )}
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
