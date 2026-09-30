import { PageHeader } from '../../ui/PageHeader'
import { Panel } from '../../ui/Panel'

export function PrivacyPage() {
  return (
    <div className="stack">
      <PageHeader title="Privacy policy" />
      <Panel className="stack legal-panel">
        <h2>Guest use</h2>
        <p>
          Without an account, everything stays on your device: solves, sessions, settings, and widget layouts are kept
          in your browser&rsquo;s local storage (IndexedDB). Nothing is sent to a server, and clearing your browser data
          deletes it.
        </p>

        <h2>Accounts and sync</h2>
        <p>
          If you register or sign in, the app talks to a CubeSync server. It receives your email address, your password
          (or your Google account identity if you sign in with Google), your solves and sessions, and a device name and
          ID so sync can tell your devices apart. A sign-in token is kept in your browser so you stay signed in. Logging
          out signs you out and switches this device back to a separate local guest profile.
        </p>
        <p>
          The server also records technical request data, such as route, response time, and errors, to keep the service
          running. You can delete your account from the Account page, which deletes it from the server and clears its data from this device.
        </p>

        <h2>Timers and permissions</h2>
        <p>
          Bluetooth timers use your browser&rsquo;s Web Bluetooth permission. Wired timers use the microphone permission
          to read the timer&rsquo;s signal; audio is decoded on your device and is never recorded or uploaded.
        </p>

        <h2>Cookies and tracking</h2>
        <p>
          CubeTimer sets no advertising or analytics cookies and contains no third-party trackers. Signing in with Google
          loads Google&rsquo;s sign-in script, which is subject to Google&rsquo;s own privacy policy.
        </p>

        <h2>Contact</h2>
        <p>
          Questions or deletion requests:{' '}
          <a href="https://github.com/Maciek-Hetman/CubeTimer-web/issues" target="_blank" rel="noreferrer">
            open an issue on GitHub
          </a>
          .
        </p>
      </Panel>
    </div>
  )
}
