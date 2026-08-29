/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppSettings, CubeSession } from '../../domain/models'
import { DEFAULT_SETTINGS } from '../../domain/models'
import type { SolveStats } from '../../data/repositories/solveStats'
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
  settings: {
    ownerId: 'u1',
    event: '3x3',
    sessionMode: 'automatic',
    inactivityGapMinutes: 60,
    timerStartDelayMs: 500,
    timerDisplayMode: 'show',
    hideScrambleDuringSolve: false,
    hideWidgetsDuringSolve: false,
    enableWidgets: true,
    theme: 'system',
    accentColor: 'blue',
    coloredBackground: false,
    currentSessionIds: {},
    timerFont: 'jetbrains',
    timerSize: 'medium',
    widgetScale: 100,
    statsChartScale: 'all',
  } as AppSettings,
  updateSettings: vi.fn(),
  solveStats: {
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
  } as SolveStats,
  sessions: [] as CubeSession[],
  currentSession: null as CubeSession | null,
}))

vi.mock('../../app/AppProviders', () => ({
  useApp: () => ({
    ownerId: 'u1',
    settings: mocks.settings,
    updateSettings: mocks.updateSettings,
    solveStats: mocks.solveStats,
    sessions: mocks.sessions,
    currentSession: mocks.currentSession,
  }),
}))

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: () => {
    return []
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
})
