import { useId, useRef, useState, type KeyboardEvent } from 'react'
import type { ActivityCalendar as Calendar, ActivityLevel } from '../../domain/stats/activity'
import { Panel } from '../../ui/Panel'
import { plural } from './plural'

/** Monday first. Unlabelled rows still get a cell, so the pinned column covers every row. */
const WEEKDAYS = ['Mon', '', 'Wed', '', 'Fri', '', '']
const LEVELS: ActivityLevel[] = [0, 1, 2, 3, 4]
const DAY = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })

export function ActivityCalendar({ calendar }: { calendar: Calendar }) {
  const headingId = useId()
  const gridRef = useRef<HTMLDivElement>(null)
  const [selectedKey, setSelectedKey] = useState<string>()
  const describe = (day: Calendar['weeks'][number][number]) =>
    `${day.count === 0 ? 'No solves' : plural(day.count, 'solve')} on ${DAY.format(day.date)}`
  const summary = `${plural(calendar.total, 'solve')} on ${plural(calendar.activeDays, 'day')} in the last year`

  const busiestDays = calendar.weeks
    .flat()
    .filter((day) => day.count > 0)
    .sort((a, b) => b.count - a.count || b.date.getTime() - a.date.getTime())
    .slice(0, 5)

  const days = calendar.weeks.flat()
  const selected = days.find((day) => day.key === selectedKey)
  const tabKey = selected?.key ?? days[days.length - 1]?.key

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 }[event.key]
    if (step === undefined) return
    const current = days.findIndex((day) => day.key === tabKey)
    const next = days[Math.min(days.length - 1, Math.max(0, current + step))]
    if (!next) return
    event.preventDefault()
    gridRef.current?.querySelector<HTMLElement>(`[data-key="${next.key}"]`)?.focus()
  }

  // Grid row 1 holds the months and column 1 the weekdays, so days start at row 2, column 2.
  return (
    <Panel role="region" aria-labelledby={headingId} className="stats-activity stack">
      <div className="stats-panel-header">
        <h2 id={headingId}>Activity</h2>
        <p className="muted">{summary}</p>
      </div>
      {/* Scrolls on narrow screens; rtl makes it start at the latest weeks without measuring anything.
          Days are buttons in one roving-tabindex group (a single tab stop, arrow keys move). Tapping,
          or clicking a day shows its count in the readout below. */}
      <div className="stats-activity-scroll">
        <div
          ref={gridRef}
          className="stats-activity-grid"
          role="group"
          aria-label={`Solves per day: ${summary}`}
          onKeyDown={onKeyDown}
        >
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
              <button
                type="button"
                key={day.key}
                data-key={day.key}
                className="stats-activity-day"
                data-level={day.level}
                data-selected={day.key === selectedKey || undefined}
                tabIndex={day.key === tabKey ? 0 : -1}
                style={{ gridColumn: weekIndex + 2, gridRow: dayIndex + 2 }}
                aria-label={describe(day)}
                title={describe(day)}
                onClick={() => setSelectedKey(day.key)}
              />
            )),
          )}
        </div>
      </div>
      <p className="muted stats-activity-readout" aria-live="polite">
        {selected ? describe(selected) : 'Tap a day to see its solves.'}
      </p>
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
