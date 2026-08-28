/** WebSocket composable — thin event pings, not data carriers (P-1, Sync-API §7). */

import type { TokenProvider } from '@/api/client'
import { API } from '@/api/routes'
import type { WSEvent } from '@/api/types'

export interface WSOptions {
  baseUrl: string
  getToken: TokenProvider
  onEvent: (event: WSEvent) => void
}

function httpToWs(url: string): string {
  return url.replace(/^http/, 'ws')
}

export function useWebSocket(opts: WSOptions) {
  let socket: WebSocket | null = null
  let pendingChannels: string[] = []
  // Held per trip, latest seq wins — see sendCursor.
  const pendingCursors = new Map<string, number>()

  // Async because the token provider may refresh first (?token= dial, §7).
  async function connect() {
    const token = await opts.getToken()
    // No token means no token — not the string "null". `wsAuth` promotes
    // any non-empty ?token= to an Authorization header, so an absent one
    // interpolated into the URL arrived as `Bearer null` and came back
    // "invalid token" where the truth was "no token": a wrong answer to
    // the first question anyone debugging a dead socket asks.
    const query = token ? `?token=${encodeURIComponent(token)}` : ''
    socket = new WebSocket(`${httpToWs(opts.baseUrl)}${API.ws}${query}`)

    socket.onopen = () => {
      if (pendingChannels.length > 0) {
        sendSubscribe(pendingChannels)
        pendingChannels = []
      }
      // Subscriptions first: the server records a cursor against the
      // connection, but only a subscribed connection is in the presence
      // list the cursor is there to inform.
      for (const [tripId, seq] of pendingCursors) {
        sendCursorFrame(tripId, seq)
      }
      pendingCursors.clear()
    }

    socket.onmessage = (ev) => {
      const event = JSON.parse(ev.data as string) as WSEvent
      opts.onEvent(event)
    }

    socket.onclose = () => {
      socket = null
    }
  }

  function sendSubscribe(channels: string[]) {
    socket?.send(JSON.stringify({ subscribe: channels }))
  }

  function subscribe(channels: string[]) {
    if (socket && socket.readyState === 1) {
      sendSubscribe(channels)
    } else {
      pendingChannels.push(...channels)
    }
  }

  function sendCursorFrame(tripId: string, seq: number) {
    socket?.send(JSON.stringify({ cursor: { trip_id: tripId, seq } }))
  }

  /**
   * Report the pull cursor so the server can compute in_sync (§7).
   *
   * Held until the socket opens, the way a subscription is. A cold page
   * load reports its cursor the moment the first drain returns, and an HTTP
   * pull regularly beats the WebSocket handshake — so dropping the report
   * meant the server never learned the device had caught up and G-10's
   * "everyone has the latest state" badge could not appear at all. Found by
   * E2E-G10-01, the first test ever to render the facepile.
   *
   * The newest seq wins rather than the last caller: two drains racing to
   * open must not leave the server told the older of the two.
   */
  function sendCursor(tripId: string, seq: number) {
    if (socket && socket.readyState === 1) {
      sendCursorFrame(tripId, seq)
      return
    }
    if (seq > (pendingCursors.get(tripId) ?? -1)) {
      pendingCursors.set(tripId, seq)
    }
  }

  function disconnect() {
    socket?.close()
    socket = null
  }

  return { connect, subscribe, sendCursor, disconnect }
}
