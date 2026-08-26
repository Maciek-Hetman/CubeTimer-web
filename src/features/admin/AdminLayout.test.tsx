/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type AdminErrorStats, type AdminOverviewStats, type AdminRequestStats } from '../../api/types'
import { AdminLayout } from './AdminLayout'
import { AdminOverviewPage } from './AdminOverviewPage'
import { AdminTrafficPage } from './AdminTrafficPage'
import { AdminErrorsPage } from './AdminErrorsPage'

const authenticatedRequest = vi.hoisted(() => vi.fn())

vi.mock('../../app/AppProviders', () => ({
  useApp: () => ({ authenticatedRequest }),
}))

const overview: AdminOverviewStats = {
  total_users: 12,
  verified_users: 10,
  new_users_24h: 1,
  new_users_7d: 3,
  new_users_30d: 8,
  active_users_24h: 4,
  active_users_7d: 7,
  active_users_30d: 9,
  total_devices: 15,
  total_sessions: 40,
  total_solves: 200,
}

const requests: AdminRequestStats = {
  from: '2026-08-18T00:00:00.000Z',
  to: '2026-08-25T00:00:00.000Z',
  interval: 'day',
  points: [
    {
      bucket: '2026-08-24T00:00:00.000Z',
      request_count: 10,
      status_2xx: 8,
      status_3xx: 0,
      status_4xx: 1,
      status_5xx: 1,
      average_duration_ms: 12.5,
      max_duration_ms: 40,
    },
  ],
}

const errors: AdminErrorStats = {
  from: '2026-08-18T00:00:00.000Z',
  to: '2026-08-25T00:00:00.000Z',
  interval: 'day',
  points: [
    {
      bucket: '2026-08-24T00:00:00.000Z',
      method: 'POST',
      route: '/v1/sync',
      status_code: 409,
      request_count: 2,
    },
    {
      bucket: '2026-08-25T00:00:00.000Z',
      method: 'POST',
      route: '/v1/sync',
      status_code: 409,
      request_count: 3,
    },
  ],
}

function mockStats() {
  authenticatedRequest.mockImplementation(async (path: string) => {
    if (path === '/v1/admin/stats/overview') {
      return overview
    }
    if (path.startsWith('/v1/admin/stats/requests')) {
      return requests
    }
    if (path.startsWith('/v1/admin/stats/errors')) {
      return errors
    }
    throw new Error(`unexpected path ${path}`)
  })
}

function renderAdminApp(initialRoute = '/admin/overview') {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <Routes>
        <Route path="/admin" element={<AdminLayout />}>
          <Route path="overview" element={<AdminOverviewPage />} />
          <Route path="traffic" element={<AdminTrafficPage />} />
          <Route path="errors" element={<AdminErrorsPage />} />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

describe('AdminLayout & Pages', () => {
  afterEach(() => {
    cleanup()
    authenticatedRequest.mockReset()
  })

  it('loads overview metrics', async () => {
    mockStats()
    renderAdminApp('/admin/overview')
    expect(await screen.findByText('12')).toBeInTheDocument() // Total Users
    // 10/12 = 83.3%
    expect(screen.getByText('83.3%')).toBeInTheDocument()
  })

  it('loads errors on the errors tab', async () => {
    mockStats()
    renderAdminApp('/admin/errors')
    expect(await screen.findByText('/v1/sync')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('requests a new range when the control changes on the traffic tab', async () => {
    mockStats()
    const user = userEvent.setup()
    renderAdminApp('/admin/traffic')
    
    // Check for chart titles to ensure page loaded
    expect(await screen.findByText('Volume and status')).toBeInTheDocument()
    
    await user.click(screen.getByRole('button', { name: '24 hours' }))
    await waitFor(() => {
      const requestPaths = authenticatedRequest.mock.calls
        .map((call) => String(call[0]))
        .filter((path) => path.startsWith('/v1/admin/stats/requests'))
      expect(requestPaths.some((path) => path.includes('interval=hour'))).toBe(true)
    })
  })

  it('shows an error and retries', async () => {
    authenticatedRequest.mockRejectedValue(new ApiError(403, 'forbidden', 'Forbidden'))
    const user = userEvent.setup()
    renderAdminApp('/admin/overview')
    
    expect(await screen.findByText(/do not have permission/i)).toBeInTheDocument()
    
    mockStats()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('12')).toBeInTheDocument()
  })
})
