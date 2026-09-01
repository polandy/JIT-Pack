/**
 * WebSocket composable — thin event pings, not data carriers (P-1, Sync-API §7).
 *
 * The socket is a *subscription*, not a session: it is expected to die — the
 * server restarts under it (the nightly backup does exactly that), a phone
 * changes networks, a mobile browser freezes the tab and the OS reaps the
 * connection — and Sync-API P-1 names reconnect as one of the four things
 * the read path serves. So the composable owns three things beyond dialling:
 *
 *  1. **What it wants to be subscribed to**, declaratively, so every new
 *     socket is told the whole set rather than whatever was queued once.
 *  2. **A redial with backoff** whenever the socket closes without being
 *     asked to, and an immediate one when the app comes back into view.
 *  3. **The §9 keepalive**: an app-level ping on an interval and a watchdog
 *     that treats an unanswered one as a dead socket. A browser cannot send
 *     protocol pings, and a half-open TCP connection fires no event at all,
 *     which is why a quiet socket and a dead one are indistinguishable
 *     without it.
 *
 * What it does *not* do is catch up on what was missed: the hub replays
 * nothing, so the owner is told about every open (`onOpen`) and pulls the
 * gap over through the ordinary read path — P-1 again.
 */

import type { TokenProvider } from '@/api/client'
import { API } from '@/api/routes'
import type { WSEvent } from '@/api/types'

/** How often the client pings an open socket (Sync-API §9). */
export const WS_PING_INTERVAL_MS = 30_000
/** How long a ping may go unanswered — by *any* frame — before the socket is declared dead. */
export const WS_PONG_TIMEOUT_MS = 10_000
/** How long a dial may sit in CONNECTING before it is abandoned and retried. */
export const WS_CONNECT_TIMEOUT_MS = 10_000
/** First redial delay; doubles per failed attempt up to the cap. */
export const WS_RECONNECT_BASE_MS = 1_000
/** Redial delay cap. Deliberately no jitter: an instance has a handful of devices, not a fleet. */
export const WS_RECONNECT_MAX_MS = 30_000

const READY_STATE_OPEN = 1

export interface WSOptions {
  baseUrl: string
  getToken: TokenProvider
  onEvent: (event: WSEvent) => void
  /**
   * Fired on every successful open. `reconnect` is false for the first one
   * of this composable's life — the caller's boot pull covers that — and
   * true afterwards, when whatever happened in the gap has to be pulled.
   */
  onOpen?: (info: { reconnect: boolean }) => void
  /** Whether live updates are currently flowing — the G-2 sheet's line. */
  onLive?: (live: boolean) => void
}

function httpToWs(url: string): string {
  return url.replace(/^http/, 'ws')
}

