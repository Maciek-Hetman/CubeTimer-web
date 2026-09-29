/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppSettings } from '../../domain/models'
import { DEFAULT_SETTINGS } from '../../domain/models'
import { SettingsPage } from './SettingsPage'

const EXPECTED_SECTIONS = [
  { id: 'sessions', label: 'Sessions' },
  { id: 'timer', label: 'Timer' },
  { id: 'timer-appearance', label: 'Timer Appearance' },
  { id: 'appearance', label: 'Appearance' },
] as const

const mocks = vi.hoisted(() => ({
  settings: {
    ownerId: 'u1',
    event: '3x3',
    inactivityGapMinutes: 60,
    timerStartDelayMs: 500,
    timerDisplayMode: 'show',
    showTimerHints: true,
    focusMode: false,
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
}))

vi.mock('../../app/AppContext', () => ({
  useApp: () => ({
    settings: mocks.settings,
    updateSettings: mocks.updateSettings,
  }),
}))

vi.mock('../../contexts/SettingsContext', () => ({
  useSettings: () => ({
    settings: mocks.settings,
    updateSettings: mocks.updateSettings,
  }),
}))

vi.mock('../../contexts/WiredTimerContext', () => ({
  useWiredTimer: () => ({
    status: 'connected',
    inputLabel: 'USB Audio Device',
    error: null,
    connect: vi.fn(),
    disconnect: vi.fn(),
    subscribe: vi.fn(),
  }),
}))

vi.mock('../timer/wired/wiredTimer', () => ({
  listAudioInputs: async () => [
    { deviceId: 'mic-1', label: 'Built-in Microphone' },
    { deviceId: 'usb-1', label: 'USB Audio Device' },
  ],
}))

function renderPage() {
  return render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>,
  )
}

describe('SettingsPage', () => {
  beforeEach(() => {
    mocks.settings = {
      ...DEFAULT_SETTINGS,
      ownerId: 'u1',
    }
    mocks.updateSettings.mockReset()
    window.location.hash = ''
    window.HTMLElement.prototype.scrollIntoView = vi.fn()
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('renders all sections and their corresponding sidebar shortcut links', () => {
    renderPage()

    // Header
    const settingsHeadings = screen.getAllByRole('heading', { name: 'Settings', level: 1 })
    expect(settingsHeadings.length).toBeGreaterThan(0)
    expect(settingsHeadings[0]).toBeInTheDocument()

    // Section headings
    expect(screen.getByRole('heading', { name: 'Sessions', level: 2 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Timer', level: 2 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Timer Appearance', level: 2 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Appearance', level: 2 })).toBeInTheDocument()

    // Sidebar navigation shortcuts
    const nav = screen.getByRole('navigation', { name: 'Settings section shortcuts' })
    expect(nav).toBeInTheDocument()

    for (const section of EXPECTED_SECTIONS) {
      const link = screen.getByRole('link', { name: section.label })
      expect(link).toHaveAttribute('href', `#${section.id}`)
    }

    // Default first item active
    const firstLink = screen.getByRole('link', { name: 'Sessions' })
    expect(firstLink).toHaveClass('active')
    expect(firstLink).toHaveAttribute('aria-current', 'true')
  })

  it('scrolls into view and updates hash when a shortcut is clicked', async () => {
    const user = userEvent.setup()
    renderPage()

    const timerLink = screen.getByRole('link', { name: 'Timer Appearance' })
    await user.click(timerLink)

    expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth' })
    expect(timerLink).toHaveClass('active')
    expect(window.location.hash).toBe('#timer-appearance')
  })

  it('activates and scrolls to section when page is loaded with a hash', () => {
    window.location.hash = '#appearance'
    renderPage()

    const appearanceLink = screen.getByRole('link', { name: 'Appearance' })
    expect(appearanceLink).toHaveClass('active')
  })

  it('updates settings on user interaction', async () => {
    const user = userEvent.setup()
    renderPage()

    const holdButton = screen.getByRole('button', { name: '300 ms' })
    await user.click(holdButton)

    expect(mocks.updateSettings).toHaveBeenCalledWith({ timerStartDelayMs: 300 })

    const showHintsSwitch = screen.getByRole('checkbox', { name: 'Show timer hints' })
    expect(showHintsSwitch).toBeChecked()
    await user.click(showHintsSwitch)
    expect(mocks.updateSettings).toHaveBeenCalledWith({ showTimerHints: false })
  })

  it('toggles focus mode from a single switch', async () => {
    const user = userEvent.setup()
    renderPage()

    expect(screen.queryByRole('checkbox', { name: /hide scramble during solve/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /hide widgets during solve/i })).not.toBeInTheDocument()
    const focusSwitch = screen.getByRole('checkbox', { name: /focus mode/i })
    expect(focusSwitch).not.toBeChecked()
    await user.click(focusSwitch)
    expect(mocks.updateSettings).toHaveBeenCalledWith({ focusMode: true })
  })

  it('chooses which inputs start and stop the keyboard timer', async () => {
    const user = userEvent.setup()
    renderPage()

    const controls = screen.getByLabelText('Start and stop with')
    expect(controls).toHaveValue('keys_and_pointer')
    await user.selectOptions(controls, 'space')
    expect(mocks.updateSettings).toHaveBeenCalledWith({ timerControls: 'space' })
  })

  it('switches the timing device', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.selectOptions(screen.getByLabelText('Timing device'), 'wired')
    expect(mocks.updateSettings).toHaveBeenCalledWith({ timingDevice: 'external_timer', externalTimer: 'wired' })
    await user.selectOptions(screen.getByLabelText('Timing device'), 'keyboard')
    expect(mocks.updateSettings).toHaveBeenCalledWith({ timingDevice: 'keyboard' })
  })

  it('shows wired timer options instead of keyboard ones for a wired timer', async () => {
    mocks.settings = { ...mocks.settings, timingDevice: 'external_timer', externalTimer: 'wired' }
    const user = userEvent.setup()
    renderPage()

    expect(screen.queryByLabelText('Start and stop with')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '300 ms' })).not.toBeInTheDocument()
    expect(screen.getByText('Timer connected')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Wired timer type'), 'moyu')
    expect(mocks.updateSettings).toHaveBeenCalledWith({ wiredTimerProtocol: 'moyu' })

    const input = screen.getByLabelText('Audio input')
    await screen.findByRole('option', { name: 'USB Audio Device' })
    await user.selectOptions(input, 'usb-1')
    expect(mocks.updateSettings).toHaveBeenCalledWith({ wiredTimerInputId: 'usb-1' })
  })
})
