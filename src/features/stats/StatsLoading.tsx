import { Panel } from '../../ui/Panel'

/** What a stats tab shows while its first query loads. */
export function StatsLoading() {
  return (
    <Panel className="stack" role="status">
      <p className="muted" style={{ margin: 0 }}>
        Loading stats…
      </p>
    </Panel>
  )
}
