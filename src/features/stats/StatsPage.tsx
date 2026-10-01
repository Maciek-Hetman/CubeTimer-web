import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useApp } from '../../app/AppContext'
import { summarizeEvents } from '../../data/repositories/solveStats'
import { EVENTS, eventLabel, isCubeEvent, type CubeEvent } from '../../domain/models'
import { PageHeader } from '../../ui/PageHeader'
import { AllEventsStats } from './AllEventsStats'
import { EventStats } from './EventStats'

/** A tab per event, plus All for what they share. */
type StatsTab = CubeEvent | 'all'

export function StatsPage() {
  const { settings, ownerId } = useApp()
  const [searchParams] = useSearchParams()
  // Any tab can show without moving the timer off the event it's on.
  const requested = searchParams.get('event')
  const tab: StatsTab = requested === 'all' ? 'all' : isCubeEvent(requested) ? requested : settings.event

  // Feeds the All tab, and tells the switcher which events have no solves yet.
  const events = useLiveQuery(() => summarizeEvents(ownerId), [ownerId])
  const withSolves = useMemo(() => (events ? new Set(events.map((entry) => entry.event)) : null), [events])

  return (
    <div className="stack">
      <PageHeader title="Stats" actions={<EventSwitcher selected={tab} withSolves={withSolves} />} />
      {tab === 'all' ? <AllEventsStats events={events} /> : <EventStats event={tab} />}
    </div>
  )
}

function EventSwitcher({ selected, withSolves }: { selected: StatsTab; withSolves: ReadonlySet<CubeEvent> | null }) {
  return (
    <nav className="stats-events" aria-label="Event">
      <Link to="?event=all" replace className="all" aria-current={selected === 'all' ? 'page' : undefined}>
        All
      </Link>
      {EVENTS.map((event) => {
        const empty = withSolves !== null && !withSolves.has(event)
        return (
          <Link
            key={event}
            to={`?event=${event}`}
            replace
            aria-current={event === selected ? 'page' : undefined}
            className={empty ? 'empty' : undefined}
            title={empty ? 'No solves yet' : undefined}
          >
            {eventLabel(event)}
            {/* The dimming is visual only, so say it too. The comma survives name trimming; a space wouldn't. */}
            {empty ? <span className="sr-only">, no solves yet</span> : null}
          </Link>
        )
      })}
    </nav>
  )
}
