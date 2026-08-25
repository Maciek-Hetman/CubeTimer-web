# CubeTimer user guide

CubeTimer is an offline-first cube timer. Times are stored on this device. Signing in with a verified CubeSync account enables sync across devices.

## Timer

Open **Timer** (home). Hold the timer surface or **Space** until the hold delay completes, then release to start. Tap or press Space again to stop.

Hold delay is configurable in Settings (200–1000 ms, with presets 300 / 500 / 550 / 1000). Releasing early or cancelling the hold returns to idle without starting a solve.

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
