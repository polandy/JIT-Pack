import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useAuth } from '../useAuth'

describe('useAuth — Single-User Mode', () => {
  it('auto-authenticates with no token needed', () => {
    const auth = useAuth({ mode: 'single-user' })
    expect(auth.isAuthenticated()).toBe(true)
    expect(auth.getToken()).toBeNull()
    expect(auth.userId()).toBe('local')
  })
})

describe('useAuth — OIDC Mode', () => {
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('starts unauthenticated', () => {
    const auth = useAuth({ mode: 'oidc', baseUrl: 'http://localhost:8080' })
    expect(auth.isAuthenticated()).toBe(false)
    expect(auth.getToken()).toBeNull()
  })

  it('exchanges auth code for token', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: 'jwt-token',
          refresh_token: 'refresh-1',
          expires_in: 3600,
        }),
        { status: 200 },
      ),
    )

    const auth = useAuth({ mode: 'oidc', baseUrl: 'http://localhost:8080' })
    await auth.exchangeCode('auth-code', 'verifier-123', 'http://localhost/callback')

    expect(auth.isAuthenticated()).toBe(true)
    expect(auth.getToken()).toBe('jwt-token')
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:8080/api/v1/auth/token',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          code: 'auth-code',
          code_verifier: 'verifier-123',
          redirect_uri: 'http://localhost/callback',
        }),
      }),
    )
  })

  it('refreshes token', async () => {
    // Initial exchange
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ access_token: 'jwt-1', refresh_token: 'refresh-1', expires_in: 3600 }),
        { status: 200 },
      ),
    )
    const auth = useAuth({ mode: 'oidc', baseUrl: 'http://localhost:8080' })
    await auth.exchangeCode('code', 'verifier', 'http://localhost/cb')

    // Refresh
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ access_token: 'jwt-2', refresh_token: 'refresh-2', expires_in: 3600 }),
        { status: 200 },
      ),
    )
    await auth.refresh()

    expect(auth.getToken()).toBe('jwt-2')
    expect(fetchSpy).toHaveBeenLastCalledWith(
      'http://localhost:8080/api/v1/auth/refresh',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ refresh_token: 'refresh-1' }),
      }),
    )
  })

  it('logout clears state', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ access_token: 'jwt-1', refresh_token: 'r1', expires_in: 3600 }),
        { status: 200 },
      ),
    )
    const auth = useAuth({ mode: 'oidc', baseUrl: 'http://localhost:8080' })
    await auth.exchangeCode('code', 'v', 'http://localhost/cb')

    auth.logout()
    expect(auth.isAuthenticated()).toBe(false)
    expect(auth.getToken()).toBeNull()
  })

  it('parses user id from JWT sub claim', async () => {
    const payload = btoa(JSON.stringify({ sub: 'user-42', exp: Date.now() / 1000 + 3600 }))
    const fakeJwt = `eyJ0.${payload}.sig`
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ access_token: fakeJwt, refresh_token: 'r1', expires_in: 3600 }),
        { status: 200 },
      ),
    )
    const auth = useAuth({ mode: 'oidc', baseUrl: 'http://localhost:8080' })
    await auth.exchangeCode('code', 'v', 'http://localhost/cb')

    expect(auth.userId()).toBe('user-42')
  })
})
