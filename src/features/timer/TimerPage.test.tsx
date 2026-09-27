/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppProviders } from '../../app/AppProviders'
import { ensureGuestOwner } from '../../app/profile'
import { db, getOrCreateSettings } from '../../data/db'
import { generateScramble } from '../scramble/scrambleService'
import type { SmartTimerListener } from './bluetooth/types'
import { TimerPage } from './TimerPage'
import type { WiredTimerOptions } from './wired/wiredTimer'

const bluetoothMock = vi.hoisted(() => ({ emit: null as SmartTimerListener | null }))
const wiredMock = vi.hoisted(() => ({ options: null as WiredTimerOptions | null }))

vi.mock('./bluetooth/bluetoothTimer', () => ({
  isWebBluetoothSupported: () => true,
  connectBluetoothTimer: vi.fn(async (onEvent: SmartTimerListener) => {
    bluetoothMock.emit = onEvent
    return { deviceName: 'QY-Adapter-1A2B', disconnect: vi.fn(async () => undefined) }
  }),
}))

vi.mock('./wired/wiredTimer', () => ({
  isWiredTimerSupported: () => true,
  hasMicrophonePermission: async () => false,
  listAudioInputs: async () => [],
  connectWiredTimer: vi.fn(async (options: WiredTimerOptions) => {
    wiredMock.options = options
    return { inputLabel: 'USB Audio Device', disconnect: vi.fn(async () => undefined) }
  }),
}))

vi.mock('../scramble/scrambleService', () => ({
  generateScramble: vi.fn(async () => "R U R' U'"),
}))

function renderTimer(variant: 'mobile' | 'desktop' = 'mobile') {
  return render(
    <MemoryRouter>
      <AppProviders>
        <TimerPage variant={variant} />
      </AppProviders>
    </MemoryRouter>,
  )
}

function timerHint() {
  return document.querySelector('.timer-hint')
}

