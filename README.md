# CubeTimer Web

Responsive, offline-first cube timer. Mobile layout follows the Android CubeTimer app. Desktop adds a fixed center timer with customizable side widgets. Cubing sessions are managed on the client and optionally replicated to [CubeSync](https://github.com/Maciek-Hetman/cubesync).

## What you can do

- Time solves with hold-to-start (tap or Space), scramble generation, and +2 / DNF penalties
- Track 2x2, 3x3, 4x4, 5x5, Megaminx, and Pyraminx
- Use automatic or manual sessions, inspect stats, and customize desktop widgets
- Time as a guest offline; sign in to sync verified accounts with CubeSync
- View CubeSync platform metrics on `/admin` if your account has the admin role

## Docs

- [User guide](docs/user-guide.md) — timer, sessions, stats, sync, and admin access
- [Development](docs/development.md) — architecture, setup, API, tests, and troubleshooting
- [CubeSync OpenAPI](openapi/cubesync.yaml) — backend contract used by this client

## Quick start

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

Admin metrics (`GET /v1/admin/stats/*`) require a CubeSync user with `user_role: admin`. The UI hides the Admin item for everyone else; the API still enforces 401/403.

## Scripts

```bash
npm run dev
npm run test
npm run test:watch
npm run typecheck
npm run lint
npm run e2e
npm run build
npm run preview
```

Playwright browsers: `npx playwright install chromium`

## Deployment

Build static files with `npm run build` and serve `dist/` over HTTPS. Point `VITE_CUBESYNC_URL` at the public CubeSync URL, and keep CubeSync CORS / `CLIENT_URL` in sync with the deployed origin. Authenticated API traffic is not cached by the service worker.
