# CubeTimer-web E2E Test Infrastructure & Methodology

## 1. Test Philosophy: Opaque-Box, Requirement-Driven Testing

The CubeTimer-web end-to-end (E2E) testing framework follows strict **opaque-box, requirement-driven** principles:
- **Specification-First**: Tests are designed directly from user requirements (as specified in `ORIGINAL_REQUEST.md`, `PROJECT.md`, and World Cube Association WCA regulations), without relying on internal private state or white-box shortcuts.
- **Contract-Based Assertions**: UI outputs, DOM accessibility trees, IndexedDB persistence records, and computed statistics are verified against authoritative domain math and user interaction semantics.
- **Progressive Testability & Independence**: Every test is completely self-contained. State is cleanly initialized before each test (using clean IndexedDB schemas and isolated guest/user profiles) and torn down after execution without cross-test leakage.
- **Zero-Tolerance for Facade Tests**: All tests perform genuine state transitions, DOM dispatches, timers, mutations, and database queries. No artificial `expect(true).toBe(true)` or hardcoded stubs are permitted.

---

## 2. 4-Tier Test Methodology

The E2E test suite is structured into four comprehensive tiers to ensure complete coverage, edge-case resilience, system integration, and real-world durability.

```
┌─────────────────────────────────────────────────────────────────────────┐
│              Tier 4: Real-World Workload Scenarios                      │
│   (12-Solve Sessions, Outlier Deletion, PB Streaks, State Restoration)  │
├─────────────────────────────────────────────────────────────────────────┤
│              Tier 3: Cross-Feature Interaction Matrix                   │
│   (Session Switching + Scramble, Penalties + Stats, Offline Queueing)   │
├─────────────────────────────────────────────────────────────────────────┤
│              Tier 2: Boundary, Corner & Adversarial Cases               │
│   (Instant/Long Holds, Rapid Solve Spam, DNF Sets, Unicode Sessions)    │
├─────────────────────────────────────────────────────────────────────────┤
│              Tier 1: Core Feature Isolation Coverage                    │
│   (Timer Engine, Penalties, Scramblers, Session Manager, WCA Stats)     │
└─────────────────────────────────────────────────────────────────────────┘
```

### Tier 1: Core Feature Isolation Coverage (>=5 tests per core feature)
Verifies each speedcubing functional domain in isolation:
1. **Timer Operations**: Spacebar hold-to-start timing cycle (`idle` -> `holding` -> `ready` -> `running` -> `finished`), hold progress bar, release trigger, auto-stop on key press/tap, system key suppression.
2. **Inspection & Hold Preparation**: Hold start delay configuration (`timerStartDelayMs`), hold cancellation upon premature release, pointer capture cancellation, hint visibility toggle (`showTimerHints`).
3. **Penalty Management**: Application and toggling of `+2` (+2000ms duration penalty), `DNF` (Did Not Finish, effective time null), penalty reversal to `none`, and formatted string representations (`12.34+`, `DNF`).
4. **Scramble Generation & Validation**: Scramble generation and move syntax validation across all supported events (`3x3`, `2x2`, `4x4`, `5x5`, `megaminx`, `pyraminx`), scramble reloading, and error recovery states.
5. **Session Management**: Session creation, session switching across events, session renaming, cascade session deletion (with associated solves), and automatic vs manual session modes.
6. **WCA Statistics & Averages**: Accurate computation of Best Single, Worst Single, Session Mean, Standard Deviation, Ao5 (trimmed mean of 5), and Ao12 (trimmed mean of 12) conforming to WCA trimming regulations.

### Tier 2: Boundary & Corner Cases (>=5 tests per category)
Validates system resilience under extreme input and boundary conditions:
1. **Timing Boundaries**: Instant press/release (0ms tap without waiting for hold), extreme long holds (>2000ms past ready state), 0ms hold delay configuration.
2. **Rapid Concurrency & Spam**: Rapid successive solve triggers, immediate keypresses post-finish, repeated spacebar spam suppression.
3. **Dataset Extremes**: 0 solves (empty state rendering and zero-division guard), 1-2 solves (insufficient data for Ao5), exactly 5 solves with single DNF (trimmed) vs multiple DNFs (average DNF).
4. **Volume & Session Boundaries**: High solve volume sessions, pagination across session lists, orphan solve aggregation.
5. **Character & Input Robustness**: Session names with Unicode, emojis (🔥 🧩 ⏱️), accents, HTML entities, and extreme whitespace handling.

### Tier 3: Cross-Feature Interactions
Tests multi-component interactions and reactive state synchronization:
1. **Session Switch with Active Scramble**: Switching sessions or events while a scramble is active ensures clean scramble regeneration and session association.
2. **Penalty Modification during Live Stats Calculation**: Editing a solve penalty in History or Recent Solves immediately triggers recomputation of Session Stats, All-Time Stats, and Best PB records.
3. **Event Switching & Isolation**: Switching between 3x3 and 2x2 isolates solves, averages, personal bests, and scramble generators per event without bleed-through.
4. **Offline Mutation Queueing & Sync Recovery**: Storing solves offline enqueues mutation records to `db.outbox`, transitions sync status, and updates live query subscribers seamlessly.
5. **Cascade Session Deletion & Active Session Reassignment**: Deleting the currently active session updates settings to unset active session ID and clears related statistics.

### Tier 4: Real-World Workload Scenarios
Simulates realistic speedcuber training and competition sessions end-to-end:
1. **Full 12-Solve Competition Simulation**: Simulates a complete 12-solve round with mixed times, a `+2` penalty, and a `DNF`, verifying progressive Ao5 calculation at solve 5 and final official Ao12 at solve 12.
2. **Outlier Deletion Workflow**: A speedcuber records a corrupted or mis-timed solve, navigates to History, deletes the outlier solve, and confirms that session averages, all-time PBs, and count reflect the accurate remaining set.
3. **Personal Best (PB) Progression Streak**: Simulates a session where a cuber progressively breaks single PB and Ao5 PB, verifying PB notification toast triggers, confetti dispatch, and stat updates.
4. **Full Persistence & State Restoration Reload**: Simulates an entire session with multiple solves, custom session names, and updated settings, followed by a simulated page reload (unmounting and remounting AppProviders with the same database) to verify 100% data integrity and state recovery.

---

## 3. Test Architecture & Runner

### Test Runner Commands
- **Run Full Test Suite**: `npm test` (executes `vitest run`)
- **Watch Mode**: `npm run test:watch` (executes `vitest`)
- **Typecheck**: `npm run typecheck` (`tsc -b`)
- **Linting**: `npm run lint` (`oxlint`)

### Directory Layout
```
src/test/
├── setup.ts                    # Global setup (fake-indexeddb, matchMedia polyfill)
└── e2e/
    ├── tier1-core-features.test.tsx      # Tier 1: Core speedcubing feature tests
    ├── tier2-boundary-cases.test.tsx     # Tier 2: Boundary & corner case tests
    ├── tier3-cross-feature.test.tsx      # Tier 3: Cross-feature interaction tests
    └── tier4-workflows.test.tsx          # Tier 4: Real-world workload & workflow tests
```

### Technology Stack
- **Test Framework**: Vitest 4.x
- **DOM / Environment**: jsdom with `@testing-library/react` and `@testing-library/user-event`
- **IndexedDB In-Memory Emulation**: `fake-indexeddb`
- **Assertion Library**: Vitest `expect` + `@testing-library/jest-dom` matchers