describe('TimerPage', () => {
  beforeEach(async () => {
    cleanup()
    vi.mocked(generateScramble).mockClear()
    await Promise.all([
      db.solves.clear(),
      db.sessions.clear(),
      db.settings.clear(),
      db.outbox.clear(),
      db.conflicts.clear(),
      db.rejections.clear(),
      db.widgetLayouts.clear(),
      db.meta.clear(),
    ])
    const ownerId = await ensureGuestOwner()
    const settings = await getOrCreateSettings(ownerId)
    await db.settings.put({ ...settings, timerStartDelayMs: 0 })
  })

  afterEach(() => {
    cleanup()
  })

  it('records solves from a connected Bluetooth timer', async () => {
    const ownerId = await ensureGuestOwner()
    const user = userEvent.setup()
    renderTimer()

    await screen.findByRole('button', { name: 'Timer' })
    await user.selectOptions(screen.getByLabelText('Timing device'), 'bluetooth')
    await waitFor(async () => {
      expect((await db.settings.get(ownerId))).toMatchObject({ timingDevice: 'external_timer', externalTimer: 'bluetooth' })
    })

    await user.click(await screen.findByRole('button', { name: 'Connect timer' }))
    expect(await screen.findByText('QY-Adapter-1A2B')).toBeInTheDocument()
    await waitFor(() => expect(timerHint()).toHaveTextContent(/Place your hands on the timer/i))

    // Keyboard input is ignored while the Bluetooth timer is in charge.
    fireEvent.keyDown(window, { code: 'Space', key: ' ' })
    fireEvent.keyUp(window, { code: 'Space', key: ' ' })
    expect(screen.getByRole('button', { name: 'Timer' })).toHaveClass('timer-idle')

    act(() => bluetoothMock.emit!({ state: 'ready' }))
    expect(screen.getByRole('button', { name: 'Timer' })).toHaveClass('timer-ready')
    act(() => bluetoothMock.emit!({ state: 'running' }))
    expect(screen.getByRole('button', { name: 'Timer' })).toHaveClass('timer-running')
    act(() => bluetoothMock.emit!({ state: 'stopped', timeMs: 12_345 }))
    act(() => bluetoothMock.emit!({ state: 'stopped', timeMs: 12_345 }))

    await waitFor(async () => {
      const solves = await db.solves.toArray()
      expect(solves).toHaveLength(1)
      expect(solves[0]).toMatchObject({ durationMs: 12_345, timingDevice: 'external_timer' })
    })
  })

  it('records solves from a wired timer', async () => {
    const ownerId = await ensureGuestOwner()
    const user = userEvent.setup()
    renderTimer()

    const timer = await screen.findByRole('button', { name: 'Timer' })
    await user.selectOptions(screen.getByLabelText('Timing device'), 'wired')
    await waitFor(async () => {
      expect((await db.settings.get(ownerId))).toMatchObject({ timingDevice: 'external_timer', externalTimer: 'wired' })
    })
    expect(timerHint()).toHaveTextContent(/Connect your wired timer to start/i)

    await user.click(await screen.findByRole('button', { name: 'Connect timer' }))
    expect(wiredMock.options).toMatchObject({ protocol: 'stackmat', inputId: '' })
    await waitFor(() => expect(timerHint()).toHaveTextContent(/Turn on your timer to start/i))
    act(() => wiredMock.options!.onSignalChange(true))
    await waitFor(() => expect(timerHint()).toHaveTextContent(/Place your hands on the timer/i))

    // Keyboard and touch are ignored while the wired timer is in charge.
    fireEvent.keyDown(window, { code: 'Space', key: ' ' })
    fireEvent.pointerDown(timer, { pointerId: 1 })
    expect(timer).toHaveClass('timer-idle')

    act(() => wiredMock.options!.onEvent({ state: 'running', elapsedMs: 150 }))
    expect(timer).toHaveClass('timer-running')
    act(() => wiredMock.options!.onEvent({ state: 'stopped', timeMs: 9_870 }))

    await waitFor(async () => {
      const solves = await db.solves.toArray()
      expect(solves).toHaveLength(1)
      expect(solves[0]).toMatchObject({ durationMs: 9_870, timingDevice: 'external_timer' })
    })
  })

  it('drops a solve when the external timer is reset mid-solve', async () => {
    const ownerId = await ensureGuestOwner()
    const settings = await getOrCreateSettings(ownerId)
    await db.settings.put({ ...settings, timingDevice: 'external_timer', externalTimer: 'wired' })
    const user = userEvent.setup()
    renderTimer()

    await user.click(await screen.findByRole('button', { name: 'Connect timer' }))
    act(() => wiredMock.options!.onSignalChange(true))
    const timer = screen.getByRole('button', { name: 'Timer' })
    act(() => wiredMock.options!.onEvent({ state: 'running' }))
    expect(timer).toHaveClass('timer-running')
    act(() => wiredMock.options!.onEvent({ state: 'idle' }))
    expect(timer).toHaveClass('timer-idle')
    expect(await db.solves.count()).toBe(0)
  })

  it('only reacts to Space when controls are set to Space', async () => {
    const ownerId = await ensureGuestOwner()
    const settings = await getOrCreateSettings(ownerId)
    await db.settings.put({ ...settings, timerStartDelayMs: 0, timerControls: 'space' })
    renderTimer('desktop')
    await waitFor(() => expect(timerHint()).toHaveTextContent(/^Hold Space to start$/))

    const timer = screen.getByRole('button', { name: 'Timer' })
    fireEvent.pointerDown(timer, { pointerId: 1 })
    fireEvent.pointerUp(timer, { pointerId: 1 })
    fireEvent.keyDown(window, { code: 'KeyA', key: 'a' })
    fireEvent.keyUp(window, { code: 'KeyA', key: 'a' })
    expect(timer).toHaveClass('timer-idle')

    fireEvent.keyDown(window, { code: 'Space', key: ' ' })
    await waitFor(() => expect(timerHint()).toHaveTextContent(/Release to start/i))
    fireEvent.keyUp(window, { code: 'Space', key: ' ' })
    await waitFor(() => expect(timerHint()).toHaveTextContent(/^Press Space to stop$/))
  })

  it('ignores touch and mouse when controls are set to keys only', async () => {
    const ownerId = await ensureGuestOwner()
    const settings = await getOrCreateSettings(ownerId)
    await db.settings.put({ ...settings, timerStartDelayMs: 0, timerControls: 'keys' })
    renderTimer()
    await waitFor(() => expect(timerHint()).toHaveTextContent(/^Hold any key to start$/))

    const timer = screen.getByRole('button', { name: 'Timer' })
    fireEvent.pointerDown(timer, { pointerId: 1 })
    fireEvent.pointerUp(timer, { pointerId: 1 })
    expect(timer).toHaveClass('timer-idle')

    fireEvent.keyDown(window, { code: 'KeyJ', key: 'j' })
    await waitFor(() => expect(timerHint()).toHaveTextContent(/Release to start/i))
    fireEvent.keyUp(window, { code: 'KeyJ', key: 'j' })
    await waitFor(() => expect(timerHint()).toHaveTextContent(/^Press any key to stop$/))
  })

  it('leaves Tab, Escape and function keys to the browser', async () => {
    renderTimer('desktop')
    await waitFor(() => expect(timerHint()).toHaveTextContent(/Hold any key to start/i))

    for (const [code, key] of [
      ['Tab', 'Tab'],
      ['Escape', 'Escape'],
      ['F5', 'F5'],
    ]) {
      const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, code, key })
      window.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(false)
    }
    expect(screen.getByRole('button', { name: 'Timer' })).toHaveClass('timer-idle')
  })

  it('regenerates scramble from the compact action', async () => {
    const user = userEvent.setup()
    renderTimer()
    await screen.findByRole('button', { name: 'New scramble' })
    expect((await screen.findAllByText(/R U R' U'/))[0]).toBeInTheDocument()
    const calls = vi.mocked(generateScramble).mock.calls.length
    await user.click(screen.getByRole('button', { name: 'New scramble' }))
    await waitFor(() => {
      expect(vi.mocked(generateScramble).mock.calls.length).toBeGreaterThan(calls)
    })
    expect(await screen.findByRole('button', { name: 'New scramble' })).toBeInTheDocument()
  })

  it('shows scramble without a sessions manager button', async () => {
    renderTimer()
    await waitFor(() => {
      expect(timerHint()).toHaveTextContent(/Hold any key or tap and hold to start/i)
    })
    expect((await screen.findAllByText(/R U R' U'/))[0]).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /sessions/i })).not.toBeInTheDocument()
  })

  it('returns to idle when a hold is cancelled', async () => {
    const ownerId = await ensureGuestOwner()
    const settings = await getOrCreateSettings(ownerId)
    await db.settings.put({ ...settings, timerStartDelayMs: 500 })

    renderTimer()
    await waitFor(() => {
      expect(timerHint()).toHaveTextContent(/Hold any key or tap and hold to start/i)
    })
    const timer = screen.getByRole('button', { name: 'Timer' })
    fireEvent.pointerDown(timer, { pointerId: 1 })
    await waitFor(() => {
      expect(within(timer).getByText(/Hold…/)).toBeInTheDocument()
    })
    fireEvent.pointerCancel(timer, { pointerId: 1 })
    await waitFor(() => {
      expect(timerHint()).toHaveTextContent(/Hold any key or tap and hold to start/i)
    })
  })

  it('starts when the timer is held until ready', async () => {
    renderTimer()
    await waitFor(() => {
      expect(timerHint()).toHaveTextContent(/Hold any key or tap and hold to start/i)
    })

    const timer = screen.getByRole('button', { name: 'Timer' })
    fireEvent.pointerDown(timer, { pointerId: 1 })
    await waitFor(
      () => {
        expect(timerHint()).toHaveTextContent(/Release to start/i)
      },
      { timeout: 4000 },
    )
    fireEvent.pointerUp(timer, { pointerId: 1 })

    await waitFor(() => {
      expect(timerHint()).toHaveTextContent(/Tap or press any key to stop/i)
    })
  })

  it('uses hold-to-start on desktop and ignores system keys', async () => {
    renderTimer('desktop')
    await waitFor(() => {
      expect(timerHint()).toHaveTextContent(/Hold any key to start/i)
    })

    fireEvent.keyDown(window, { code: 'MetaLeft', key: 'Meta' })
    fireEvent.keyDown(window, { code: 'ControlLeft', key: 'Control' })
    fireEvent.keyDown(window, { code: 'KeyA', key: 'a', ctrlKey: true })
    expect(timerHint()).toHaveTextContent(/Hold any key to start/i)

    const repeatedSpace = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      code: 'Space',
      key: ' ',
      repeat: true,
    })
    window.dispatchEvent(repeatedSpace)
    expect(repeatedSpace.defaultPrevented).toBe(true)
    expect(timerHint()).toHaveTextContent(/Hold any key to start/i)

    fireEvent.keyDown(window, { code: 'KeyA', key: 'a' })
    await waitFor(
      () => {
        expect(timerHint()).toHaveTextContent(/Release to start/i)
      },
      { timeout: 4000 },
    )
    fireEvent.keyUp(window, { code: 'KeyA', key: 'a' })

    await waitFor(() => {
      expect(timerHint()).toHaveTextContent(/Press any key to stop/i)
    })
  })

  it('saves a finished solve automatically', async () => {
    renderTimer()
    expect((await screen.findAllByText(/R U R' U'/))[0]).toBeInTheDocument()
    await waitFor(() => {
      expect(timerHint()).toHaveTextContent(/Hold any key or tap and hold to start/i)
    })

    fireEvent.keyDown(window, { code: 'Space', key: ' ' })
    await waitFor(
      () => {
        expect(timerHint()).toHaveTextContent(/Release to start/i)
      },
      { timeout: 4000 },
    )
    fireEvent.keyUp(window, { code: 'Space', key: ' ' })
    await waitFor(() => {
      expect(timerHint()).toHaveTextContent(/Tap or press any key to stop/i)
    })
    fireEvent.keyDown(window, { code: 'Space', key: ' ' })
    expect(await screen.findByText(/Saved /i)).toBeInTheDocument()
    await waitFor(() => {
      expect(timerHint()).toHaveTextContent(/Hold any key or tap and hold to start/i)
    })
    expect(screen.queryByRole('button', { name: 'Save time' })).not.toBeInTheDocument()
  })

  it('hides timer hints when showTimerHints is false', async () => {
    const ownerId = await ensureGuestOwner()
    const settings = await getOrCreateSettings(ownerId)
    await db.settings.put({ ...settings, showTimerHints: false })

    renderTimer()
    await screen.findByRole('button', { name: 'Timer' })
    await waitFor(
      () => {
        expect(timerHint()).toBeNull()
      },
      { timeout: 4000 },
    )
  })
})
