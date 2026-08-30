import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getHealthLive, getHealthReady, getLive, getReady } from './health'

describe('health API clients', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    globalThis.fetch = vi.fn()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('getHealthLive calls GET /health/live', async () => {
    const mockFetch = vi.mocked(globalThis.fetch)
    mockFetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
      text: async () => JSON.stringify({ status: 'ok' }),
    } as Response)

    const res = await getHealthLive()
    expect(res).toEqual({ status: 'ok' })
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/health/live'),
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('getHealthReady calls GET /health/ready', async () => {
    const mockFetch = vi.mocked(globalThis.fetch)
    mockFetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
      text: async () => JSON.stringify({ status: 'ok' }),
    } as Response)

    const res = await getHealthReady()
    expect(res).toEqual({ status: 'ok' })
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/health/ready'),
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('getLive and getReady aliases call the same endpoints', async () => {
    const mockFetch = vi.mocked(globalThis.fetch)
    mockFetch.mockResolvedValue({
      status: 200,
      ok: true,
      text: async () => JSON.stringify({ status: 'ok' }),
    } as Response)

    await getLive()
    await getReady()
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/health/live'),
      expect.anything(),
    )
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/health/ready'),
      expect.anything(),
    )
  })
})
