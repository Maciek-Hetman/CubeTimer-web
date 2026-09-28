# CubeTimer Web

## Frontend

- Stack: React 19 + TypeScript 6, Vite 8 (+ vite-plugin-pwa), react-router-dom 7, Dexie (IndexedDB), Recharts. npm (`package-lock.json`), Node 24 in CI.
- Dev: `npm run dev` → http://127.0.0.1:43210 (fixed host/port; CubeSync CORS expects it)
- Lint: `npm run lint` (oxlint, `.oxlintrc.json`)
- Typecheck: `npm run typecheck` (`tsc -b`)
- Test: `npm run test` (Vitest, `*.test.ts(x)` next to source) · E2E: `npm run e2e` (Playwright, `e2e/`, mobile + desktop projects)
- Layout: routes in `src/App.tsx`, pages in `src/features/`, shared UI in `src/ui/`, providers in `src/app/`.
- Reuse `src/ui/` components (Button, Field, Dialog, Alert, EmptyState, Panel…) before adding new ones.
- Subagents live in `.claude/agents/`. Full loop: `claude --agent pipeline`.
