/** WebSocket composable — thin event pings, not data carriers (P-1, Sync-API §7). */

import type { TokenProvider } from '@/api/client'
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

  // Async because the token provider may refresh first (?token= dial, §7).
  async function connect() {
    const token = await opts.getToken()
    // No token means no token — not the string "null". `wsAuth` promotes
    // any non-empty ?token= to an Authorization header, so an absent one
    // interpolated into the URL arrived as `Bearer null` and came back
    // "invalid token" where the truth was "no token": a wrong answer to
    // the first question anyone debugging a dead socket asks.
    const query = token ? `?token=${encodeURIComponent(token)}` : ''
    socket = new WebSocket(`${httpToWs(opts.baseUrl)}/ws${query}`)

    socket.onopen = () => {
      if (pendingChannels.length > 0) {
        sendSubscribe(pendingChannels)
        pendingChannels = []
      }
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

  /** Report the pull cursor so the server can compute in_sync (§7). */
  function sendCursor(tripId: string, seq: number) {
    if (socket && socket.readyState === 1) {
      socket.send(JSON.stringify({ cursor: { trip_id: tripId, seq } }))
    }
  }

  function disconnect() {
    socket?.close()
    socket = null
  }

  return { connect, subscribe, sendCursor, disconnect }
}
