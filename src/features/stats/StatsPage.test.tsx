/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppSettings, CubeSession, Solve } from '../../domain/models'
import { DEFAULT_SETTINGS } from '../../domain/models'
import { EMPTY_SOLVE_STATS, type SolveStats } from '../../data/repositories/solveStats'
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

function makeStats(overrides: Partial<SolveStats> = {}): SolveStats {
  return { ...EMPTY_SOLVE_STATS, ...overrides }
}

function makeSession(id: string, name: string, startedAt: string): CubeSession {
  return {
    id,
    ownerId: 'u1',
    name,
    event: '3x3',
    kind: 'manual',
    startedAt,
    endedAt: null,
    archived: false,
    version: 1,
    updatedAt: startedAt,
    deletedAt: null,
  }
}

const ALL_TIME_STATS = makeStats({
  count: 150,
  dnfCount: 3,
  best: 10000,
  worst: 25000,
  mean: 15000,
  stdDev: 2000,
  totalTime: 2250000,
  ao5: 14500,
  ao12: 14800,
  ao50: 15000,
  ao100: 15200,
  bestAo5: 12000,
  bestAo12: 13000,
  bestAo50: 14000,
  bestAo100: 14500,
})

const mocks = vi.hoisted(() => ({
  settings: {} as AppSettings,
  updateSettings: vi.fn(),
  solveStats: {} as SolveStats,
  sessions: [] as CubeSession[],
  currentSession: null as CubeSession | null,
  recentSolves: [] as Solve[],
  // Keyed by session id; the chart query is keyed by its scale and gets no rows.
  sessionStats: {} as Record<string, SolveStats>,
}))

vi.mock('../../app/AppContext', () => ({
  useApp: () => ({
    ownerId: 'u1',
    settings: mocks.settings,
    updateSettings: mocks.updateSettings,
    solveStats: mocks.solveStats,
    sessions: mocks.sessions,
    currentSession: mocks.currentSession,
    recentSolves: mocks.recentSolves,
  }),
}))

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: (_query: unknown, deps: unknown[]) => {
    const key = deps[2]
    if (typeof key === 'string' && key in mocks.sessionStats) {
      return mocks.sessionStats[key]
    }
    return key === undefined ? null : []
  },
}))

function renderPage() {
  return render(
    <MemoryRouter>
      <StatsPage />
    </MemoryRouter>,
  )
}

