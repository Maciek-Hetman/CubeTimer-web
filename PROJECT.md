# Project: CubeTimer-web Optimization & Backend Parity

## Architecture
- **UI / Presentation Layer**: React 19 SPA with Vite, CSS modules / tokens, dynamic dashboard widgets, responsive navigation (`AppShell.tsx`), timer engine view (`TimerPage.tsx`).
- **State Management Layer**: Modular domain contexts (`AuthContext`, `SettingsContext`, `SyncContext`, `ScrambleContext`, `SolvesContext`) replacing monolithic `AppProviders.tsx`.
- **Persistence & Offline Data Layer**: IndexedDB via Dexie with `useLiveQuery`, streaming stats calculator (`solveStats.ts`), indexed query traversal, and atomic transactions.
- **Backend & Network Layer**: HTTP client (`src/api/*`) aligned with `cubesync` OpenAPI schema (v1 REST endpoints, Google federated auth, health probes, snapshots, server-side stats/history) and offline-first sync protocol engine (`src/sync/*`).
- **Testing & Verification Layer**: Vitest + Testing Library + User Event test harness, 4-tier opaque-box E2E test suite + Tier 5 adversarial stress suite.

```
┌─────────────────────────────────────────────────────────────┐
│                       React 19 SPA                          │
│  ┌───────────────┐ ┌───────────────────┐ ┌───────────────┐  │
│  │   TimerPage   │ │ DesktopDashboard  │ │  Stats/Admin  │  │
│  └───────┬───────┘ └─────────┬─────────┘ └───────┬───────┘  │
└──────────┼───────────────────┼───────────────────┼──────────┘
           │                   │                   │
┌──────────▼───────────────────▼───────────────────▼──────────┐
│                 Modular Domain Contexts                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────────────┐ │
│  │   Auth   │ │ Settings │ │   Sync   │ │ Solves/Scramble │ │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────────┬────────┘ │
└───────┼────────────┼────────────┼────────────────┼──────────┘
        │            │            │                │
┌───────▼────────────▼────────────▼────────────────▼──────────┐
│               Data Repositories & Sync Engine               │
│  ┌─────────────────────────────┐ ┌────────────────────────┐ │
│  │    Dexie / IndexedDB Store  │ │    cubesync API Client │ │
│  │  (indexed scans, bulk puts) │ │  (OpenAPI spec parity) │ │
│  └─────────────────────────────┘ └────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | OpenAPI Schema Alignment | Align `openapi/cubesync.yaml` with remote `cubesync/api/openapi.yaml` (cursor error logs, Google provider enum, error schemas) | M1 | Survey (Spec Miner) |
| 2 | Missing API Client Endpoints | Implement `snapshot`, `federatedLogin`, `linkFederatedIdentity`, `getHealthLive`, `getHealthReady`, `getServerStats`, `getServerSessions`, `getServerSolves` in `src/api/*` | M1 | Survey (Spec Miner) |
| 3 | API Types & Models Parity | Update `src/api/types.ts` with `SnapshotRequest/Response`, `StatsResponse`, `FederatedInput`, Protocol v2 `DeleteStub`/`ConflictStub`, session & error models | M1 | Survey (Spec Miner) |
| 4 | Sync Protocol Robustness & Recovery | Implement `cursor_expired` (HTTP 409) recovery via snapshot bootstrap and Protocol v2 stub handling in `src/sync/syncEngine.ts` | M1 | Survey (Spec Miner) |
| 5 | API Client & Sync Test Coverage | Create dedicated unit/integration tests for `client.ts`, `sync.ts`, `auth.ts`, `stats.ts`, `history.ts`, `health.ts`, `syncEngine.ts` | M1 | Survey (Spec Miner) |
| 6 | Dead Code & Asset Elimination | Safely remove unused `TextInput`, `TextTextarea`, `SunIcon`, `MoonIcon`, `replaceOutbox`, `setup.dom.ts`, `hero.png`, and unreferenced CSS selectors/tokens | M2 | Survey (Audit Explorer) |
| 7 | Oxlint Warnings Elimination | Fix 6 `react(set-state-in-effect)` and 4 `react(only-export-components)` warnings across admin, timer, dashboard, shell, providers | M2 | Survey (Audit Explorer) |
| 8 | Internal Symbol Scope Encapsulation | Remove redundant `export` modifiers on internal-only module symbols | M2 | Survey (Audit Explorer) |
| 9 | Monolithic Context Modularization | Refactor `AppProviders.tsx` (38 properties) into 5 focused contexts (`AuthContext`, `SettingsContext`, `SyncContext`, `ScrambleContext`, `SolvesContext`) with separate hooks | M3 | Survey (Perf Explorer) |
| 10 | Re-render Cascade Prevention | Migrate 32+ call sites across navigation, timer, dashboard widgets, stats, and admin to consume targeted modular contexts | M3 | Survey (Perf Explorer) |
| 11 | Dexie Query & Mutation Optimization | Optimize `listSolves` using `[ownerId+event+solvedAt]` reverse index scan; convert sequential delete/sync loops to `bulkPut` | M4 | Survey (Perf Explorer) |
| 12 | Timer Frame Isolation & Latency Precision | Isolate active `requestAnimationFrame` timer display to eliminate 60-144Hz re-renders of static UI; adopt `event.timeStamp` for input latency precision | M4 | Survey (Perf Explorer) |
| 13 | Test Suite Performance Optimization | Eliminate artificial delays in `TimerPage.test.tsx` and optimize dataset aggregation in `solveStats.test.ts` | M4 | Survey (Perf Explorer) |
| 14 | E2E Testing Infrastructure (Tiers 1-4) | Build comprehensive opaque-box test suite across all speedcubing operations and sync flows per user requirements | E2E Track | ORIGINAL_REQUEST |
| 15 | Quality Gate & 100% Verification | Pass `npm run typecheck`, `npm run lint` (0 errors, 0 warnings), `npm run build`, and 100% Vitest test pass rate | M5 | ORIGINAL_REQUEST |
| 16 | Adversarial Coverage Hardening (Tier 5) | White-box adversarial testing, edge-case stress validation, and integrity auditing | M5 (Phase 2) | ORIGINAL_REQUEST |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| E2E | E2E Testing Track | Requirement-driven opaque-box test infra & test cases (Tiers 1-4) | none | PLANNED |
| M1 | Backend API & Schema Alignment (R3) | `openapi/cubesync.yaml`, `src/api/*`, `src/sync/*`, API unit tests | none | PLANNED |
| M2 | Code Audit, Dead Code & Linting (R1) | Dead code/asset removal, oxlint warnings resolution, symbol encapsulation | none | PLANNED |
| M3 | Modular Context & Re-render Minimization (R2) | Split `AppProviders.tsx` into 5 contexts, update all consumers | M1, M2 | PLANNED |
| M4 | Dexie Optimization & Timer Latency Precision (R2) | Indexed reverse queries, `bulkPut`, `TimerDisplay` isolation, `event.timeStamp` | M3 | PLANNED |
| M5 | Final Integration, 100% E2E Pass & Adversarial Hardening | Pass 100% E2E tests (Tiers 1-4), 0 lint/typecheck/build errors, Tier 5 adversarial hardening | M4, E2E | PLANNED |

## Interface Contracts

### Modular Contexts ↔ Consumer Components
- `useAuth()`: `{ user, token, role, login, register, logout, requestPasswordReset, resetPassword, verifyEmail, resendVerificationEmail, deleteAccount, updatePassword }`
- `useSettings()`: `{ settings, updateSettings, isLoaded }`
- `useSync()`: `{ syncStatus, isOnline, triggerSync, lastSyncAt, error }`
- `useScramble()`: `{ scramble, event, setEvent, generateNewScramble, customScramble }`
- `useSolves()`: `{ solves, activeSession, sessions, addSolve, deleteSolve, updateSolve, changeSession, createSession, deleteSession }`
- Backward-compatibility shim: `useApp()` aggregates the above hooks during transition to prevent breaking legacy imports.

### Sync Engine ↔ Backend API Contract
- `POST /v1/snapshot`: `SnapshotRequest` -> `SnapshotResponse` (paged bootstrap recovery when HTTP 409 `cursor_expired` occurs).
- Protocol v2 stubs: `DeleteStub` (`{ id, deletedAt, isDeleted: true }`) and `ConflictStub` properly handled during merge.

## Code Layout
- `src/api/`: Typed client modules (`client.ts`, `auth.ts`, `sync.ts`, `health.ts`, `stats.ts`, `history.ts`, `admin.ts`, `types.ts`).
- `src/contexts/`: Domain-specific modular context providers and hooks (`AuthContext.tsx`, `SettingsContext.tsx`, `SyncContext.tsx`, `ScrambleContext.tsx`, `SolvesContext.tsx`, `index.ts`).
- `src/data/`: Database layer, repositories, Dexie schema (`db.ts`, `repositories/*`).
- `src/features/`: Feature modules (`timer/`, `dashboard/`, `stats/`, `history/`, `settings/`, `admin/`, `auth/`).
- `src/ui/`: Reusable UI primitives (`Button.tsx`, `Modal.tsx`, `Panel.tsx`, `Select.tsx`, etc.).
- `src/sync/`: Sync protocol engine and background coordinator (`syncEngine.ts`, `syncCoordinator.ts`).
- `openapi/`: Local OpenAPI specifications (`cubesync.yaml`).
- `tests/` / `src/**/*.test.ts(x)`: Vitest unit, integration, and E2E test suites.
