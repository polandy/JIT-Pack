import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createAuthRefresher, AUTH_EXPIRED_EVENT } from '../refresh'
import { loadTokens } from '../tokens'

const KEY = 'jitpack_tokens'

function storeTokens(overrides: Partial<{ access_token: string; refresh_token: string; expires_at: number }> = {}) {
  localStorage.setItem(
    KEY,
    JSON.stringify({
      access_token: 'old-access',
      refresh_token: 'old-refresh',
      expires_at: Date.now() + 3600_000,
      ...overrides,
    }),
  )
}

function tokenResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

describe('createAuthRefresher', () => {
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    localStorage.clear()
    fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns null without stored tokens and never calls the server', async () => {
    const refresher = createAuthRefresher('http://server')
    expect(await refresher.freshToken()).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('returns the stored token untouched while it is still fresh', async () => {
    storeTokens()
    const refresher = createAuthRefresher('http://server')
    expect(await refresher.freshToken()).toBe('old-access')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('refreshes proactively when the token is about to expire', async () => {
    storeTokens({ expires_at: Date.now() + 5_000 }) // inside the skew window
    fetchSpy.mockResolvedValueOnce(
      tokenResponse({ access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 300 }),
    )
    const refresher = createAuthRefresher('http://server')

    expect(await refresher.freshToken()).toBe('new-access')

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://server/api/v1/auth/refresh',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ refresh_token: 'old-refresh' }),
      }),
    )
    const stored = loadTokens()!
    expect(stored.access_token).toBe('new-access')
    expect(stored.refresh_token).toBe('new-refresh')
    expect(stored.expires_at).toBeGreaterThan(Date.now())
  })

  it('keeps the old refresh token when the IdP does not rotate it', async () => {
    storeTokens({ expires_at: 0 })
    fetchSpy.mockResolvedValueOnce(tokenResponse({ access_token: 'new-access', expires_in: 300 }))
    const refresher = createAuthRefresher('http://server')

    await refresher.freshToken()

    expect(loadTokens()!.refresh_token).toBe('old-refresh')
  })

  it('clears the session and announces expiry when the IdP rejects the refresh', async () => {
    storeTokens({ expires_at: 0 })
    fetchSpy.mockResolvedValueOnce(tokenResponse({ error: { code: 'unauthorized' } }, 401))
    const expired = vi.fn()
    window.addEventListener(AUTH_EXPIRED_EVENT, expired)
    const refresher = createAuthRefresher('http://server')

    expect(await refresher.freshToken()).toBeNull()

    expect(loadTokens()).toBeNull()
    expect(expired).toHaveBeenCalledOnce()
    window.removeEventListener(AUTH_EXPIRED_EVENT, expired)
  })

  it('keeps the current token when the server is unreachable (offline tolerance)', async () => {
    storeTokens({ expires_at: 0 })
    fetchSpy.mockRejectedValueOnce(new TypeError('network down'))
    const refresher = createAuthRefresher('http://server')

    expect(await refresher.freshToken()).toBe('old-access')
    expect(loadTokens()!.refresh_token).toBe('old-refresh')
  })

  it('keeps the current token on transient server errors', async () => {
    storeTokens({ expires_at: 0 })
    fetchSpy.mockResolvedValueOnce(tokenResponse({ error: { code: 'idp_unreachable' } }, 502))
    const refresher = createAuthRefresher('http://server')

    expect(await refresher.freshToken()).toBe('old-access')
    expect(loadTokens()).not.toBeNull()
  })

  it('deduplicates concurrent refreshes into a single request', async () => {
    storeTokens({ expires_at: 0 })
    let release!: (r: Response) => void
    fetchSpy.mockReturnValueOnce(new Promise<Response>((resolve) => (release = resolve)))
    const refresher = createAuthRefresher('http://server')

    const first = refresher.freshToken()
    const second = refresher.freshToken()
    release(tokenResponse({ access_token: 'new-access', refresh_token: 'r2', expires_in: 300 }))

    expect(await first).toBe('new-access')
    expect(await second).toBe('new-access')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('forces a refresh via refresh() even when the token looks fresh (401 path)', async () => {
    storeTokens() // fresh by expiry, but the server said 401
    fetchSpy.mockResolvedValueOnce(
      tokenResponse({ access_token: 'new-access', refresh_token: 'r2', expires_in: 300 }),
    )
    const refresher = createAuthRefresher('http://server')

    expect(await refresher.refresh()).toBe('new-access')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})
