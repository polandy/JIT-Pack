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

  it('connects with token in query param', () => {
    const opts: WSOptions = {
      baseUrl: 'http://localhost:8080',
      getToken: () => 'my-jwt',
      onEvent: vi.fn(),
    }
    const ws = useWebSocket(opts)
    ws.connect()

    expect(MockWebSocket.instances).toHaveLength(1)
    expect(MockWebSocket.instances[0]!.url).toBe('ws://localhost:8080/ws?token=my-jwt')
  })

  it('subscribes to channels after open', () => {
    const opts: WSOptions = {
      baseUrl: 'http://localhost:8080',
      getToken: () => 'jwt',
      onEvent: vi.fn(),
    }
    const ws = useWebSocket(opts)
    ws.connect()
    ws.subscribe(['trip:t1', 'user:u1'])

    const mock = MockWebSocket.instances[0]!
    mock.simulateOpen()

    expect(mock.sent).toHaveLength(1)
    expect(JSON.parse(mock.sent[0]!)).toEqual({ subscribe: ['trip:t1', 'user:u1'] })
  })

  it('dispatches events to handler', () => {
    const handler = vi.fn()
    const opts: WSOptions = {
      baseUrl: 'http://localhost:8080',
      getToken: () => 'jwt',
      onEvent: handler,
    }
    const ws = useWebSocket(opts)
    ws.connect()

    const mock = MockWebSocket.instances[0]!
    mock.simulateOpen()

    const event: WSEvent = { type: 'trip.changed', payload: { trip_id: 't1', seq: 42 } }
    mock.simulateMessage(event)

    expect(handler).toHaveBeenCalledWith(event)
  })

  it('converts http to ws protocol', () => {
    const ws = useWebSocket({
      baseUrl: 'https://example.com',
      getToken: () => 'jwt',
      onEvent: vi.fn(),
    })
    ws.connect()
    expect(MockWebSocket.instances[0]!.url).toBe('wss://example.com/ws?token=jwt')
  })

  it('queues subscriptions before connection opens', () => {
    const opts: WSOptions = {
      baseUrl: 'http://localhost:8080',
      getToken: () => 'jwt',
      onEvent: vi.fn(),
    }
    const ws = useWebSocket(opts)
    ws.connect()
    ws.subscribe(['trip:t1'])

    const mock = MockWebSocket.instances[0]!
    expect(mock.sent).toHaveLength(0) // not sent yet

    mock.simulateOpen()
    expect(mock.sent).toHaveLength(1) // sent on open
  })

  it('disconnect closes the socket', () => {
    const opts: WSOptions = {
      baseUrl: 'http://localhost:8080',
      getToken: () => 'jwt',
      onEvent: vi.fn(),
    }
    const ws = useWebSocket(opts)
    ws.connect()

    const mock = MockWebSocket.instances[0]!
    mock.simulateOpen()
    ws.disconnect()

    expect(mock.readyState).toBe(3)
  })
})
