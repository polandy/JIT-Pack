import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useWebSocket, type WSOptions } from '../useWebSocket'
import type { WSEvent } from '@/api/types'

class MockWebSocket {
  static instances: MockWebSocket[] = []
  url: string
  onopen: (() => void) | null = null
  onmessage: ((ev: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: ((ev: unknown) => void) | null = null
  readyState = 0 // CONNECTING
  sent: string[] = []

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
  }

  send(data: string) {
    this.sent.push(data)
  }

  close() {
    this.readyState = 3
    this.onclose?.()
  }

  simulateOpen() {
    this.readyState = 1
    this.onopen?.()
  }

  simulateMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) })
  }
}

describe('useWebSocket', () => {
  beforeEach(() => {
    MockWebSocket.instances = []
    vi.stubGlobal('WebSocket', MockWebSocket)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('connects with token in query param', async () => {
    const opts: WSOptions = {
      baseUrl: 'http://localhost:8080',
      getToken: () => 'my-jwt',
      onEvent: vi.fn(),
    }
    const ws = useWebSocket(opts)
    await ws.connect()

    expect(MockWebSocket.instances).toHaveLength(1)
    expect(MockWebSocket.instances[0]!.url).toBe('ws://localhost:8080/ws?token=my-jwt')
  })

  it('subscribes to channels after open', async () => {
    const opts: WSOptions = {
      baseUrl: 'http://localhost:8080',
      getToken: () => 'jwt',
      onEvent: vi.fn(),
    }
    const ws = useWebSocket(opts)
    await ws.connect()
    ws.subscribe(['trip:t1', 'user:u1'])

    const mock = MockWebSocket.instances[0]!
    mock.simulateOpen()

    expect(mock.sent).toHaveLength(1)
    expect(JSON.parse(mock.sent[0]!)).toEqual({ subscribe: ['trip:t1', 'user:u1'] })
  })

  it('dispatches events to handler', async () => {
    const handler = vi.fn()
    const opts: WSOptions = {
      baseUrl: 'http://localhost:8080',
      getToken: () => 'jwt',
      onEvent: handler,
    }
    const ws = useWebSocket(opts)
    await ws.connect()

    const mock = MockWebSocket.instances[0]!
    mock.simulateOpen()

    const event: WSEvent = { type: 'trip.changed', payload: { trip_id: 't1', seq: 42 } }
    mock.simulateMessage(event)

    expect(handler).toHaveBeenCalledWith(event)
  })

  it('converts http to ws protocol', async () => {
    const ws = useWebSocket({
      baseUrl: 'https://example.com',
      getToken: () => 'jwt',
      onEvent: vi.fn(),
    })
    await ws.connect()
    expect(MockWebSocket.instances[0]!.url).toBe('wss://example.com/ws?token=jwt')
  })

  it('queues subscriptions before connection opens', async () => {
    const opts: WSOptions = {
      baseUrl: 'http://localhost:8080',
      getToken: () => 'jwt',
      onEvent: vi.fn(),
    }
    const ws = useWebSocket(opts)
    await ws.connect()
    ws.subscribe(['trip:t1'])

    const mock = MockWebSocket.instances[0]!
    expect(mock.sent).toHaveLength(0) // not sent yet

    mock.simulateOpen()
    expect(mock.sent).toHaveLength(1) // sent on open
  })

  /**
   * The token provider legitimately yields null — a Single-User instance
   * is offered no OIDC, and a `server`-mode client can be logged out.
   * Interpolating that sent `?token=null`, and `wsAuth` only tests for a
   * non-empty value, so the literal string became `Bearer null` and a
   * multi-user instance answered "invalid token" where the truth was
   * "no token". (Verified by hand 2026-08-14: single-user bypasses
   * `authed` entirely and upgrades either way, so nothing was *broken* —
   * what was wrong is the diagnosis the server hands back.)
   */
  it('omits the token entirely when there is none, rather than sending "null"', async () => {
    const ws = useWebSocket({
      baseUrl: 'http://localhost:8080',
      getToken: () => null,
      onEvent: vi.fn(),
    })
    await ws.connect()

    expect(MockWebSocket.instances[0]!.url).toBe('ws://localhost:8080/ws')
  })

  it('encodes a token that is not URL-safe', async () => {
    const ws = useWebSocket({
      baseUrl: 'http://localhost:8080',
      getToken: () => 'a+b/c=',
      onEvent: vi.fn(),
    })
    await ws.connect()

    expect(MockWebSocket.instances[0]!.url).toBe('ws://localhost:8080/ws?token=a%2Bb%2Fc%3D')
  })

  it('disconnect closes the socket', async () => {
    const opts: WSOptions = {
      baseUrl: 'http://localhost:8080',
      getToken: () => 'jwt',
      onEvent: vi.fn(),
    }
    const ws = useWebSocket(opts)
    await ws.connect()

    const mock = MockWebSocket.instances[0]!
    mock.simulateOpen()
    ws.disconnect()

    expect(mock.readyState).toBe(3)
  })

  /**
   * G-10's in_sync (Sync-API §7). The cursor is reported the moment the
   * first drain returns, and on a cold load an HTTP pull regularly beats the
   * WebSocket handshake — a report dropped there is never repeated, so the
   * server goes on believing the device is behind.
   */
  describe('the pull cursor survives a socket that is still opening', () => {
    function opts(): WSOptions {
      return { baseUrl: 'http://localhost:8080', getToken: () => 't', onEvent: vi.fn() }
    }

    it('flushes a cursor reported before the socket opened', async () => {
      const ws = useWebSocket(opts())
      await ws.connect()
      const socket = MockWebSocket.instances[0]!

      ws.sendCursor('trip-1', 7)
      expect(socket.sent).toEqual([])

      socket.simulateOpen()
      expect(socket.sent).toContain(JSON.stringify({ cursor: { trip_id: 'trip-1', seq: 7 } }))
    })

    it('flushes the newest seq per trip, not the last caller', async () => {
      const ws = useWebSocket(opts())
      await ws.connect()
      const socket = MockWebSocket.instances[0]!

      ws.sendCursor('trip-1', 9)
      ws.sendCursor('trip-1', 4)
      ws.sendCursor('trip-2', 2)
      socket.simulateOpen()

      expect(socket.sent).toEqual([
        JSON.stringify({ cursor: { trip_id: 'trip-1', seq: 9 } }),
        JSON.stringify({ cursor: { trip_id: 'trip-2', seq: 2 } }),
      ])
    })

    it('sends straight through once the socket is open, and holds nothing back', async () => {
      const ws = useWebSocket(opts())
      await ws.connect()
      const socket = MockWebSocket.instances[0]!
      socket.simulateOpen()

      ws.sendCursor('trip-1', 3)
      expect(socket.sent).toEqual([JSON.stringify({ cursor: { trip_id: 'trip-1', seq: 3 } })])

      // A second open must not replay what was already delivered.
      socket.simulateOpen()
      expect(socket.sent).toHaveLength(1)
    })
  })
})
