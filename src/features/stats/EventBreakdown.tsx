import { useId } from 'react'
import { Link } from 'react-router-dom'
import type { EventSummary } from '../../data/repositories/solveStats'
import { eventLabel, type CubeEvent } from '../../domain/models'
import { formatAverage, formatTotalTime } from '../../domain/stats/formatTime'
import { Panel } from '../../ui/Panel'

function formatShare(count: number, total: number): string {
  const percent = (count / total) * 100
  return percent > 0 && percent < 1 ? '<1%' : `${Math.round(percent)}%`
}

/** Solves, time and bests per event. Each event links to its stats. */
export function EventBreakdown({ events, selected }: { events: EventSummary[]; selected: CubeEvent }) {
  const headingId = useId()
  const total = events.reduce((sum, entry) => sum + entry.count, 0)
  const busiest = Math.max(1, ...events.map((entry) => entry.count))

  return (
    <Panel role="region" aria-labelledby={headingId} className="stats-breakdown stack">
      <h3 id={headingId}>Events</h3>
      <div className="stats-breakdown-scroll">
        <table className="stats-breakdown-table">
          <thead>
            <tr>
              <th scope="col">Event</th>
              <th scope="col">Solves</th>
              <th scope="col" className="num">
                Share
              </th>
              <th scope="col" className="num">
                Time
              </th>
              <th scope="col" className="num">
                Best
              </th>
              <th scope="col" className="num">
                Mean
              </th>
            </tr>
          </thead>
          <tbody>
            {events.map((entry) => {
              const current = entry.event === selected
              return (
                <tr key={entry.event} className={current ? 'current' : undefined}>
                  <th scope="row">
                    <Link
                      to={`?event=${entry.event}`}
                      replace
                      aria-current={current ? 'page' : undefined}
                      // The event's stats are at the top of the page.
                      onClick={() => window.scrollTo(0, 0)}
                    >
                      {eventLabel(entry.event)}
                    </Link>
                  </th>
                  <td>
                    <span className="stats-breakdown-count">
                      <span className="stats-breakdown-bar" aria-hidden="true">
                        <span style={{ width: `${(entry.count / busiest) * 100}%` }} />
                      </span>
                      {entry.count.toLocaleString()}
                    </span>
                  </td>
                  <td className="num">{formatShare(entry.count, total)}</td>
                  <td className="num">{formatTotalTime(entry.totalTime)}</td>
                  <td className="num">{formatAverage(entry.best)}</td>
                  <td className="num">{formatAverage(entry.mean)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}
