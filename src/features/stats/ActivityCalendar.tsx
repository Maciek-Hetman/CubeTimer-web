import { memo, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { ActivityCalendar as Calendar, ActivityDay, ActivityLevel } from '../../domain/stats/activity'
import { Panel } from '../../ui/Panel'
import { plural } from './plural'

/** Monday first. Unlabelled rows still get a cell, so the pinned column covers every row. */
const WEEKDAYS = ['Mon', '', 'Wed', '', 'Fri', '', '']
const LEVELS: ActivityLevel[] = [0, 1, 2, 3, 4]
const DAY = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })

function describe(day: ActivityDay): string {
  return `${day.count === 0 ? 'No solves' : plural(day.count, 'solve')} on ${DAY.format(day.date)}`
}

export function ActivityCalendar({ calendar }: { calendar: Calendar }) {
  const headingId = useId()
  const gridRef = useRef<HTMLDivElement>(null)
  const [selectedKey, setSelectedKey] = useState<string>()
  const summary = `${plural(calendar.total, 'solve')} on ${plural(calendar.activeDays, 'day')} in the last year`

  // Picking a day re-renders the calendar, so the flat day list is kept per calendar.
  const days = useMemo(() => calendar.weeks.flat(), [calendar])
  const selected = days.find((day) => day.key === selectedKey)
  const tabKey = selected?.key ?? days[days.length - 1]?.key

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 }[event.key]
    if (step === undefined) return
    const current = days.findIndex((day) => day.key === tabKey)
    // This week stops at today, so a step past it lands on today.
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
          Days are buttons in one roving-tabindex group (a single tab stop, arrow keys move). Clicking,
          tapping or focusing a day shows its count in the readout below. */}
      <div className="stats-activity-scroll">
        <div
          ref={gridRef}
          className="stats-activity-grid"
          role="group"
          aria-label="Solves per day"
          onKeyDown={onKeyDown}
        >
          {/* Each day's label carries its full date, so the month and weekday labels are visual only. */}
          {calendar.months.map((month) => (
            <span
              key={`${month.week}-${month.label}`}
              className="stats-activity-month"
              style={{ gridColumn: month.week + 2 }}
              aria-hidden="true"
            >
              {month.label}
            </span>
          ))}
          {WEEKDAYS.map((label, row) => (
            <span key={row} className="stats-activity-weekday" style={{ gridRow: row + 2 }} aria-hidden="true">
              {label}
            </span>
          ))}
          {calendar.weeks.map((week, weekIndex) =>
            week.map((day, dayIndex) => (
              <DayCell
                key={day.key}
                day={day}
                column={weekIndex + 2}
                row={dayIndex + 2}
                selected={day.key === selectedKey}
                tabbable={day.key === tabKey}
                onSelect={setSelectedKey}
              />
            )),
          )}
        </div>
      </div>
      {/* Not a live region: a focused day's label already says the same thing. */}
      <div className="stats-activity-footer">
        <p>{selected ? describe(selected) : 'Select a day to see its solves.'}</p>
        <div className="stats-activity-legend" aria-hidden="true">
          Less
          {LEVELS.map((level) => (
            <span key={level} className="stats-activity-day" data-level={level} />
          ))}
          More
        </div>
      </div>
    </Panel>
  )
}

/** One day's square. Picking a day re-renders the calendar, but only the two squares it changes redo their work. */
const DayCell = memo(function DayCell({
  day,
  column,
  row,
  selected,
  tabbable,
  onSelect,
}: {
  day: ActivityDay
  column: number
  row: number
  selected: boolean
  tabbable: boolean
  onSelect: (key: string) => void
}) {
  const label = describe(day)
  return (
    <button
      type="button"
      data-key={day.key}
      className="stats-activity-day"
      data-level={day.level}
      data-selected={selected || undefined}
      tabIndex={tabbable ? 0 : -1}
      style={{ gridColumn: column, gridRow: row }}
      aria-label={label}
      title={label}
      onClick={() => onSelect(day.key)}
      // Selection follows focus, so the one tab stop moves with the arrow keys.
      onFocus={() => onSelect(day.key)}
    />
  )
})
