// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { APIClient, APIRequestError } from '../client'
import { AUTH_EXPIRED_EVENT } from '@/auth/refresh'
import { saveTokens, loadTokens } from '@/auth/tokens'
import { installHarness } from '@/__tests__/harness'

describe('APIClient', () => {
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchSpy = installHarness().fetch
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sends GET requests with auth header', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    const client = new APIClient('http://localhost:8080', () => 'test-jwt')
    const result = await client.get('/api/v1/health')
    expect(result).toEqual({ ok: true })
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:8080/api/v1/health',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer test-jwt' }),
      }),
    )
  })

  it('sends POST with JSON body', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    const client = new APIClient('http://localhost:8080', () => 'jwt')
    const body = { mutations: [] }
    await client.post('/api/v1/trips/t1/sync', body)
    const call = fetchSpy.mock.calls[0]!
    expect(call[1].method).toBe('POST')
    expect(call[1].body).toBe(JSON.stringify(body))
    expect(call[1].headers['Content-Type']).toBe('application/json')
  })

  it('throws APIRequestError on non-2xx response', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: 'forbidden', message: 'nope' } }), {
        status: 403,
      }),
    )
    const client = new APIClient('http://localhost:8080', () => 'jwt')
    await expect(client.get('/api/v1/foo')).rejects.toThrow(APIRequestError)

    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: 'forbidden', message: 'nope' } }), {
        status: 403,
      }),
    )
    const err: APIRequestError = await client.get('/api/v1/foo').then(
      () => {
        throw new Error('expected the request to reject')
      },
      (e) => e as APIRequestError,
    )
    expect(err).toBeInstanceOf(APIRequestError)
    expect(err.status).toBe(403)
    expect(err.apiError?.code).toBe('forbidden')
  })

  it('omits auth header when token is null', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))
    const client = new APIClient('http://localhost:8080', () => null)
    await client.get('/api/v1/health')
    const headers = fetchSpy.mock.calls[0]![1].headers
    expect(headers.Authorization).toBeUndefined()
  })

  it('appends query params to GET', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))
    const client = new APIClient('http://localhost:8080', () => 'jwt')
    await client.get('/api/v1/trips/t1/sync', { cursor: '42', limit: '100' })
    expect(fetchSpy.mock.calls[0]![0]).toBe(
      'http://localhost:8080/api/v1/trips/t1/sync?cursor=42&limit=100',
    )
  })

  it('awaits an async token provider', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))
    const client = new APIClient('http://localhost:8080', async () => 'async-jwt')
    await client.get('/api/v1/health')
    expect(fetchSpy.mock.calls[0]![1].headers.Authorization).toBe('Bearer async-jwt')
  })

  it('retries once with a fresh token after a 401', async () => {
    fetchSpy
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    const onUnauthorized = vi.fn().mockResolvedValue('fresh-jwt')
    const client = new APIClient('http://localhost:8080', () => 'stale-jwt', onUnauthorized)

    const result = await client.get('/api/v1/master/sync')

    expect(result).toEqual({ ok: true })
    expect(onUnauthorized).toHaveBeenCalledOnce()
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(fetchSpy.mock.calls[1]![1].headers.Authorization).toBe('Bearer fresh-jwt')
  })

  it('throws the 401 when the refresh yields no token', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 401 }))
    const onUnauthorized = vi.fn().mockResolvedValue(null)
    const client = new APIClient('http://localhost:8080', () => 'stale-jwt', onUnauthorized)

    await expect(client.get('/api/v1/master/sync')).rejects.toMatchObject({ status: 401 })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('does not retry more than once on repeated 401s', async () => {
    fetchSpy
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
    const onUnauthorized = vi.fn().mockResolvedValue('still-rejected')
    const client = new APIClient('http://localhost:8080', () => 'stale-jwt', onUnauthorized)

    await expect(client.get('/api/v1/master/sync')).rejects.toMatchObject({ status: 401 })
    expect(onUnauthorized).toHaveBeenCalledOnce()
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('throws 401 without a refresh hook (single-user servers)', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 401 }))
    const client = new APIClient('http://localhost:8080', () => null)
    await expect(client.get('/api/v1/health')).rejects.toMatchObject({ status: 401 })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('retries blob downloads after a 401 (M17 exports)', async () => {
    fetchSpy
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response('data', { status: 200 }))
    const onUnauthorized = vi.fn().mockResolvedValue('fresh-jwt')
    const client = new APIClient('http://localhost:8080', () => 'stale-jwt', onUnauthorized)

    const blob = await client.getBlob('/api/v1/me/export.json')

    expect(await blob.text()).toBe('data')
    expect(fetchSpy.mock.calls[1]![1].headers.Authorization).toBe('Bearer fresh-jwt')
  })

  /**
   * FR-23.3, the client half. A deactivated account keeps tokens that still
   * look valid in localStorage, so nothing expires them: without this branch
   * every request 403s and the app is indistinguishable from an offline one.
   *
   * The failure path is the load-bearing one — a 403 is also how the server
   * refuses a non-admin the M20 endpoints, and ending *that* session would
   * be a worse defect than the one being fixed (E2E-M20-05 drives it).
   */
  describe('a 403 that ends the session, and the ones that must not', () => {
    function forbidden(code: string): Response {
      return new Response(JSON.stringify({ error: { code, message: 'nope' } }), { status: 403 })
    }

    function armed(): { expired: () => boolean; dispose: () => void } {
      let fired = false
      const onExpired = () => {
        fired = true
      }
      window.addEventListener(AUTH_EXPIRED_EVENT, onExpired)
      saveTokens({ access_token: 'a', refresh_token: 'r', expires_in: 300 })
      return {
        expired: () => fired,
        dispose: () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired),
      }
    }

    it('ends the session on account_deactivated', async () => {
      const watch = armed()
      fetchSpy.mockResolvedValueOnce(forbidden('account_deactivated'))
      const client = new APIClient('http://localhost:8080', () => 'jwt')

      await expect(client.get('/api/v1/trips')).rejects.toThrow(APIRequestError)

      expect(watch.expired()).toBe(true)
      expect(loadTokens()).toBeNull()
      watch.dispose()
    })

    it('leaves the session alone on any other 403', async () => {
      const watch = armed()
      fetchSpy.mockResolvedValueOnce(forbidden('forbidden'))
      const client = new APIClient('http://localhost:8080', () => 'jwt')

      await expect(client.get('/api/v1/admin/users')).rejects.toThrow(APIRequestError)

      expect(watch.expired()).toBe(false)
      expect(loadTokens()).not.toBeNull()
      watch.dispose()
    })
  })
})
