import { Link } from 'react-router-dom'
import { PageHeader } from '../../ui/PageHeader'
import { Panel } from '../../ui/Panel'

export function AboutPage() {
  return (
    <div className="stack">
      <PageHeader title="About" />
      <Panel className="stack legal-panel">
        <p>
          CubeTimer is a free, open-source speedcubing timer. It works in the browser, installs as an app, and keeps
          timing when you are offline.
        </p>
        <ul>
          <li>Hold-to-start timer with scrambles and +2 / DNF penalties</li>
          <li>Bluetooth (QiYi, GAN) and wired (Stackmat-compatible, MoYu) timers</li>
          <li>2x2, 3x3, 4x4, 5x5, Megaminx, and Pyraminx</li>
          <li>Sessions, stats, history, and customizable desktop widgets</li>
          <li>Optional sync across devices with a CubeSync account</li>
        </ul>
        <p>
          Your times are stored on your device. You can time as a guest without an account; signing in only adds sync.
          See the <Link to="/privacy">privacy policy</Link> for details.
        </p>
        <p>
          Made by Maciej Hetman. The source code, issue tracker, and user guide live on{' '}
          <a href="https://github.com/Maciek-Hetman/CubeTimer-web" target="_blank" rel="noreferrer">
            GitHub
          </a>
          , and sync is provided by{' '}
          <a href="https://github.com/Maciek-Hetman/cubesync" target="_blank" rel="noreferrer">
            CubeSync
          </a>
          .
        </p>
      </Panel>
    </div>
  )
}
