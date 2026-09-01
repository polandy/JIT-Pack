import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  useWebSocket,
  WS_CONNECT_TIMEOUT_MS,
  WS_PING_INTERVAL_MS,
  WS_PONG_TIMEOUT_MS,
  WS_RECONNECT_BASE_MS,
  WS_RECONNECT_MAX_MS,
  type WSOptions,
} from '../useWebSocket'
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

  /** The peer went away: a close the client did not ask for. */
  simulateDrop() {
    this.readyState = 3
    this.onclose?.()
  }
}

function opts(over: Partial<WSOptions> = {}): WSOptions {
  return {
    baseUrl: 'http://localhost:8080',
    getToken: () => 'jwt',
    onEvent: vi.fn(),
    ...over,
  }
}

const latest = () => MockWebSocket.instances.at(-1)!

describe('useWebSocket', () => {
  beforeEach(() => {
    MockWebSocket.instances = []
    vi.stubGlobal('WebSocket', MockWebSocket)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('connects with token in query param', async () => {
    const ws = useWebSocket(opts({ getToken: () => 'my-jwt' }))
    await ws.connect()

    expect(MockWebSocket.instances).toHaveLength(1)
    expect(MockWebSocket.instances[0]!.url).toBe('ws://localhost:8080/ws?token=my-jwt')
  })

  it('subscribes to channels after open', async () => {
    const ws = useWebSocket(opts())
    await ws.connect()
    ws.subscribe(['trip:t1', 'user:u1'])

    const mock = MockWebSocket.instances[0]!
    mock.simulateOpen()

    expect(mock.sent).toHaveLength(1)
    expect(JSON.parse(mock.sent[0]!)).toEqual({ subscribe: ['trip:t1', 'user:u1'] })
  })

  it('dispatches events to handler', async () => {
    const handler = vi.fn()
    const ws = useWebSocket(opts({ onEvent: handler }))
    await ws.connect()

    const mock = MockWebSocket.instances[0]!
    mock.simulateOpen()

    const event: WSEvent = { type: 'trip.changed', payload: { trip_id: 't1', seq: 42 } }
    mock.simulateMessage(event)

    expect(handler).toHaveBeenCalledWith(event)
  })

  it('converts http to ws protocol', async () => {
    const ws = useWebSocket(opts({ baseUrl: 'https://example.com' }))
    await ws.connect()
    expect(MockWebSocket.instances[0]!.url).toBe('wss://example.com/ws?token=jwt')
  })

  it('queues subscriptions before connection opens', async () => {
    const ws = useWebSocket(opts())
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
    const ws = useWebSocket(opts({ getToken: () => null }))
    await ws.connect()

    expect(MockWebSocket.instances[0]!.url).toBe('ws://localhost:8080/ws')
  })

  it('encodes a token that is not URL-safe', async () => {
    const ws = useWebSocket(opts({ getToken: () => 'a+b/c=' }))
    await ws.connect()

    expect(MockWebSocket.instances[0]!.url).toBe('ws://localhost:8080/ws?token=a%2Bb%2Fc%3D')
  })

  it('disconnect closes the socket', async () => {
    const ws = useWebSocket(opts())
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

  /**
   * Sync-API P-1 names reconnect as one of the four things the read path
   * serves, and the client never had one: `onclose` nulled the socket and
   * that was the whole handling. A device whose socket died — the server
   * restarted under it, the phone changed networks — stayed deaf to every
   * other device's change until it wrote something itself or reloaded.
   * Found 2026-09-01 on the family instance: a member's packs never reached
   * the owner's open tab, while the owner's reached the member's.
   */
  describe('a socket that drops is dialled again (Sync-API P-1)', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    it('redials after the base delay, and reports the gap while it lasts', async () => {
      const onLive = vi.fn()
      const ws = useWebSocket(opts({ onLive }))
      await ws.connect()
      latest().simulateOpen()
      expect(onLive).toHaveBeenLastCalledWith(true)

      latest().simulateDrop()
      expect(onLive).toHaveBeenLastCalledWith(false)
      expect(MockWebSocket.instances).toHaveLength(1)

      await vi.advanceTimersByTimeAsync(WS_RECONNECT_BASE_MS)
      expect(MockWebSocket.instances).toHaveLength(2)
      latest().simulateOpen()
      expect(onLive).toHaveBeenLastCalledWith(true)
    })

    it('backs off exponentially up to the cap, and starts over once a dial succeeds', async () => {
      const ws = useWebSocket(opts())
      await ws.connect()
      latest().simulateOpen()

      let expected = WS_RECONNECT_BASE_MS
      for (let attempt = 0; attempt < 8; attempt++) {
        const before = MockWebSocket.instances.length
        latest().simulateDrop()
        await vi.advanceTimersByTimeAsync(expected - 1)
        expect(MockWebSocket.instances).toHaveLength(before)
        await vi.advanceTimersByTimeAsync(1)
        expect(MockWebSocket.instances).toHaveLength(before + 1)
        expected = Math.min(expected * 2, WS_RECONNECT_MAX_MS)
      }
      expect(expected).toBe(WS_RECONNECT_MAX_MS)

      // An open resets the ladder: the next drop waits the base delay again.
      latest().simulateOpen()
      const before = MockWebSocket.instances.length
      latest().simulateDrop()
      await vi.advanceTimersByTimeAsync(WS_RECONNECT_BASE_MS)
      expect(MockWebSocket.instances).toHaveLength(before + 1)
    })

    it('re-sends every subscription and the latest cursor on the new socket', async () => {
      const ws = useWebSocket(opts())
      await ws.connect()
      ws.subscribe(['trip:t1'])
      latest().simulateOpen()
      ws.subscribe(['trip:t2'])
      ws.sendCursor('t1', 5)
      ws.sendCursor('t1', 8)

      latest().simulateDrop()
      await vi.advanceTimersByTimeAsync(WS_RECONNECT_BASE_MS)
      const second = latest()
      second.simulateOpen()

      expect(second.sent).toEqual([
        JSON.stringify({ subscribe: ['trip:t1', 'trip:t2'] }),
        JSON.stringify({ cursor: { trip_id: 't1', seq: 8 } }),
      ])
    })

    it('tells the owner about every open, so the gap can be pulled over', async () => {
      const onOpen = vi.fn()
      const ws = useWebSocket(opts({ onOpen }))
      await ws.connect()
      latest().simulateOpen()
      expect(onOpen).toHaveBeenCalledTimes(1)
      expect(onOpen).toHaveBeenLastCalledWith({ reconnect: false })

      latest().simulateDrop()
      await vi.advanceTimersByTimeAsync(WS_RECONNECT_BASE_MS)
      latest().simulateOpen()
      expect(onOpen).toHaveBeenCalledTimes(2)
      expect(onOpen).toHaveBeenLastCalledWith({ reconnect: true })
    })

    it('does not redial after disconnect()', async () => {
      const ws = useWebSocket(opts())
      await ws.connect()
      latest().simulateOpen()
      ws.disconnect()

      await vi.advanceTimersByTimeAsync(WS_RECONNECT_MAX_MS * 2)
      expect(MockWebSocket.instances).toHaveLength(1)
    })

    it('gives up on a dial that never completes the handshake', async () => {
      const ws = useWebSocket(opts())
      await ws.connect()
      // Never opens — a proxy that accepted TCP and then went quiet.
      await vi.advanceTimersByTimeAsync(WS_CONNECT_TIMEOUT_MS)
      expect(latest().readyState).toBe(3)
      await vi.advanceTimersByTimeAsync(WS_RECONNECT_BASE_MS)
      expect(MockWebSocket.instances).toHaveLength(2)
    })

    it('a dial whose token provider throws is retried, not abandoned', async () => {
      let calls = 0
      const ws = useWebSocket(
        opts({
          getToken: () => {
            calls++
            if (calls === 1) throw new Error('refresh exploded')
            return 'jwt'
          },
        }),
      )
      await ws.connect()
      expect(MockWebSocket.instances).toHaveLength(0)
      await vi.advanceTimersByTimeAsync(WS_RECONNECT_BASE_MS)
      expect(MockWebSocket.instances).toHaveLength(1)
    })
  })

  /**
   * Sync-API §9: "WebSocket idle timeout 5 min with client ping". A socket
   * whose peer vanished without a close — a phone that changed networks —
   * fires no event at all, so without a ping the client cannot tell a
   * quiet server from a dead connection, and the server cannot reap it.
   */
  describe('keepalive (Sync-API §9)', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    it('pings on the interval, and a pong keeps the socket', async () => {
      const onEvent = vi.fn()
      const ws = useWebSocket(opts({ onEvent }))
      await ws.connect()
      const socket = latest()
      socket.simulateOpen()

      await vi.advanceTimersByTimeAsync(WS_PING_INTERVAL_MS)
      expect(socket.sent).toContain(JSON.stringify({ ping: true }))
      socket.simulateMessage({ type: 'pong' })
      // The pong is the watchdog's, not the app's.
      expect(onEvent).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(WS_PONG_TIMEOUT_MS)
      expect(socket.readyState).toBe(1)
      expect(MockWebSocket.instances).toHaveLength(1)
    })

    it('drops a socket that answers nothing within the pong window, and redials', async () => {
      const onLive = vi.fn()
      const ws = useWebSocket(opts({ onLive }))
      await ws.connect()
      const socket = latest()
      socket.simulateOpen()

      await vi.advanceTimersByTimeAsync(WS_PING_INTERVAL_MS + WS_PONG_TIMEOUT_MS)
      expect(socket.readyState).toBe(3)
      expect(onLive).toHaveBeenLastCalledWith(false)

      await vi.advanceTimersByTimeAsync(WS_RECONNECT_BASE_MS)
      expect(MockWebSocket.instances).toHaveLength(2)
    })

    it('any frame counts as life, not only a pong', async () => {
      const ws = useWebSocket(opts())
      await ws.connect()
      const socket = latest()
      socket.simulateOpen()

      await vi.advanceTimersByTimeAsync(WS_PING_INTERVAL_MS)
      socket.simulateMessage({ type: 'presence', payload: { trip_id: 't1', users: [] } })
      await vi.advanceTimersByTimeAsync(WS_PONG_TIMEOUT_MS)
      expect(socket.readyState).toBe(1)
    })
  })

  /**
   * A mobile browser freezes a background tab — its timers stop, so the
   * backoff never fires and the ping never goes out — and the OS drops the
   * socket while it is frozen. Coming back must not wait out a backoff that
   * was scheduled before the freeze.
   */
  describe('ensureConnected() — the app coming back into view', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    it('redials at once while a backoff is pending', async () => {
      const ws = useWebSocket(opts())
      await ws.connect()
      latest().simulateOpen()
      // Climb the ladder so the pending delay is a long one.
      for (let i = 0; i < 5; i++) {
        latest().simulateDrop()
        await vi.advanceTimersByTimeAsync(WS_RECONNECT_MAX_MS)
      }
      latest().simulateDrop()
      const before = MockWebSocket.instances.length

      ws.ensureConnected()
      await vi.advanceTimersByTimeAsync(0)
      expect(MockWebSocket.instances).toHaveLength(before + 1)
    })

    it('probes an open socket with a ping rather than replacing it', async () => {
      const ws = useWebSocket(opts())
      await ws.connect()
      const socket = latest()
      socket.simulateOpen()

      ws.ensureConnected()
      await vi.advanceTimersByTimeAsync(0)
      expect(MockWebSocket.instances).toHaveLength(1)
      expect(socket.sent).toContain(JSON.stringify({ ping: true }))

      // …and a probe nobody answers is a dead socket.
      await vi.advanceTimersByTimeAsync(WS_PONG_TIMEOUT_MS)
      expect(socket.readyState).toBe(3)
    })

    it('does nothing before connect() or after disconnect()', async () => {
      const ws = useWebSocket(opts())
      ws.ensureConnected()
      await vi.advanceTimersByTimeAsync(0)
      expect(MockWebSocket.instances).toHaveLength(0)

      await ws.connect()
      latest().simulateOpen()
      ws.disconnect()
      ws.ensureConnected()
      await vi.advanceTimersByTimeAsync(0)
      expect(MockWebSocket.instances).toHaveLength(1)
    })
  })
})
