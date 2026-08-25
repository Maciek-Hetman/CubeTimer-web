/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { User } from '../../api/types'
import { AdminRoute } from './AdminRoute'

const useApp = vi.hoisted(() => vi.fn())

vi.mock('../../app/AppProviders', () => ({
  useApp,
}))

function renderAdmin(user: User | null) {
  useApp.mockReturnValue({ user })
  return render(
    <MemoryRouter initialEntries={['/admin']}>
      <Routes>
        <Route path="/login" element={<p>Sign in</p>} />
        <Route
          path="/admin"
          element={
            <AdminRoute>
              <p>Admin metrics</p>
            </AdminRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

describe('AdminRoute', () => {
  afterEach(() => {
    cleanup()
  })

  it('sends guests to sign-in', () => {
    renderAdmin(null)
    expect(screen.getByText('Sign in')).toBeInTheDocument()
  })

  it('blocks signed-in non-admins', () => {
    renderAdmin({
      id: 'user-1',
      email: 'user@example.com',
      email_verified: true,
      user_role: 'user',
    })
    expect(screen.getByText('Access denied')).toBeInTheDocument()
    expect(screen.queryByText('Admin metrics')).not.toBeInTheDocument()
  })

  it('renders children for admins', () => {
    renderAdmin({
      id: 'admin-1',
      email: 'admin@example.com',
      email_verified: true,
      user_role: 'admin',
    })
    expect(screen.getByText('Admin metrics')).toBeInTheDocument()
  })
})
