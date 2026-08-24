/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppProviders } from '../../app/AppProviders'
import { db, getOrCreateSettings } from '../../data/db'
import { generateScramble } from '../scramble/scrambleService'
import { TimerPage } from './TimerPage'

vi.mock('../scramble/scrambleService', () => ({
  generateScramble: vi.fn(async () => "R U R' U'"),
}))

function renderTimer() {
  return render(
    <MemoryRouter>
      <AppProviders>
        <TimerPage />
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
    await db.delete()
    await db.open()
  })

  afterEach(() => {
    cleanup()
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

  it('shows scramble and opens the session manager in manual mode', async () => {
    const user = userEvent.setup()
    renderTimer()
    await waitFor(() => {
      expect(timerHint()).toHaveTextContent(/Hold Space or tap and hold to start/i)
    })
    expect((await screen.findAllByText(/R U R' U'/))[0]).toBeInTheDocument()
    const settings = (await db.settings.toArray())[0] ?? (await getOrCreateSettings('test'))
    await db.settings.put({ ...settings, sessionMode: 'manual' })
    await user.click(await screen.findByRole('button', { name: /sessions/i }))
    expect(await screen.findByRole('dialog', { name: /sessions/i })).toBeInTheDocument()
  })

  it('returns to idle when a hold is cancelled', async () => {
    renderTimer()
    await waitFor(() => {
      expect(timerHint()).toHaveTextContent(/Hold Space or tap and hold to start/i)
    })
    const timer = screen.getByRole('button', { name: 'Timer' })
    fireEvent.pointerDown(timer, { pointerId: 1 })
    await waitFor(() => {
      expect(within(timer).getByText(/Hold…/)).toBeInTheDocument()
    })
    fireEvent.pointerCancel(timer, { pointerId: 1 })
    await waitFor(() => {
      expect(timerHint()).toHaveTextContent(/Hold Space or tap and hold to start/i)
    })
  })

  it('saves a finished solve from the keyboard', async () => {
    renderTimer()
    expect((await screen.findAllByText(/R U R' U'/))[0]).toBeInTheDocument()
    await waitFor(() => {
      expect(timerHint()).toHaveTextContent(/Hold Space or tap and hold to start/i)
    })

    fireEvent.keyDown(window, { code: 'Space', key: ' ' })
    await waitFor(
      () => {
        expect(timerHint()).toHaveTextContent(/Release to start/i)
      },
      { timeout: 2000 },
    )
    fireEvent.keyUp(window, { code: 'Space', key: ' ' })
    await waitFor(() => {
      expect(timerHint()).toHaveTextContent(/Tap or press Space to stop/i)
    })
    fireEvent.keyDown(window, { code: 'Space', key: ' ' })
    await screen.findByRole('button', { name: 'Save time' })
    fireEvent.keyDown(window, { key: 'Enter', code: 'Enter' })
    expect(await screen.findByText(/Saved /i)).toBeInTheDocument()
    await waitFor(() => {
      expect(timerHint()).toHaveTextContent(/Hold Space or tap and hold to start/i)
    })
  })
})
