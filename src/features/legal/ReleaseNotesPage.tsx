import { PageHeader } from '../../ui/PageHeader'
import { Panel } from '../../ui/Panel'
import { RELEASES, type Release } from './releaseNotes'

const dateFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

function formatReleaseDate(date: string): string {
  return dateFormat.format(new Date(`${date}T00:00:00Z`))
}

function releaseId(version: string): string {
  return `release-${version.replace(/[^A-Za-z0-9_-]/g, '-')}`
}

export function ReleaseNotesPage({
  releases = RELEASES,
  currentVersion = __APP_VERSION__,
}: {
  releases?: Release[]
  currentVersion?: string
}) {
  return (
    <div className="stack">
      <PageHeader title="Release notes" subtitle={`You're using ${currentVersion}.`} />
      <Panel className="stack legal-panel">
        {releases.map((release) => (
          <section key={release.version} className="stack release" aria-labelledby={releaseId(release.version)}>
            <div className="release-heading">
              <h2 id={releaseId(release.version)}>{release.version}</h2>
              {release.version === currentVersion ? <span className="release-current">Current</span> : null}
              <time className="muted" dateTime={release.date}>
                {formatReleaseDate(release.date)}
              </time>
            </div>
            <ul>
              {release.changes.map((change, index) => (
                <li key={index}>{change}</li>
              ))}
            </ul>
          </section>
        ))}
      </Panel>
    </div>
  )
}
