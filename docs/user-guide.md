# CubeTimer user guide

CubeTimer is an offline-first cube timer. Times are stored on this device. Signing in with a verified CubeSync account enables sync across devices.

## Timer

Open **Timer** (home). Hold a key or the timer surface until the hold delay completes, then release to start. Press a key or tap again to stop.

**Settings → Timer → Start and stop with** picks the inputs:

- **Spacebar only**
- **Any key**: every key except modifiers, Tab, Esc and the F keys, which stay with the browser
- **Any key, touch and mouse** (default): also tap or click and hold on the timer

Hold delay is configurable in Settings (0–1000 ms, with presets 100 / 200 / 300 / 500 / 750 / 1000). Releasing early or cancelling the hold returns to idle without starting a solve.

### Bluetooth timer

In the timer toolbar, next to the event selector (or in **Settings → Timer**), switch the timing device to **Bluetooth**, then press **Connect timer** and pick your device. Supported devices are the QiYi Smart Timer, the QiYi timer Bluetooth adapter (`QY-Adapter-…`), and GAN Smart Timers. Solves start and stop on the physical timer. The saved time is the one the timer reports, and the solve is tagged as `external_timer`. Keyboard and touch input are turned off in this mode. This needs a browser with Web Bluetooth, such as Chrome or Edge on desktop or Android. Safari and Firefox don't support it. You have to reconnect after reloading the page.

### Wired timer

Timers with a data port (Speed Stacks, QiYi, YJ, GAN Halo, MoYu and most clones) can be plugged into a microphone or line-in jack with a 2.5 mm to 3.5 mm cable, or into a USB audio adapter. Phones and laptops with a combined headset jack need a TRRS adapter, since a plain 3.5 mm plug doesn't reach the microphone contact there.

Switch the timing device to **Wired** and press **Connect timer**, then allow microphone access. The dot turns green once the timer's signal comes in; if it stays yellow, turn the timer on and check the cable and the audio input in **Settings → Timer**. Solves start and stop on the timer, the saved time is the one it shows, and the solve is tagged as `external_timer`. After the first time, the app reconnects on its own when the page loads, as long as the microphone stays allowed.

Timers differ in what they report, and the app copes with each:

- Some send hundredths (Speed Stacks Gen 2/3, QiYi, most clones), others thousandths (Speed Stacks Gen 4 and later). Both work.
- Timers that report hands on the pads (older Speed Stacks and some clones) show the ready state on screen before you start.
- Others, including Speed Stacks Gen 4 and GAN Halo, report little or no status. A start is then noticed from the time counting up, a moment after the real start, and a stop from it holding still. The saved time is always the timer's own.
- **MoYu** timers use their own signal format. Pick **MoYu** under **Settings → Timer → Wired timer type**.

A solve is dropped if the timer is reset mid-solve or its signal is lost for more than a second.

Supported events: 2x2, 3x3, 4x4, 5x5, Megaminx, and Pyraminx. Switch events from the timer. Each event keeps its own current session.

You can hide the scramble, averages, or last results during a solve, and enable focus mode to hide chrome while the timer is running. On viewports narrower than 1200px the timer uses a compact mobile layout; at 1200px and above the desktop widget dashboard appears.

## Desktop dashboard

On wide screens the timer stays centered, with widgets on the sides: recent times, averages (Ao5–Ao100), session stats, and recent solves.

Use **Edit widgets** in the header to add, remove, or rearrange widgets. Layouts are stored only on this device.

## Sessions

- **Automatic:** nearby solves share a session named from weekday and time of day (for example `Saturday evening`). A new session starts after the inactivity gap (5–240 minutes) or after logout.
- **Manual:** create, rename, switch, and delete sessions from the timer or Settings. Deleting a session also deletes its times.

## Stats

**Stats** shows all-time and current-session summaries: best, mean, Ao5, Ao12, and best averages. The history list (recent solves) supports +2, DNF, and delete with confirmation.

## Theme

Use the sun/moon control in the header (or on the timer on small screens) to choose system, light, or dark.

## Offline and PWA

The app works without a network as a guest. You can install it as a PWA. Authenticated API calls are never served from the service worker cache.

## Account and sync

Register or sign in from **Settings**. Verify your email before sync runs. Guest times are merged into the account on first sign-in; they do not overwrite existing server records.

The sync indicator reports local-only, pending, syncing, offline, error, or conflict. If a conflict appears, choose **keep server** or **keep mine**.

Forgot-password and email-verification links open `/forgot-password`, `/reset-password?token=`, and `/verify-email?token=`. CubeSync `CLIENT_URL` must point at this web app for those links to work.

## Admin dashboard

Accounts with CubeSync `user_role: admin` see **Admin** in navigation. The page at `/admin` shows platform totals plus request volume, latency, and errors by route for 24 hours, 7 days, or 30 days.

Guests are sent to sign-in. Signed-in non-admin users see an access denied message. CubeSync still returns 401/403 if a non-admin calls the admin APIs directly.