describe('StatsPage', () => {
  beforeEach(() => {
    mocks.settings = {
      ...DEFAULT_SETTINGS,
      ownerId: 'u1',
      statsChartScale: 'all',
    }
    mocks.solveStats = { ...ALL_TIME_STATS }
    mocks.sessions = []
    mocks.currentSession = null
    mocks.recentSolves = []
    mocks.sessionStats = {}
    mocks.updateSettings.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('shows the empty state when there are no solves', () => {
    mocks.solveStats = makeStats()
    renderPage()

    expect(screen.getByText('No solves yet')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Personal bests' })).not.toBeInTheDocument()
  })

  it('renders graph scale options and highlights active scale', () => {
    renderPage()

    const graphScaleGroup = screen.getByRole('group', { name: 'Graph scale' })
    expect(graphScaleGroup).toBeInTheDocument()

    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true')
    for (const name of ['Last 1000', 'Last 500', 'Last 250', 'Last 100']) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'false')
    }
  })

  it('calls updateSettings when scale option is clicked', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'Last 100' }))

    expect(mocks.updateSettings).toHaveBeenCalledWith({ statsChartScale: '100' })
  })

  it('reflects selected scale from settings', () => {
    mocks.settings.statsChartScale = '250'
    renderPage()

    expect(screen.getByRole('button', { name: 'Last 250' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('pairs each personal best with its current value', () => {
    mocks.recentSolves = [
      {
        id: 's1',
        ownerId: 'u1',
        sessionId: null,
        durationMs: 13450,
        penalty: 'plus_two',
        solvedAt: '2026-01-01T00:00:00.000Z',
        scramble: '',
        event: '3x3',
        timingDevice: 'keyboard',
        version: 1,
        updatedAt: '2026-01-01T00:00:00.000Z',
        deletedAt: null,
      },
    ]
    renderPage()

    const bests = screen.getByRole('region', { name: 'Personal bests' })
    const single = within(bests).getByText('Single').parentElement as HTMLElement
    expect(within(single).getByText('10.00')).toHaveClass('stats-pb-value')
    expect(single).toHaveTextContent('Latest 15.45+')

    const ao12 = within(bests).getByText('Ao12').parentElement as HTMLElement
    expect(within(ao12).getByText('13.00')).toHaveClass('stats-pb-value')
    expect(ao12).toHaveTextContent('Current 14.80')
  })

  it('shows a placeholder instead of DNF for averages that need more solves', () => {
    mocks.solveStats = { ...ALL_TIME_STATS, count: 60, ao100: null, bestAo100: null }
    renderPage()

    const ao100 = within(screen.getByRole('region', { name: 'Personal bests' }))
      .getByText('Ao100')
      .parentElement as HTMLElement
    expect(ao100).toHaveTextContent('—')
    expect(ao100).toHaveTextContent('Needs 100 solves')
    expect(ao100).not.toHaveTextContent('DNF')
  })

  it('toggles chart series from the legend', async () => {
    const user = userEvent.setup()
    renderPage()

    const legend = screen.getByRole('group', { name: 'Chart series visibility' })
    const single = within(legend).getByRole('button', { name: 'Single' })
    const ao5 = within(legend).getByRole('button', { name: 'Ao5' })
    const ao12 = within(legend).getByRole('button', { name: 'Ao12' })

    expect(single.querySelector('.stats-series-key')).toHaveStyle({ borderTopColor: 'var(--accent)' })
    expect(ao5.querySelector('.stats-series-key')).toHaveStyle({ borderTopColor: 'var(--chart-ao5)' })
    expect(ao12.querySelector('.stats-series-key')).toHaveStyle({ borderTopColor: 'var(--chart-ao12)' })

    for (const button of [single, ao5, ao12]) {
      expect(button).toHaveAttribute('aria-pressed', 'true')
    }

    await user.click(single)
    expect(single).toHaveAttribute('aria-pressed', 'false')
    expect(ao5).toHaveAttribute('aria-pressed', 'true')

    await user.click(single)
    expect(single).toHaveAttribute('aria-pressed', 'true')
  })

  it('compares the current session with the one started before it', () => {
    const current = makeSession('current', 'Tonight', '2026-03-03T18:00:00.000Z')
    const previous = makeSession('previous', 'Yesterday', '2026-03-02T18:00:00.000Z')
    const older = makeSession('older', 'Last week', '2026-02-24T18:00:00.000Z')
    // SolvesProvider lists sessions newest-first.
    mocks.sessions = [current, previous, older]
    mocks.currentSession = current
    mocks.sessionStats = {
      current: makeStats({ count: 20, best: 11000, worst: 18000, mean: 14000, stdDev: 1500, ao5: 13500, ao12: 14000 }),
      previous: makeStats({ count: 30, best: 10500, worst: 19000, mean: 14500, stdDev: 1500, ao5: 14000, ao12: 14200 }),
      older: makeStats({ count: 40, best: 9000, worst: 30000, mean: 20000, stdDev: 3000, ao5: 20000, ao12: 20000 }),
    }
    renderPage()

    const section = screen.getByRole('region', { name: 'Current session' })
    expect(section).toHaveTextContent('Tonight · 20 solves')
    expect(section).toHaveTextContent('Changes vs Yesterday')

    const mean = within(section).getByText('Mean').parentElement as HTMLElement
    const meanDelta = mean.querySelector('.stats-delta')
    expect(meanDelta).toHaveClass('better')
    expect(meanDelta).toHaveTextContent('−0.50')
    expect(meanDelta).toHaveAttribute('title', '0.50 better than Yesterday')

    const best = within(section).getByText('Best').parentElement as HTMLElement
    expect(best.querySelector('.stats-delta')).toHaveClass('worse')
    expect(best.querySelector('.stats-delta')).toHaveTextContent('+0.50')

    const stdDev = within(section).getByText('Std dev').parentElement as HTMLElement
    expect(stdDev.querySelector('.stats-delta')).not.toHaveClass('better')
    expect(stdDev.querySelector('.stats-delta')).not.toHaveClass('worse')

    // Ao50 needs more solves than either session has, so there is nothing to compare.
    const ao50 = within(section).getByText('Ao50').parentElement as HTMLElement
    expect(ao50).toHaveTextContent('—')
    expect(ao50.querySelector('.stats-delta')).toBeNull()
  })

  it('skips the comparison when there is no earlier session', () => {
    const current = makeSession('current', 'Tonight', '2026-03-03T18:00:00.000Z')
    mocks.sessions = [current]
    mocks.currentSession = current
    mocks.sessionStats = { current: makeStats({ count: 5, best: 11000, mean: 12000, ao5: 12000 }) }
    renderPage()

    const section = screen.getByRole('region', { name: 'Current session' })
    expect(section).not.toHaveTextContent('Changes vs')
    expect(section.querySelector('.stats-delta')).toBeNull()
  })

  it('groups all-time stats into consistency and volume', () => {
    mocks.sessions = [makeSession('a', 'A', '2026-03-01T00:00:00.000Z'), makeSession('b', 'B', '2026-02-01T00:00:00.000Z')]
    renderPage()

    const allTime = screen.getByRole('region', { name: 'All time' })
    expect(within(allTime).getByText('Consistency')).toBeInTheDocument()
    expect(within(allTime).getByText('Volume')).toBeInTheDocument()

    const rows = Object.fromEntries(
      within(allTime)
        .getAllByRole('term')
        .map((term) => [term.textContent, term.nextElementSibling?.textContent]),
    )
    expect(rows).toMatchObject({
      Mean: '15.00',
      'Std dev': '2.00',
      Worst: '25.00',
      'DNF rate': '2.0%3 DNFs',
      Solves: '150',
      Sessions: '2',
      'Total time': '37m 30s',
    })
  })
})
