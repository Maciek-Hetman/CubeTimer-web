/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../api/types'
import { GoogleSignInButton } from './GoogleSignInButton'
import { googleAuthErrorMessage } from './googleIdentity'

function installGoogleMock() {
  const api = {
    initialize: vi.fn(),
    renderButton: vi.fn(),
    disableAutoSelect: vi.fn(),
  }
  window.google = { accounts: { id: api } }
  return api
}

describe('GoogleSignInButton', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllEnvs()
    delete window.google
  })

  it('renders nothing when no client ID is configured', () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '')
    const { container } = render(<GoogleSignInButton onCredential={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('initializes GIS with a nonce and forwards the ID token with that nonce', async () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'client-123.apps.googleusercontent.com')
    const api = installGoogleMock()
    const onCredential = vi.fn()

    render(<GoogleSignInButton divider onCredential={onCredential} />)

    await waitFor(() => expect(api.renderButton).toHaveBeenCalled())
    expect(api.renderButton.mock.calls[0][0]).toBe(screen.getByTestId('google-signin'))
    expect(screen.getByRole('separator')).toHaveTextContent('or')

    const config = api.initialize.mock.calls[0][0]
    expect(config.client_id).toBe('client-123.apps.googleusercontent.com')
    expect(config.nonce).toMatch(/^[0-9a-f]{32}$/)

    config.callback({ credential: 'google-id-token' })

    expect(onCredential).toHaveBeenCalledWith({
      client_id: 'client-123.apps.googleusercontent.com',
      nonce: config.nonce,
      id_token: 'google-id-token',
    })
    // A fresh nonce is issued for the next attempt.
    expect(api.initialize).toHaveBeenCalledTimes(2)
    expect(api.initialize.mock.calls[1][0].nonce).not.toBe(config.nonce)
  })
})

describe('googleAuthErrorMessage', () => {
  it('explains how to link when the email already has an account', () => {
    const error = new ApiError(409, 'account_link_required', 'sign in to the existing account, then link this provider')
    expect(googleAuthErrorMessage(error, 'fallback')).toMatch(/link Google from the Account page/)
  })

  it('falls back for non-API errors', () => {
    expect(googleAuthErrorMessage(new Error('boom'), 'fallback')).toBe('fallback')
  })
})
