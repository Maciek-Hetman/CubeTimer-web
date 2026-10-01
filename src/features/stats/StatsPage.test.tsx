/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppSettings, CubeEvent, CubeSession } from '../../domain/models'
import { DEFAULT_SETTINGS } from '../../domain/models'
import { dayKey } from '../../domain/stats/activity'
import { EMPTY_SOLVE_STATS, type EventSummary, type SolveStats } from '../../data/repositories/solveStats'
import { StatsPage } from './StatsPage'

// Mock ResponsiveContainer and LineChart for jsdom
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts')
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="responsive-container" style={{ width: 500, height: 250 }}>
        {children}
      </div>
    ),
  }
})

const mocks = vi.hoisted(() => ({
  settings: {} as AppSettings,
  updateSettings: vi.fn(),
  setEvent: vi.fn(),
  eventStats: {} as Partial<Record<CubeEvent, SolveStats>>,
  sessionStats: {} as Record<string, SolveStats>,
  sessions: {} as Partial<Record<CubeEvent, CubeSession[]>>,
  summaries: [] as EventSummary[],
  dayCounts: new Map<string, number>(),
  /** Events whose stats query never settles, to hold a tab in its loading state. */
  pending: new Set<CubeEvent>(),
}))

vi.mock('../../app/AppContext', () => ({
  useApp: () => ({
    ownerId: 'u1',
    settings: mocks.settings,
    updateSettings: mocks.updateSettings,
    setEvent: mocks.setEvent,
    // The app-wide summary of the timer's event, the same numbers the page computes for it.
    solveStats: mocks.eventStats[mocks.settings.event] ?? { count: 0 },
  }),
}))

vi.mock('../../data/repositories/solveStats', async () => {
  const actual = await vi.importActual<typeof import('../../data/repositories/solveStats')>(
    '../../data/repositories/solveStats',
  )
  return {
    ...actual,
    computeSolveStats: (_ownerId: string, event: CubeEvent, sessionId?: string) =>
      !sessionId && mocks.pending.has(event)
        ? new Promise<never>(() => {})
        : Promise.resolve((sessionId ? mocks.sessionStats[sessionId] : mocks.eventStats[event]) ?? actual.EMPTY_SOLVE_STATS),
    collectChartSeries: async () => [],
    summarizeEvents: async () => mocks.summaries,
    countSolvesByDay: async () => mocks.dayCounts,
  }
})

vi.mock('../../data/repositories/sessions', () => ({
  listSessions: async (_ownerId: string, event: CubeEvent) => mocks.sessions[event] ?? [],
}))

const THREE_BY_THREE: SolveStats = {
  ...EMPTY_SOLVE_STATS,
  count: 1200,
  dnfCount: 18,
  plusTwoCount: 36,
  best: 10000,
  worst: 25000,
  mean: 15000,
  stdDev: 2000,
  totalTime: 2250000,
  ao5: 14500,
  ao12: 14800,
  ao25: 14900,
  ao50: 15000,
  ao100: 15200,
  ao250: 15300,
  ao500: 15400,
  ao1000: 15500,
  bestAo5: 12000,
  bestAo12: 13000,
  bestAo25: 13200,
  bestAo50: 14000,
  bestAo100: 14500,
  bestAo250: 14600,
  bestAo500: 14700,
  bestAo1000: 14800,
}

function session(id: string, name: string, startedAt: string, event: CubeEvent = '3x3'): CubeSession {
  return {
    id,
    ownerId: 'u1',
    name,
    event,
    kind: 'automatic',
    startedAt,
    endedAt: null,
    archived: false,
    version: 1,
    updatedAt: startedAt,
    deletedAt: null,
  }
}

function renderPage(path = '/stats') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <StatsPage />
    </MemoryRouter>,
  )
}

function statRow(region: HTMLElement, label: string): HTMLElement {
  const row = within(region).getByText(label, { selector: 'dt' }).parentElement
  if (!row) throw new Error(`No row for ${label}`)
  return row
}

/** The values shown under a stat's label, e.g. ['12.00']. */
function statValues(region: HTMLElement, label: string) {
  return Array.from(statRow(region, label).querySelectorAll('dd'), (dd) => dd.textContent)
}

