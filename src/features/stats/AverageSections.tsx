import { useId } from 'react'
import {
  AO_WINDOWS,
  bestAverage,
  currentAverage,
  type AoWindow,
  type SolveStats,
} from '../../data/repositories/solveStats'
import { formatAverage } from '../../domain/stats/formatTime'
import { Panel } from '../../ui/Panel'

/** Ao5 and Ao12 get the big treatment; the longer averages sit in a compact row under them. */
const HEADLINE_WINDOWS: AoWindow[] = [5, 12]
const LONGER_WINDOWS = AO_WINDOWS.filter((n) => !HEADLINE_WINDOWS.includes(n))

interface Stat {
  label: string
  /** Null until there are enough solves for it. */
  value: string | null
  needs: number
}

function stat(label: string, value: number | null, count: number, needs: number): Stat {
  return { label, value: count < needs ? null : formatAverage(value), needs }
}

export function PersonalBests({ stats }: { stats: SolveStats }) {
  const headingId = useId()
  const headline = [
    stat('Single', stats.best, stats.count, 1),
    ...HEADLINE_WINDOWS.map((n) => stat(`Ao${n}`, bestAverage(stats, n), stats.count, n)),
  ]
  const longer = LONGER_WINDOWS.map((n) => stat(`Ao${n}`, bestAverage(stats, n), stats.count, n))

  return (
    <Panel role="region" aria-labelledby={headingId} className="stats-bests stack">
      <h2 id={headingId}>Personal bests</h2>
      <HeadlineStats items={headline} />
      <CompactStats items={longer} />
    </Panel>
  )
}

export function CurrentAverages({ stats }: { stats: SolveStats }) {
  const headingId = useId()
  const headline = HEADLINE_WINDOWS.map((n) => stat(`Ao${n}`, currentAverage(stats, n), stats.count, n))
  const longer = LONGER_WINDOWS.map((n) => stat(`Ao${n}`, currentAverage(stats, n), stats.count, n))

  return (
    <Panel role="region" aria-labelledby={headingId} className="stats-current stack">
      <h2 id={headingId}>Current averages</h2>
      <HeadlineStats items={headline} />
      <CompactStats items={longer} />
    </Panel>
  )
}

function HeadlineStats({ items }: { items: Stat[] }) {
  return (
    <dl className="stats-headline">
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd className={item.value === null ? 'stats-headline-value pending' : 'stats-headline-value'}>
            {item.value ?? '—'}
          </dd>
          {item.value === null ? <dd className="stats-headline-note">Needs {item.needs} solves</dd> : null}
        </div>
      ))}
    </dl>
  )
}

function CompactStats({ items }: { items: Stat[] }) {
  return (
    <dl className="stats-compact">
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          {item.value === null ? (
            <dd className="pending" title={`Needs ${item.needs} solves`}>
              —<span className="sr-only">, needs {item.needs} solves</span>
            </dd>
          ) : (
            <dd>{item.value}</dd>
          )}
        </div>
      ))}
    </dl>
  )
}
