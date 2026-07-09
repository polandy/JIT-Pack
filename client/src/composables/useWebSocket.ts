/** WebSocket composable — thin event pings, not data carriers (P-1, Sync-API §7). */

import type { WSEvent } from '@/api/types'

export interface WSOptions {
  baseUrl: string
  getToken: () => string | null
  onEvent: (event: WSEvent) => void
}

function httpToWs(url: string): string {
  return url.replace(/^http/, 'ws')
}

export function useWebSocket(opts: WSOptions) {
  let socket: WebSocket | null = null
  let pendingChannels: string[] = []

  function connect() {
    const token = opts.getToken()
    const wsUrl = `${httpToWs(opts.baseUrl)}/ws?token=${token}`
    socket = new WebSocket(wsUrl)

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
