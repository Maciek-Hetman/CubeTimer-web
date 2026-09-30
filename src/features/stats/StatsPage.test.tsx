/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppSettings, CubeSession } from '../../domain/models'
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

const mocks = vi.hoisted(() => ({
  settings: {} as AppSettings,
  updateSettings: vi.fn(),
  solveStats: {} as SolveStats,
  sessions: [] as CubeSession[],
  currentSession: null as CubeSession | null,
  /** Stats per session id, as computeSolveStats would return them. */
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
  }),
}))

// Session queries depend on [ownerId, event, sessionId]; everything else stays loading.
vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: (_query: unknown, deps: unknown[] = []) => {
    const sessionId = deps[2]
    return typeof sessionId === 'string' ? mocks.sessionStats[sessionId] : undefined
  },
}))

function session(id: string, name: string, startedAt: string): CubeSession {
  return {
    id,
    ownerId: 'u1',
    name,
    event: '3x3',
    kind: 'automatic',
    startedAt,
    endedAt: null,
    archived: false,
    version: 1,
    updatedAt: startedAt,
    deletedAt: null,
  }
}

function renderPage() {
  return render(
    <MemoryRouter>
      <StatsPage />
    </MemoryRouter>,
  )
}

function statRow(region: HTMLElement, label: string): HTMLElement {
  const row = within(region).getByText(label, { selector: 'dt' }).parentElement
  if (!row) throw new Error(`No row for ${label}`)
  return row
}

/** The values shown under a stat's label, e.g. ['12.00', 'Current 14.50']. */
function statValues(region: HTMLElement, label: string) {
  return Array.from(statRow(region, label).querySelectorAll('dd'), (dd) => dd.textContent)
}

/** Every label in the same tier (list) as `label`. */
function tierOf(region: HTMLElement, label: string) {
  const tier = within(region).getByText(label, { selector: 'dt' }).closest('dl')
  return Array.from(tier?.querySelectorAll('dt') ?? [], (dt) => dt.textContent)
}

