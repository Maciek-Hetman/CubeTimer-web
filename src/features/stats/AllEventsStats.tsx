import { useId, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useApp } from '../../app/AppContext'
import { countSolvesByDay, type EventSummary } from '../../data/repositories/solveStats'
import {
  activityStart,
  buildActivityCalendar,
  dayKey,
  type ActivityCalendar as Calendar,
} from '../../domain/stats/activity'
import { formatTimeSpent } from '../../domain/stats/formatTime'
import { EmptyState } from '../../ui/EmptyState'
import { Panel } from '../../ui/Panel'
import { ActivityCalendar } from './ActivityCalendar'
import { EventBreakdown } from './EventBreakdown'
import { HeadlineStats } from './HeadlineStats'
import { plural } from './plural'

/** The All tab: what every event shares. `events` is undefined while it loads. */
export function AllEventsStats({ events }: { events: EventSummary[] | undefined }) {
  const { ownerId } = useApp()
  // Keyed by day so the calendar rolls over at midnight.
  const todayKey = dayKey(new Date())
  const activity = useLiveQuery(async () => {
    const today = new Date()
    return { today, counts: await countSolvesByDay(ownerId, activityStart(today)) }
  }, [ownerId, todayKey])
  const calendar = useMemo(
    () => (activity ? buildActivityCalendar(activity.counts, activity.today) : undefined),
    [activity],
  )

  if (!events || !calendar) {
    return null
  }
  if (events.length === 0) {
    return (
      <EmptyState
        title="No solves yet"
        description="Solves you time in any event show up here."
        action={
          <Link className="btn primary" to="/">
            Open timer
          </Link>
        }
      />
    )
  }
  return (
    <div className="stats-all">
      <Overview events={events} calendar={calendar} />
      <ActivityCalendar calendar={calendar} />
      <EventBreakdown events={events} />
    </div>
  )
}

function Overview({ events, calendar }: { events: EventSummary[]; calendar: Calendar }) {
  const headingId = useId()
  const solves = events.reduce((sum, entry) => sum + entry.count, 0)
  const timeSpent = events.reduce((sum, entry) => sum + entry.totalTime, 0)

  return (
    <Panel role="region" aria-labelledby={headingId} className="stats-overview stack">
      <h2 id={headingId}>Overview</h2>
      <HeadlineStats
        items={[
          { label: 'Solves', value: solves.toLocaleString(), note: `in ${plural(events.length, 'event')}` },
          { label: 'Time spent cubing', value: formatTimeSpent(timeSpent), note: 'Sum of solve times' },
          { label: 'Days practiced', value: calendar.activeDays.toLocaleString(), note: 'in the last year' },
          {
            label: 'Current streak',
            value: plural(calendar.currentStreak, 'day'),
            note: `Longest ${plural(calendar.longestStreak, 'day')}`,
          },
        ]}
      />
    </Panel>
  )
}
