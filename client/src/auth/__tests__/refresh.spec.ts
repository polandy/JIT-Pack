// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createAuthRefresher, AUTH_EXPIRED_EVENT } from '../refresh'
import { loadTokens } from '../tokens'
import { installHarness } from '@/__tests__/harness'

const KEY = 'jitpack_tokens'

/**
 * The instant every case starts at, and the clock the refresher reads.
 *
 * A backoff is an interval, and a test of an interval has to be able to say
 * where in it the next call happens — `vi.advanceTimersByTime` would move a
 * timer this code does not use, and waiting for the real 5 s is the kind of
 * assertion that only usually holds.
 */
const NOW = 1_700_000_000_000
let now = NOW
const clock = () => now

function storeTokens(
  overrides: Partial<{ access_token: string; refresh_token: string; expires_at: number }> = {},
) {
  localStorage.setItem(
    KEY,
    JSON.stringify({
      access_token: 'old-access',
      refresh_token: 'old-refresh',
      expires_at: NOW + 3600_000,
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
    now = NOW
    fetchSpy = installHarness().fetch
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns null without stored tokens and never calls the server', async () => {
    const refresher = createAuthRefresher('http://server', clock)
    expect(await refresher.freshToken()).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('returns the stored token untouched while it is still fresh', async () => {
    storeTokens()
    const refresher = createAuthRefresher('http://server', clock)
    expect(await refresher.freshToken()).toBe('old-access')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('refreshes proactively when the token is about to expire', async () => {
    storeTokens({ expires_at: NOW + 5_000 }) // inside the skew window
    fetchSpy.mockResolvedValueOnce(
      tokenResponse({ access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 300 }),
    )
    const refresher = createAuthRefresher('http://server', clock)

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
    expect(stored.expires_at).toBeGreaterThan(NOW)
  })

  it('keeps the old refresh token when the IdP does not rotate it', async () => {
    storeTokens({ expires_at: 0 })
    fetchSpy.mockResolvedValueOnce(tokenResponse({ access_token: 'new-access', expires_in: 300 }))
    const refresher = createAuthRefresher('http://server', clock)

    await refresher.freshToken()

    expect(loadTokens()!.refresh_token).toBe('old-refresh')
  })

  it('clears the session and announces expiry when the IdP rejects the refresh', async () => {
    storeTokens({ expires_at: 0 })
    fetchSpy.mockResolvedValueOnce(tokenResponse({ error: { code: 'unauthorized' } }, 401))
    const expired = vi.fn()
    window.addEventListener(AUTH_EXPIRED_EVENT, expired)
    const refresher = createAuthRefresher('http://server', clock)

    expect(await refresher.freshToken()).toBeNull()

    expect(loadTokens()).toBeNull()
    expect(expired).toHaveBeenCalledOnce()
    window.removeEventListener(AUTH_EXPIRED_EVENT, expired)
  })

  it('keeps a still-valid token when the server is unreachable (offline tolerance)', async () => {
    // Inside the skew window: due a refresh, but not yet refused by anyone.
    storeTokens({ expires_at: NOW + 5_000 })
    fetchSpy.mockRejectedValueOnce(new TypeError('network down'))
    const refresher = createAuthRefresher('http://server', clock)

    expect(await refresher.freshToken()).toBe('old-access')
    expect(loadTokens()!.refresh_token).toBe('old-refresh')
  })

  it('keeps a still-valid token on transient server errors', async () => {
    storeTokens({ expires_at: NOW + 5_000 })
    fetchSpy.mockResolvedValueOnce(tokenResponse({ error: { code: 'idp_unreachable' } }, 502))
    const refresher = createAuthRefresher('http://server', clock)

    expect(await refresher.freshToken()).toBe('old-access')
    expect(loadTokens()).not.toBeNull()
  })

  it('hands back no token once the one it holds has expired — an expired token is a 401, not a degraded answer', async () => {
    storeTokens({ expires_at: NOW - 1 })
    fetchSpy.mockRejectedValueOnce(new TypeError('network down'))
    const refresher = createAuthRefresher('http://server', clock)

    expect(await refresher.freshToken()).toBeNull()
    // The session is not ended: only the IdP disowning it may do that.
    expect(loadTokens()).not.toBeNull()
  })

  it('asks the IdP once per backoff window, however often it is asked', async () => {
    storeTokens({ expires_at: NOW - 1 })
    fetchSpy.mockRejectedValue(new TypeError('network down'))
    const refresher = createAuthRefresher('http://server', clock)

    expect(await refresher.refresh()).toBeNull()
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    // Every request the app makes meanwhile comes back through here. Before
    // the window existed, each of them was another POST to the IdP — which is
    // what drained the token endpoint's rate limit on 2026-09-13.
    now = NOW + 4_999
    expect(await refresher.refresh()).toBeNull()
    expect(await refresher.freshToken()).toBeNull()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('tries again once the window has passed, and waits longer after the second failure', async () => {
    storeTokens({ expires_at: NOW - 1 })
    fetchSpy.mockRejectedValue(new TypeError('network down'))
    const refresher = createAuthRefresher('http://server', clock)

    await refresher.refresh() // failure 1 → 5 s
    now = NOW + 5_000
    await refresher.refresh() // failure 2 → 30 s
    expect(fetchSpy).toHaveBeenCalledTimes(2)

    now = NOW + 5_000 + 29_999
    await refresher.refresh()
    expect(fetchSpy).toHaveBeenCalledTimes(2)

    now = NOW + 5_000 + 30_000
    await refresher.refresh()
    expect(fetchSpy).toHaveBeenCalledTimes(3)
  })

  it('drops the backoff once a refresh lands', async () => {
    storeTokens({ expires_at: NOW - 1 })
    fetchSpy.mockRejectedValueOnce(new TypeError('network down'))
    const refresher = createAuthRefresher('http://server', clock)

    await refresher.refresh() // failure 1 → 5 s
    now = NOW + 5_000
    fetchSpy.mockResolvedValueOnce(
      tokenResponse({ access_token: 'new-access', refresh_token: 'r2', expires_in: 300 }),
    )
    expect(await refresher.refresh()).toBe('new-access')

    // The next failure starts the ladder again rather than at the rung the
    // dead session had climbed to.
    fetchSpy.mockRejectedValueOnce(new TypeError('network down'))
    expect(await refresher.refresh()).toBe('new-access') // still valid: kept
    now = NOW + 5_000 + 4_999
    await refresher.refresh()
    expect(fetchSpy).toHaveBeenCalledTimes(3)
  })

  it('deduplicates concurrent refreshes into a single request', async () => {
    storeTokens({ expires_at: 0 })
    let release!: (r: Response) => void
    fetchSpy.mockReturnValueOnce(new Promise<Response>((resolve) => (release = resolve)))
    const refresher = createAuthRefresher('http://server', clock)

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
    const refresher = createAuthRefresher('http://server', clock)

    expect(await refresher.refresh()).toBe('new-access')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})

describe('onSessionEnded', () => {
  // The latch is module state, so every case starts from a fresh module.
  async function freshModule() {
    vi.resetModules()
    return await import('../refresh')
  }

  it('reaches a handler attached before the session ends, once, until disposed', async () => {
    const { endSession, onSessionEnded } = await freshModule()
    const handler = vi.fn()
    const dispose = onSessionEnded(handler)

    endSession()
    expect(handler).toHaveBeenCalledOnce()

    dispose()
    endSession()
    expect(handler).toHaveBeenCalledOnce()
  })

  it('reaches a handler attached after the session ended — FR-23.3: the request that ends it can answer before the app is listening', async () => {
    const { endSession, onSessionEnded } = await freshModule()
    endSession()

    const handler = vi.fn()
    onSessionEnded(handler)

    expect(handler).toHaveBeenCalledOnce()
  })
})
