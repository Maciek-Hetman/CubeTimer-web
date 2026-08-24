/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppProviders } from '../../app/AppProviders'
import { db, getOrCreateSettings } from '../../data/db'
import { TimerPage } from './TimerPage'

vi.mock('../scramble/scrambleService', () => ({
  generateScramble: vi.fn(async () => "R U R' U'"),
}))

describe('TimerPage', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('shows scramble and opens the session manager in manual mode', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <AppProviders>
          <TimerPage />
        </AppProviders>
      </MemoryRouter>,
    )
    expect(await screen.findByText(/Tap and hold to start/i)).toBeInTheDocument()
    expect(await screen.findByText(/R U R' U'/)).toBeInTheDocument()
    const settings = (await db.settings.toArray())[0] ?? (await getOrCreateSettings('test'))
    await db.settings.put({ ...settings, sessionMode: 'manual' })
    await user.click(await screen.findByRole('button', { name: /sessions/i }))
    expect(await screen.findByRole('dialog', { name: /sessions/i })).toBeInTheDocument()
  })
})
