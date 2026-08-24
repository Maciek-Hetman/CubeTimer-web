# CubeTimer Web

Responsive, offline-first cube timer. Mobile layout follows the Android CubeTimer app. Desktop adds a fixed center timer with customizable side widgets. Cubing sessions are managed on the client and optionally replicated to [CubeSync](https://github.com/Maciek-Hetman/cubesync).

## Stack

- React + TypeScript + Vite PWA
- Dexie / IndexedDB as the source of truth
- CubeSync `POST /v1/sync` for signed-in accounts

## Local development

```bash
cp .env.example .env
npm install
npm run dev
```

The app listens on `http://127.0.0.1:43210` so it matches CubeSync's default `ALLOWED_ORIGINS`.

## CubeSync

Set `VITE_CUBESYNC_URL` to your API origin (default `http://127.0.0.1:43781`).

The backend must allow this web origin:

- `ALLOWED_ORIGINS` includes the Vite origin, for example `http://127.0.0.1:43210`
- `CLIENT_URL` should be the web app origin so verification and reset emails open `/verify-email?token=` and `/reset-password?token=`

Timing works as a guest without an account. After sign-in, local guest sessions and solves are adopted by the account and uploaded. They do not overwrite existing remote records. Logout closes automatic sessions, hides account data, and starts a new empty guest profile.

Preferences and widget layouts stay on the device. CubeSync has no settings entity.

## Sessions

- **Manual:** switch, create, rename, and delete sessions from the timer. Deleting a session also deletes its times.
- **Automatic:** nearby solves share a session named from weekday and time of day (for example `Saturday evening`). A new session starts after the configured inactivity gap or after logout.

## Scripts

```bash
npm run dev
npm run test
npm run e2e
npm run build
npm run preview
```

Playwright browsers: `npx playwright install chromium`

## Deployment

Build static files with `npm run build` and serve `dist/` over HTTPS. Point `VITE_CUBESYNC_URL` at the public CubeSync URL, and keep CubeSync CORS / `CLIENT_URL` in sync with the deployed origin. Authenticated API traffic is not cached by the service worker.
