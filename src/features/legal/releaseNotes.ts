export interface Release {
  /** The git tag the release is deployed from. */
  version: string
  /** ISO date (YYYY-MM-DD). */
  date: string
  changes: string[]
}

/** Newest first. Add an entry here before pushing a new version tag. */
export const RELEASES: Release[] = [
  {
    version: 'v0.5.0',
    date: '2026-10-01',
    changes: [
      'A redesigned Stats page with a tab per event and an All tab for stats across events.',
      'Personal bests and current averages now go up to Ao1000.',
      'An activity calendar of solves per day, and a breakdown of solves by event.',
      'A failed screen now shows an error with a reload button instead of a blank page.',
      'CubeTimer Web is now free software under the GPL-3.0-or-later license.',
    ],
  },
  {
    version: 'v0.4.0',
    date: '2026-09-30',
    changes: [
      'Release notes, linked from the footer.',
      'The app now updates itself after a new version is released, without a hard refresh. It switches over when you open the app, change pages, or leave the tab, and never in the middle of a solve.',
    ],
  },
  {
    version: 'v0.3.3',
    date: '2026-09-30',
    changes: [
      'About and Privacy pages, linked from the footer.',
      'Keyboard solves are saved in whole milliseconds, so they no longer get rejected by sync.',
      'Changes the server rejected can be retried from the Account page.',
      'Guests no longer see a "Local only" sync pill.',
      'The desktop timer no longer overflows the window.',
      'The recent Ao5 chart uses your accent color.',
    ],
  },
  {
    version: 'v0.3.2',
    date: '2026-09-30',
    changes: [
      'A more compact top bar and a slightly smaller type scale.',
      'Hold-to-start timing is more reliable.',
      'The timer toolbar dropdowns match the card background.',
    ],
  },
  {
    version: 'v0.3.1',
    date: '2026-09-29',
    changes: [
      'Focus mode: a single setting that hides everything but the timer while you solve.',
      'The interface scales up on large desktop screens.',
      'Staying signed in is more reliable with several tabs open.',
      'Requests to the sync server time out after 30 seconds instead of hanging.',
      'Sync conflict handling and guest data adoption fixes.',
    ],
  },
  {
    version: 'v0.3.0',
    date: '2026-09-28',
    changes: [
      'Wired timer support (Stackmat-compatible and MoYu timers) through the microphone input.',
      'A keyboard controls setting.',
      'Sign in with Google.',
    ],
  },
  {
    version: 'v0.2.0',
    date: '2026-09-18',
    changes: [
      'Bluetooth timer support (QiYi and GAN).',
      'A reworked History page with timing device info and solve sharing.',
    ],
  },
  {
    version: 'v0.1.1',
    date: '2026-09-18',
    changes: ['Fixed a deployment issue that kept the site from loading.'],
  },
  {
    version: 'v0.1',
    date: '2026-09-18',
    changes: [
      'First release: hold-to-start timer with scrambles, automatic sessions, stats with Ao5/Ao12 trends, and solve history.',
      'Themes, accent colors, timer fonts, and customizable desktop widgets.',
      'Optional account with sync across devices through CubeSync.',
    ],
  },
]