export function useWebSocket(opts: WSOptions) {
  let socket: WebSocket | null = null
  /** Set by connect(), cleared by disconnect(): whether a socket should exist at all. */
  let wanted = false
  let everOpened = false
  /** Failed dials in a row; the backoff exponent. */
  let attempt = 0

  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let connectTimer: ReturnType<typeof setTimeout> | null = null
  let pingTimer: ReturnType<typeof setInterval> | null = null
  let pongTimer: ReturnType<typeof setTimeout> | null = null

  /** Every channel the owner asked for — re-sent whole on each open. */
  const channels = new Set<string>()
  /**
   * The latest cursor per trip, kept for the socket's whole life rather than
   * until first delivery: a new socket is a new connection to the hub, which
   * knows nothing of what the last one reported (§7 in_sync).
   */
  const cursors = new Map<string, number>()

  function clearTimer(timer: ReturnType<typeof setTimeout> | null) {
    if (timer !== null) clearTimeout(timer)
  }

  function stopKeepalive() {
    if (pingTimer !== null) clearInterval(pingTimer)
    pingTimer = null
    clearTimer(pongTimer)
    pongTimer = null
  }

  // Async because the token provider may refresh first (?token= dial, §7).
  async function dial(): Promise<void> {
    clearTimer(reconnectTimer)
    reconnectTimer = null
    let token: string | null
    try {
      token = await opts.getToken()
    } catch {
      // A refresh that blew up is a network moment, not a reason to stop.
      scheduleRedial()
      return
    }
    if (!wanted || socket) return

    // No token means no token — not the string "null". `wsAuth` promotes
    // any non-empty ?token= to an Authorization header, so an absent one
    // interpolated into the URL arrived as `Bearer null` and came back
    // "invalid token" where the truth was "no token": a wrong answer to
    // the first question anyone debugging a dead socket asks.
    const query = token ? `?token=${encodeURIComponent(token)}` : ''
    const s = new WebSocket(`${httpToWs(opts.baseUrl)}${API.ws}${query}`)
    socket = s
    let opened = false

    connectTimer = setTimeout(() => {
      if (socket === s && !opened) drop(s, opened)
    }, WS_CONNECT_TIMEOUT_MS)

    s.onopen = () => {
      // A browser fires this once per socket; guarded so a replayed open
      // cannot re-send what this socket was already told.
      if (opened || socket !== s) return
      opened = true
      clearTimer(connectTimer)
      connectTimer = null
      const reconnect = everOpened
      everOpened = true
      attempt = 0

      // Subscriptions first: the server records a cursor against the
      // connection, but only a subscribed connection is in the presence
      // list the cursor is there to inform.
      if (channels.size > 0) sendSubscribe([...channels])
      for (const [tripId, seq] of cursors) {
        sendCursorFrame(tripId, seq)
      }
      startKeepalive(s)
      opts.onLive?.(true)
      opts.onOpen?.({ reconnect })
    }

    s.onmessage = (ev) => {
      // Any frame proves the peer is alive, so the watchdog stands down
      // whatever the frame was.
      clearTimer(pongTimer)
      pongTimer = null
      const event = JSON.parse(ev.data as string) as WSEvent
      if (event.type === 'pong') return
      opts.onEvent(event)
    }

    s.onclose = () => {
      if (socket !== s) return
      closed(s, opened)
    }
    // The close that follows an error carries the state change; nothing to do here.
    s.onerror = () => {}
  }

  /** The socket is gone, whether the peer closed it or we gave up on it. */
  function closed(s: WebSocket, wasOpen: boolean) {
    if (socket === s) socket = null
    stopKeepalive()
    clearTimer(connectTimer)
    connectTimer = null
    if (wasOpen) opts.onLive?.(false)
    if (wanted) scheduleRedial()
  }

  /**
   * Give up on a socket ourselves. Its own close event is detached first: a
   * dead TCP connection may take the browser a long time to close, and the
   * decision that it is dead has already been made.
   */
  function drop(s: WebSocket, wasOpen: boolean) {
    s.onclose = null
    s.onmessage = null
    s.close()
    closed(s, wasOpen)
  }

  function scheduleRedial() {
    if (!wanted || reconnectTimer !== null) return
    const delay = Math.min(WS_RECONNECT_BASE_MS * 2 ** attempt, WS_RECONNECT_MAX_MS)
    attempt += 1
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      void dial()
    }, delay)
  }

  function startKeepalive(s: WebSocket) {
    stopKeepalive()
    pingTimer = setInterval(() => {
      if (socket !== s) return
      ping(s)
    }, WS_PING_INTERVAL_MS)
  }

  /** Send a ping and expect *something* back within the window. */
  function ping(s: WebSocket) {
    s.send(JSON.stringify({ ping: true }))
    // An earlier, still-armed watchdog keeps its deadline: a second ping is
    // not a second chance.
    if (pongTimer !== null) return
    pongTimer = setTimeout(() => {
      pongTimer = null
      if (socket === s) drop(s, true)
    }, WS_PONG_TIMEOUT_MS)
  }

  function isOpen(): boolean {
    return socket !== null && socket.readyState === READY_STATE_OPEN
  }

  async function connect(): Promise<void> {
    wanted = true
    await dial()
  }

  /**
   * The app came back — the tab is visible again, the browser reports being
   * online, the page was restored from the back-forward cache. A frozen tab's
   * timers did not run, so whatever backoff was pending is thrown away and
   * the dial happens now; an open socket is probed instead, because a frozen
   * tab's socket is the one most likely to be dead without having said so.
   */
  function ensureConnected() {
    if (!wanted) return
    if (socket) {
      if (isOpen()) ping(socket)
      return
    }
    attempt = 0
    clearTimer(reconnectTimer)
    reconnectTimer = null
    void dial()
  }

  function sendSubscribe(list: string[]) {
    socket?.send(JSON.stringify({ subscribe: list }))
  }

  function subscribe(list: string[]) {
    const fresh = list.filter((c) => !channels.has(c))
    for (const c of list) channels.add(c)
    if (fresh.length > 0 && isOpen()) sendSubscribe(fresh)
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
    if (seq <= (cursors.get(tripId) ?? -1)) return
    cursors.set(tripId, seq)
    if (isOpen()) sendCursorFrame(tripId, seq)
  }

  function disconnect() {
    wanted = false
    clearTimer(reconnectTimer)
    reconnectTimer = null
    stopKeepalive()
    clearTimer(connectTimer)
    connectTimer = null
    const s = socket
    socket = null
    if (s) {
      s.onclose = null
      s.close()
    }
  }

  return { connect, ensureConnected, subscribe, sendCursor, disconnect }
}
