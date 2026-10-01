export interface HeadlineStat {
  label: string
  /** Null shows a muted dash, for a stat there isn't enough data for yet. */
  value: string | null
  note?: string
}

/** The page's biggest figures: a label, the value, and an optional note under it. */
export function HeadlineStats({ items }: { items: HeadlineStat[] }) {
  return (
    <dl className="stats-headline">
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd className={item.value === null ? 'stats-headline-value pending' : 'stats-headline-value'}>
            {item.value ?? '—'}
          </dd>
          {item.note ? <dd className="stats-headline-note">{item.note}</dd> : null}
        </div>
      ))}
    </dl>
  )
}
