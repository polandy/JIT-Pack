import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { APIClient, APIRequestError } from '../client'

describe('APIClient', () => {
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
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
    await client.post('/api/v1/sync/trips/t1', body)
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
    try {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { code: 'forbidden', message: 'nope' } }), {
          status: 403,
        }),
      )
      await client.get('/api/v1/foo')
    } catch (e) {
      expect(e).toBeInstanceOf(APIRequestError)
      expect((e as APIRequestError).status).toBe(403)
      expect((e as APIRequestError).apiError?.code).toBe('forbidden')
    }
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
    await client.get('/api/v1/sync/trips/t1', { cursor: '42', limit: '100' })
    expect(fetchSpy.mock.calls[0]![0]).toBe(
      'http://localhost:8080/api/v1/sync/trips/t1?cursor=42&limit=100',
    )
  })
})