/** Every label in the same list as `label`. */
function listOf(region: HTMLElement, label: string) {
  const list = within(region).getByText(label, { selector: 'dt' }).closest('dl')
  return Array.from(list?.querySelectorAll('dt') ?? [], (dt) => dt.textContent)
}

describe('StatsPage', () => {
  beforeEach(() => {
    mocks.settings = { ...DEFAULT_SETTINGS, ownerId: 'u1', event: '3x3', statsChartScale: 'all' }
    mocks.eventStats = { '3x3': THREE_BY_THREE }
    mocks.sessionStats = {}
    mocks.sessions = {}
    mocks.summaries = [{ event: '3x3', count: 1200, totalTime: 2250000, best: 10000, mean: 15000 }]
    mocks.dayCounts = new Map()
    mocks.pending = new Set()
    mocks.updateSettings.mockReset()
    mocks.setEvent.mockReset()
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('renders graph scale options and highlights active scale', async () => {
    renderPage()

    const graphScaleGroup = await screen.findByRole('group', { name: 'Graph scale' })
    expect(graphScaleGroup).toBeInTheDocument()

    const allBtn = screen.getByRole('button', { name: 'All' })
    const last1000Btn = screen.getByRole('button', { name: 'Last 1000' })
    const last500Btn = screen.getByRole('button', { name: 'Last 500' })
    const last250Btn = screen.getByRole('button', { name: 'Last 250' })
    const last100Btn = screen.getByRole('button', { name: 'Last 100' })

    expect(allBtn).toHaveAttribute('aria-pressed', 'true')
    expect(last1000Btn).toHaveAttribute('aria-pressed', 'false')
    expect(last500Btn).toHaveAttribute('aria-pressed', 'false')
    expect(last250Btn).toHaveAttribute('aria-pressed', 'false')
    expect(last100Btn).toHaveAttribute('aria-pressed', 'false')
  })

  it('calls updateSettings when scale option is clicked', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Last 100' }))

    expect(mocks.updateSettings).toHaveBeenCalledWith({ statsChartScale: '100' })
  })

  it('reflects selected scale from settings', async () => {
    mocks.settings.statsChartScale = '250'
    renderPage()

    expect(await screen.findByRole('button', { name: 'Last 250' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('keeps personal bests and current averages in separate sections, up to Ao1000', async () => {
    renderPage()
    const bests = await screen.findByRole('region', { name: 'Personal bests' })
    const current = screen.getByRole('region', { name: 'Current averages' })

    // Single, Ao5 and Ao12 lead; the longer averages follow in their own row.
    expect(listOf(bests, 'Single')).toEqual(['Single', 'Ao5', 'Ao12'])
    expect(listOf(bests, 'Ao25')).toEqual(['Ao25', 'Ao50', 'Ao100', 'Ao250', 'Ao500', 'Ao1000'])
    expect(listOf(current, 'Ao5')).toEqual(['Ao5', 'Ao12'])
    expect(listOf(current, 'Ao25')).toEqual(['Ao25', 'Ao50', 'Ao100', 'Ao250', 'Ao500', 'Ao1000'])

    expect(statValues(bests, 'Single')).toEqual(['10.00'])
    expect(statValues(bests, 'Ao5')).toEqual(['12.00'])
    expect(statValues(bests, 'Ao1000')).toEqual(['14.80'])
    expect(statValues(current, 'Ao5')).toEqual(['14.50'])
    expect(statValues(current, 'Ao250')).toEqual(['15.30'])
    expect(statValues(current, 'Ao1000')).toEqual(['15.50'])
    expect(within(bests).queryByText(/Current/)).not.toBeInTheDocument()
  })

  it('shows a dash, not DNF, for averages that need more solves', async () => {
    mocks.eventStats = {
      '3x3': { ...EMPTY_SOLVE_STATS, count: 8, best: 9000, mean: 11000, stdDev: 1000, ao5: 10500, bestAo5: 10000 },
    }
    renderPage()
    const bests = await screen.findByRole('region', { name: 'Personal bests' })
    const current = screen.getByRole('region', { name: 'Current averages' })

    expect(statValues(bests, 'Ao5')).toEqual(['10.00'])
    expect(statValues(bests, 'Ao12')).toEqual(['—', 'Needs 12 solves'])
    expect(statValues(current, 'Ao12')).toEqual(['—', 'Needs 12 solves'])
    expect(within(statRow(bests, 'Ao1000')).getByText(', needs 1000 solves')).toBeInTheDocument()
    expect(within(bests).queryByText(/DNF/)).not.toBeInTheDocument()
    expect(within(current).queryByText(/DNF/)).not.toBeInTheDocument()
  })

  it('still shows DNF when an average with enough solves is one', async () => {
    mocks.eventStats = { '3x3': { ...THREE_BY_THREE, ao12: null } }
    renderPage()
    const current = await screen.findByRole('region', { name: 'Current averages' })

    expect(statValues(current, 'Ao12')).toEqual(['DNF'])
  })

  it('shows +2 and DNF rates with the all-time totals', async () => {
    renderPage()
    const totals = await screen.findByRole('region', { name: 'All-time' })

    expect(within(totals).getByText('1,200')).toBeInTheDocument()
    expect(within(totals).getByText('+2 rate').nextElementSibling).toHaveTextContent('3.0% (36)')
    expect(within(totals).getByText('DNF rate').nextElementSibling).toHaveTextContent('1.5% (18)')
  })

  it("opens on the timer's event and switches events without changing it", async () => {
    const user = userEvent.setup()
    mocks.eventStats = { ...mocks.eventStats, '2x2': { ...EMPTY_SOLVE_STATS, count: 30, best: 1950, mean: 4200 } }
    mocks.summaries = [...mocks.summaries, { event: '2x2', count: 30, totalTime: 126000, best: 1950, mean: 4200 }]
    renderPage()

    const switcher = screen.getByRole('navigation', { name: 'Event' })
    expect(within(switcher).getByRole('link', { name: '3x3' })).toHaveAttribute('aria-current', 'page')
    expect(statValues(await screen.findByRole('region', { name: 'Personal bests' }), 'Single')).toEqual(['10.00'])

    await user.click(within(switcher).getByRole('link', { name: '2x2' }))

    expect(within(switcher).getByRole('link', { name: '2x2' })).toHaveAttribute('aria-current', 'page')
    expect(within(switcher).getByRole('link', { name: '3x3' })).not.toHaveAttribute('aria-current')
    expect(await screen.findByText('1.95')).toBeInTheDocument()
    expect(mocks.setEvent).not.toHaveBeenCalled()
    expect(mocks.updateSettings).not.toHaveBeenCalled()
  })

  it('reads the event from the URL', async () => {
    mocks.eventStats = { ...mocks.eventStats, megaminx: { ...THREE_BY_THREE, best: 45120 } }
    mocks.summaries = [...mocks.summaries, { event: 'megaminx', count: 1200, totalTime: 9000000, best: 45120, mean: 60000 }]
    renderPage('/stats?event=megaminx')

    const bests = await screen.findByRole('region', { name: 'Personal bests' })
    expect(statValues(bests, 'Single')).toEqual(['45.12'])
    const switcher = screen.getByRole('navigation', { name: 'Event' })
    expect(within(switcher).getByRole('link', { name: 'Megaminx' })).toHaveAttribute('aria-current', 'page')
  })

  it('shows a loading panel, not an empty state, until an event tab has its stats', async () => {
    mocks.pending = new Set(['4x4'])
    renderPage('/stats?event=4x4')

    expect(await screen.findByRole('status')).toHaveTextContent('Loading stats…')
    expect(screen.queryByText('No solves yet')).not.toBeInTheDocument()
  })

  it('shows an event without solves as empty', async () => {
    renderPage('/stats?event=4x4')

    expect(await screen.findByText('No solves yet')).toBeInTheDocument()
    expect(screen.getByText('Solves you time for 4x4 show up here.')).toBeInTheDocument()
    const switcher = screen.getByRole('navigation', { name: 'Event' })
    // Dimmed, and said out loud for screen readers.
    expect(await within(switcher).findByRole('link', { name: '4x4, no solves yet' })).toHaveClass('empty')
    expect(within(switcher).getByRole('link', { name: '3x3' })).not.toHaveClass('empty')
  })

  it('keeps what events share on an All tab, first in the switcher', async () => {
    const user = userEvent.setup()
    mocks.summaries = [
      { event: '3x3', count: 1200, totalTime: 2250000, best: 10000, mean: 15000 },
      { event: '2x2', count: 300, totalTime: 1260000, best: 1950, mean: 4200 },
    ]
    renderPage()
    await screen.findByRole('region', { name: 'Personal bests' })
    for (const name of ['Overview', 'Activity', 'Events']) {
      expect(screen.queryByRole('region', { name })).not.toBeInTheDocument()
    }

    const switcher = screen.getByRole('navigation', { name: 'Event' })
    await within(switcher).findByRole('link', { name: '4x4, no solves yet' })
    const tabs = within(switcher).getAllByRole('link')
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'All',
      '2x2',
      '3x3',
      '4x4, no solves yet',
      '5x5, no solves yet',
      'Megaminx, no solves yet',
      'Pyraminx, no solves yet',
    ])
    await user.click(tabs[0])

    expect(tabs[0]).toHaveAttribute('aria-current', 'page')
    const overview = await screen.findByRole('region', { name: 'Overview' })
    expect(statValues(overview, 'Solves')).toEqual(['1,500', 'in 2 events'])
    expect(statValues(overview, 'Time spent cubing')).toEqual(['58m 30s', 'Sum of solve times'])
    expect(screen.getByRole('region', { name: 'Activity' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Events' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Personal bests' })).not.toBeInTheDocument()
    expect(mocks.setEvent).not.toHaveBeenCalled()
  })

  it('counts practice days and the current streak on the All tab', async () => {
    const today = new Date()
    const daysAgo = (n: number) => dayKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - n, 12))
    // Yesterday and the day before, plus a day on its own last week; nothing yet today.
    mocks.dayCounts = new Map([
      [daysAgo(1), 5],
      [daysAgo(2), 3],
      [daysAgo(10), 7],
    ])
    renderPage('/stats?event=all')
    const overview = await screen.findByRole('region', { name: 'Overview' })

    expect(statValues(overview, 'Days practiced')).toEqual(['3', 'in the last year'])
    expect(statValues(overview, 'Current streak')).toEqual(['2 days', 'Longest 2 days'])
  })

  it('rolls the All tab over to a new day at midnight, and on return to a tab that slept through it', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    // Wednesday 30 September 2026, half a minute to midnight.
    vi.setSystemTime(new Date(2026, 8, 30, 23, 59, 30))
    const { container } = renderPage('/stats?event=all')
    await screen.findByRole('region', { name: 'Activity' })
    const days = () => Array.from(container.querySelectorAll('.stats-activity-day[title]'), (day) => day.getAttribute('title'))
    // en-GB writes September as "Sept" in current ICU and "Sep" in older builds.
    expect(days().at(-1)).toMatch(/30 Sept? 2026/)

    await act(async () => {
      vi.advanceTimersByTime(60_000)
    })
    await waitFor(() => expect(days().at(-1)).toContain('1 Oct 2026'))

    // A machine asleep past midnight fires no timer; coming back to the tab catches up.
    vi.setSystemTime(new Date(2026, 9, 2, 8, 0))
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await waitFor(() => expect(days().at(-1)).toContain('2 Oct 2026'))
  })

  it('shows only the empty state when there are no solves at all', async () => {
    mocks.eventStats = {}
    mocks.summaries = []
    const { unmount } = renderPage()

    expect(await screen.findByText('No solves yet')).toBeInTheDocument()
    unmount()

    renderPage('/stats?event=all')
    expect(await screen.findByText('Solves you time in any event show up here.')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Overview' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Events' })).not.toBeInTheDocument()
  })

  it('breaks solves down by event, busiest first, each linking to its tab', async () => {
    const user = userEvent.setup()
    mocks.summaries = [
      { event: '3x3', count: 1200, totalTime: 2250000, best: 10000, mean: 15000 },
      { event: '2x2', count: 300, totalTime: 1260000, best: 1950, mean: 4200 },
      { event: 'pyraminx', count: 3, totalTime: 30000, best: 8000, mean: 10000 },
    ]
    renderPage('/stats?event=all')
    const breakdown = await screen.findByRole('region', { name: 'Events' })

    const rows = within(breakdown).getAllByRole('row').slice(1)
    expect(rows.map((row) => within(row).getByRole('rowheader').textContent)).toEqual(['3x3', '2x2', 'Pyraminx'])
    expect(within(rows[0]).getAllByRole('cell').map((cell) => cell.textContent)).toEqual([
      '1,200',
      '80%',
      '37m 30s',
      '10.00',
      '15.00',
    ])
    expect(within(rows[2]).getByText('<1%')).toBeInTheDocument()

    await user.click(within(rows[1]).getByRole('link', { name: '2x2' }))
    expect(within(screen.getByRole('navigation', { name: 'Event' })).getByRole('link', { name: '2x2' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(window.scrollTo).toHaveBeenCalled()
  })

  it('lists an event this client does not know without linking it to a tab', async () => {
    mocks.summaries = [
      { event: '3x3', count: 1200, totalTime: 2250000, best: 10000, mean: 15000 },
      { event: 'skewb' as CubeEvent, count: 40, totalTime: 400000, best: 7000, mean: 10000 },
    ]
    renderPage('/stats?event=all')
    const breakdown = await screen.findByRole('region', { name: 'Events' })

    const skewb = within(breakdown).getByRole('rowheader', { name: 'skewb' })
    expect(within(skewb).queryByRole('link')).not.toBeInTheDocument()
    expect(within(breakdown).getByRole('link', { name: '3x3' })).toBeInTheDocument()
  })

  it('summarizes the last year of activity', async () => {
    const today = new Date()
    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1, 12)
    mocks.dayCounts = new Map([
      [dayKey(today), 40],
      [dayKey(yesterday), 2],
    ])
    renderPage('/stats?event=all')
    const activity = await screen.findByRole('region', { name: 'Activity' })

    expect(within(activity).getByText('42 solves on 2 days in the last year')).toBeInTheDocument()
    expect(within(activity).getByRole('img', { name: 'Solves per day: 42 solves on 2 days in the last year' })).toBeInTheDocument()
  })

  it('compares the current session with the one before it, not the one after', async () => {
    const newer = session('s3', '30 sept 2026 evening', '2026-09-30T18:00:00Z')
    const current = session('s2', '27 sept 2026 evening', '2026-09-27T18:00:00Z')
    const older = session('s1', '24 sept 2026 evening', '2026-09-24T18:00:00Z')
    // Newest first, as listSessions returns them.
    mocks.sessions = { '3x3': [newer, current, older] }
    mocks.settings.currentSessionIds = { '3x3': 's2' }
    mocks.sessionStats = {
      s3: { ...EMPTY_SOLVE_STATS, count: 30, best: 5000, mean: 9000, ao5: 9000, ao12: 9000 },
      s2: { ...EMPTY_SOLVE_STATS, count: 42, totalTime: 536000, best: 8530, mean: 12760, ao5: 13950, ao12: 13790 },
      s1: { ...EMPTY_SOLVE_STATS, count: 30, best: 8330, mean: 13160, ao5: 13950, ao12: 14100 },
    }
    renderPage()
    const card = await screen.findByRole('region', { name: 'Current session' })

    expect(await within(card).findByText('42 solves · 8m 56s')).toBeInTheDocument()
    expect(within(card).getByText('27 sept 2026 evening')).toBeInTheDocument()

    const mean = statRow(card, 'Mean')
    expect(within(mean).getByText('12.76')).toBeInTheDocument()
    expect(await within(mean).findByText('−0.40')).toBeInTheDocument()
    expect(within(mean).getByText('0.40 faster than the previous session')).toBeInTheDocument()

    const best = statRow(card, 'Best')
    expect(within(best).getByText('+0.20')).toBeInTheDocument()
    expect(within(best).getByText('0.20 slower than the previous session')).toBeInTheDocument()

    const ao5 = statRow(card, 'Ao5')
    expect(within(ao5).getByText('±0.00')).toBeInTheDocument()
    expect(within(ao5).getByText('Same as the previous session')).toBeInTheDocument()

    expect(within(card).getByText('Compared with 24 sept 2026 evening')).toBeInTheDocument()
  })

  it("uses the viewed event's own session", async () => {
    mocks.eventStats = { ...mocks.eventStats, '2x2': { ...EMPTY_SOLVE_STATS, count: 5, best: 2000, mean: 3000 } }
    mocks.sessions = {
      '3x3': [session('s-3x3', '3x3 session', '2026-09-30T18:00:00Z')],
      '2x2': [session('s-2x2', '29 sept 2026 night', '2026-09-29T23:00:00Z', '2x2')],
    }
    mocks.settings.currentSessionIds = { '3x3': 's-3x3', '2x2': 's-2x2' }
    mocks.sessionStats = { 's-2x2': { ...EMPTY_SOLVE_STATS, count: 5, totalTime: 15000, best: 2000, mean: 3000 } }
    renderPage('/stats?event=2x2')
    const card = await screen.findByRole('region', { name: 'Current session' })

    expect(await within(card).findByText('29 sept 2026 night')).toBeInTheDocument()
    expect(within(card).getByText('5 solves · 15s')).toBeInTheDocument()
  })

  it('shows session stats without deltas when there is nothing to compare with', async () => {
    mocks.sessions = { '3x3': [session('s1', '30 sept 2026 evening', '2026-09-30T18:00:00Z')] }
    mocks.settings.currentSessionIds = { '3x3': 's1' }
    mocks.sessionStats = { s1: { ...EMPTY_SOLVE_STATS, count: 3, totalTime: 37000, best: 9860, mean: 12410 } }
    renderPage()
    const card = await screen.findByRole('region', { name: 'Current session' })

    expect(await within(card).findByText('3 solves · 37s')).toBeInTheDocument()
    expect(statValues(card, 'Mean')).toEqual(['12.41'])
    expect(statValues(card, 'Ao5')).toEqual(['—'])
    expect(within(card).queryByText(/Compared with/)).not.toBeInTheDocument()
  })

  it('says so when there is no current session', async () => {
    renderPage()
    const card = await screen.findByRole('region', { name: 'Current session' })

    expect(await within(card).findByText('No active session. Your next solve starts one.')).toBeInTheDocument()
  })

  it('renders times graph series with theme-based colors', async () => {
    renderPage()

    const seriesGroup = await screen.findByRole('group', { name: 'Chart series visibility' })
    expect(seriesGroup).toBeInTheDocument()

    const timeButton = within(seriesGroup).getByRole('button', { name: /Time/i })
    const ao5Button = within(seriesGroup).getByRole('button', { name: /Ao5/i })
    const ao12Button = within(seriesGroup).getByRole('button', { name: /Ao12/i })

    const timeSwatch = timeButton.querySelector('span[aria-hidden="true"]')
    const ao5Swatch = ao5Button.querySelector('span[aria-hidden="true"]')
    const ao12Swatch = ao12Button.querySelector('span[aria-hidden="true"]')

    expect(timeSwatch).toHaveStyle({ backgroundColor: 'var(--accent)' })
    expect(ao5Swatch).toHaveStyle({ backgroundColor: 'var(--chart-ao5)' })
    expect(ao12Swatch).toHaveStyle({ backgroundColor: 'var(--chart-ao12)' })
  })

  it('hides and restores a chart series from its legend button', async () => {
    const user = userEvent.setup()
    renderPage()

    const legend = await screen.findByRole('group', { name: 'Chart series visibility' })
    const ao5Button = within(legend).getByRole('button', { name: /Ao5/i })
    await user.click(ao5Button)
    expect(ao5Button).toHaveAttribute('aria-pressed', 'false')
    await user.click(ao5Button)
    expect(ao5Button).toHaveAttribute('aria-pressed', 'true')
  })
})
