/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountPage } from './AccountPage'

const mocks = vi.hoisted(() => ({
  user: null as { id: string; email: string; email_verified: boolean; user_role: string } | null,
  syncStatus: 'idle' as string,
  authenticatedRequest: vi.fn(),
  deleteAccount: vi.fn(),
  rejectedCount: 0 as number,
  dismissAllRejected: vi.fn(),
}))

vi.mock('../../app/AppProviders', () => ({
  useApp: () => ({
    user: mocks.user,
    logout: vi.fn(),
    deleteAccount: mocks.deleteAccount,
    authenticatedRequest: mocks.authenticatedRequest,
    syncStatus: mocks.syncStatus,
    pendingMutations: 3,
    conflicts: 1,
    rejectedCount: mocks.rejectedCount,
    dismissAllRejected: mocks.dismissAllRejected,
    lastSyncedAt: null,
    deviceName: 'Test Device',
    deviceId: 'dev-1',
    requestSync: vi.fn(),
  }),
}))

function renderPage() {
  return render(
    <MemoryRouter>
      <AccountPage />
    </MemoryRouter>,
  )
}

const signedIn = {
  id: 'u1',
  email: 'me@example.com',
  email_verified: true,
  user_role: 'user',
} as const

describe('AccountPage', () => {
  beforeEach(() => {
    mocks.user = signedIn
    mocks.syncStatus = 'idle'
    mocks.rejectedCount = 0
  })

  afterEach(() => {
    cleanup()
    mocks.authenticatedRequest.mockReset()
    mocks.deleteAccount.mockReset()
    mocks.dismissAllRejected.mockReset()
    vi.unstubAllGlobals()
  })

  it('shows password, server/sync, and danger panels when signed in', () => {
    renderPage()
    expect(screen.getByText('me@example.com')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Password' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Server & sync' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Delete account' })).toBeInTheDocument()
    expect(screen.getByText('Pending changes')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('Test Device')).toBeInTheDocument()
  })

  it('submits the password change to the account endpoint', async () => {
    const user = userEvent.setup()
    mocks.authenticatedRequest.mockResolvedValue(undefined)
    renderPage()

    await user.type(screen.getByLabelText('Current password'), 'old-pass')
    await user.type(screen.getByLabelText(/New password/), 'new-pass-123')
    await user.click(screen.getByRole('button', { name: 'Update password' }))

    await waitFor(() => {
      expect(mocks.authenticatedRequest).toHaveBeenCalledWith('/v1/me/password', {
        method: 'PUT',
        body: { current_password: 'old-pass', new_password: 'new-pass-123' },
      })
    })
    expect(await screen.findByText('Password updated.')).toBeInTheDocument()
  })

  it('requires typed email confirmation before deleting the account', async () => {
    const user = userEvent.setup()
    mocks.deleteAccount.mockResolvedValue(undefined)
    renderPage()

    await user.click(screen.getByRole('button', { name: 'Delete account' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/cannot be undone/i)).toBeInTheDocument()

    const confirm = within(dialog).getByRole('button', { name: 'Delete account' })
    expect(confirm).toBeDisabled()

    await user.type(within(dialog).getByLabelText(/to confirm/), 'me@example.com')
    expect(confirm).toBeEnabled()

    await user.click(confirm)
    await waitFor(() => {
      expect(mocks.deleteAccount).toHaveBeenCalled()
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('surfaces delete failures inside the dialog', async () => {
    const user = userEvent.setup()
    mocks.deleteAccount.mockRejectedValue(new Error('boom'))
    renderPage()

    await user.click(screen.getByRole('button', { name: 'Delete account' }))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText(/to confirm/), 'me@example.com')
    await user.click(within(dialog).getByRole('button', { name: 'Delete account' }))

    expect(await within(dialog).findByText('Could not delete account')).toBeInTheDocument()
  })

  it('pings the server health endpoint from the sync panel', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    renderPage()

    await user.click(screen.getByRole('button', { name: 'Check server' }))

    expect(await screen.findByText('Server reachable')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:43781/health/live')
  })

  it('shows rejected changes and dismisses them', async () => {
    const user = userEvent.setup()
    mocks.rejectedCount = 2
    renderPage()

    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText(/2 rejected changes could not be synced/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Dismiss all' }))
    expect(mocks.dismissAllRejected).toHaveBeenCalled()
  })

  it('hides account management panels for guests', () => {
    mocks.user = null
    renderPage()
    expect(screen.getByText('Create account')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Password' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Server & sync' })).not.toBeInTheDocument()
  })
})