describe('StatsPage', () => {
  beforeEach(() => {
    mocks.settings = {
      ...DEFAULT_SETTINGS,
      ownerId: 'u1',
      statsChartScale: 'all',
    }
    mocks.solveStats = {
      count: 150,
      dnfCount: 0,
      best: 10000,
      worst: 25000,
      mean: 15000,
      stdDev: 2000,
      totalTime: 2250000,
      ao5: 14500,
      ao12: 14800,
      ao25: null,
      ao50: 15000,
      ao100: 15200,
      bestAo5: 12000,
      bestAo12: 13000,
      bestAo25: null,
      bestAo50: 14000,
      bestAo100: 14500,
    }
    mocks.sessions = []
    mocks.currentSession = null
    mocks.sessionStats = {}
    mocks.updateSettings.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders graph scale options and highlights active scale', () => {
    renderPage()

    const graphScaleGroup = screen.getByRole('group', { name: 'Graph scale' })
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

    const last100Btn = screen.getByRole('button', { name: 'Last 100' })
    await user.click(last100Btn)

    expect(mocks.updateSettings).toHaveBeenCalledWith({ statsChartScale: '100' })
  })

  it('reflects selected scale from settings', () => {
    mocks.settings.statsChartScale = '250'
    renderPage()

    const last250Btn = screen.getByRole('button', { name: 'Last 250' })
    const allBtn = screen.getByRole('button', { name: 'All' })

    expect(last250Btn).toHaveAttribute('aria-pressed', 'true')
    expect(allBtn).toHaveAttribute('aria-pressed', 'false')
  })

  it('leads with single, Ao5 and Ao12 bests, each beside where it stands now', () => {
    renderPage()
    const bests = screen.getByRole('region', { name: 'Personal bests' })

    expect(statValues(bests, 'Single')).toEqual(['10.00', 'Mean 15.00'])
    expect(statValues(bests, 'Ao5')).toEqual(['12.00', 'Current 14.50'])
    expect(statValues(bests, 'Ao12')).toEqual(['13.00', 'Current 14.80'])
    expect(statValues(bests, 'Ao50')).toEqual(['14.00', 'Current 15.00'])
    expect(statValues(bests, 'Ao100')).toEqual(['14.50', 'Current 15.20'])

    // The headline trio is one tier; the longer averages are a separate, quieter one.
    expect(tierOf(bests, 'Single')).toEqual(['Single', 'Ao5', 'Ao12'])
    expect(tierOf(bests, 'Ao50')).toEqual(['Ao50', 'Ao100'])
  })

  it('shows a dash, not DNF, for averages that need more solves', () => {
    mocks.solveStats = {
      ...EMPTY_SOLVE_STATS,
      count: 8,
      best: 9000,
      worst: 14000,
      mean: 11000,
      stdDev: 1000,
      totalTime: 88000,
      ao5: 10500,
      bestAo5: 10000,
    }
    renderPage()
    const bests = screen.getByRole('region', { name: 'Personal bests' })

    expect(statValues(bests, 'Ao5')).toEqual(['10.00', 'Current 10.50'])
    expect(statValues(bests, 'Ao12')).toEqual(['—', 'Needs 12 solves'])
    expect(statValues(bests, 'Ao100')).toEqual(['—', 'Needs 100 solves'])
    expect(within(bests).queryByText(/DNF/)).not.toBeInTheDocument()
  })

  it('still shows DNF when an average with enough solves is one', () => {
    mocks.solveStats = { ...mocks.solveStats, count: 20, ao12: null }
    renderPage()
    const bests = screen.getByRole('region', { name: 'Personal bests' })

    expect(statValues(bests, 'Ao12')).toEqual(['13.00', 'Current DNF'])
  })

  it('compares the current session with the one before it, not the one after', () => {
    const newer = session('s3', '30 sept 2026 evening', '2026-09-30T18:00:00Z')
    const current = session('s2', '27 sept 2026 evening', '2026-09-27T18:00:00Z')
    const older = session('s1', '24 sept 2026 evening', '2026-09-24T18:00:00Z')
    // Newest first, as listSessions returns them.
    mocks.sessions = [newer, current, older]
    mocks.currentSession = current
    mocks.sessionStats = {
      s3: { ...EMPTY_SOLVE_STATS, count: 30, best: 5000, mean: 9000, ao5: 9000, ao12: 9000 },
      s2: { ...EMPTY_SOLVE_STATS, count: 42, totalTime: 536000, best: 8530, mean: 12760, ao5: 13950, ao12: 13790 },
      s1: { ...EMPTY_SOLVE_STATS, count: 30, best: 8330, mean: 13160, ao5: 13950, ao12: 14100 },
    }
    renderPage()
    const card = screen.getByRole('region', { name: 'Current session' })

    expect(within(card).getByText('27 sept 2026 evening')).toBeInTheDocument()
    expect(within(card).getByText('42 solves · 8m 56s')).toBeInTheDocument()

    const mean = statRow(card, 'Mean')
    expect(within(mean).getByText('12.76')).toBeInTheDocument()
    expect(within(mean).getByText('−0.40')).toBeInTheDocument()
    expect(within(mean).getByText('0.40 faster than the previous session')).toBeInTheDocument()

    const best = statRow(card, 'Best')
    expect(within(best).getByText('+0.20')).toBeInTheDocument()
    expect(within(best).getByText('0.20 slower than the previous session')).toBeInTheDocument()

    const ao5 = statRow(card, 'Ao5')
    expect(within(ao5).getByText('±0.00')).toBeInTheDocument()
    expect(within(ao5).getByText('Same as the previous session')).toBeInTheDocument()

    expect(within(card).getByText('Compared with 24 sept 2026 evening')).toBeInTheDocument()
  })

  it('shows session stats without deltas when there is nothing to compare with', () => {
    const only = session('s1', '30 sept 2026 evening', '2026-09-30T18:00:00Z')
    mocks.sessions = [only]
    mocks.currentSession = only
    mocks.sessionStats = {
      s1: { ...EMPTY_SOLVE_STATS, count: 3, totalTime: 37000, best: 9860, mean: 12410 },
    }
    renderPage()
    const card = screen.getByRole('region', { name: 'Current session' })

    expect(statValues(card, 'Mean')).toEqual(['12.41'])
    expect(statValues(card, 'Ao5')).toEqual(['—'])
    expect(within(card).queryByText(/Compared with/)).not.toBeInTheDocument()
  })

  it('says so when there is no current session', () => {
    renderPage()
    const card = screen.getByRole('region', { name: 'Current session' })

    expect(within(card).getByText('No active session. Your next solve starts one.')).toBeInTheDocument()
  })

  it('keeps all-time totals in their own section', () => {
    renderPage()
    const totals = screen.getByRole('region', { name: 'All-time' })

    expect(within(totals).getByText('150')).toBeInTheDocument()
    expect(within(totals).getByText('37m 30s')).toBeInTheDocument()
    expect(within(totals).getByText('25.00')).toBeInTheDocument()
  })

  it('renders times graph series with theme-based colors', () => {
    renderPage()

    const seriesGroup = screen.getByRole('group', { name: 'Chart series visibility' })
    expect(seriesGroup).toBeInTheDocument()

    const timeButton = screen.getByRole('button', { name: /Time/i })
    const ao5Button = screen.getByRole('button', { name: /Ao5/i })
    const ao12Button = screen.getByRole('button', { name: /Ao12/i })

    expect(timeButton).toBeInTheDocument()
    expect(ao5Button).toBeInTheDocument()
    expect(ao12Button).toBeInTheDocument()

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

    const ao5Button = screen.getByRole('button', { name: /Ao5/i })
    await user.click(ao5Button)
    expect(ao5Button).toHaveAttribute('aria-pressed', 'false')
    await user.click(ao5Button)
    expect(ao5Button).toHaveAttribute('aria-pressed', 'true')
  })
})
