import { describe, expect, it } from 'vitest'
import { changePassword, deleteAccount } from './auth'
import type { AuthenticatedRequest } from './client'

describe('account clients', () => {
  it('changes the password on the documented path', async () => {
    const calls: Array<{ path: string; method?: string; body?: unknown }> = []
    const request: AuthenticatedRequest = async (path, options) => {
      calls.push({ path, method: options?.method, body: options?.body })
      return {} as never
    }
    await changePassword(request, 'old-pass', 'new-pass')
    expect(calls).toEqual([
      {
        path: '/v1/me/password',
        method: 'PUT',
        body: { current_password: 'old-pass', new_password: 'new-pass' },
      },
    ])
  })

  it('deletes the account on the documented path', async () => {
    const calls: Array<{ path: string; method?: string }> = []
    const request: AuthenticatedRequest = async (path, options) => {
      calls.push({ path, method: options?.method })
      return {} as never
    }
    await deleteAccount(request)
    expect(calls).toEqual([{ path: '/v1/me', method: 'DELETE' }])
  })
})