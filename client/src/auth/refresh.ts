/**
 * OIDC access-token lifecycle (Sync-API §2). The server brokers the
 * refresh grant to the IdP (`POST /api/v1/auth/refresh`); this module
 * decides *when* to use it: proactively shortly before expiry, and
 * reactively when a request came back 401 despite a fresh-looking token.
 *
 * Offline stretches are normal in this app, so a refresh that fails for
 * network reasons keeps the current token — the sync layer already tolerates
 * failing requests — but only while that token is still inside its own
 * expiry, and never without arming the backoff below. Only an explicit IdP
 * rejection ends the session: tokens are cleared and AUTH_EXPIRED_EVENT tells
 * the app to return to the login page.
 */

import { API } from '@/api/routes'
import type { SessionTokens } from '@/api/types'
import { defaultNowMs, type NowMs } from '@/lib/clock'

import { clearTokens, loadTokens, saveTokens } from './tokens'

/** Refresh this long before expiry so in-flight requests don't race the deadline. */
const EXPIRY_SKEW_MS = 30_000

/**
 * How long to wait after a refresh that could not be completed, by
 * consecutive failure; the last entry is the ceiling.
 *
 * The interval is the point: this endpoint replays a grant at the *IdP*,
 * whose rate limit is shared with the authorization-code exchange behind the
 * login screen, so a client that retries per request takes everybody's login
 * down with its own session (the log's 2026-09-13 entry). The values are what
 * a person waits at worst for a recovered IdP to be noticed again; a pull, a
 * push or a resume meanwhile costs no request, because the token is refused
 * here rather than at the server.
 */
const REFRESH_BACKOFF_MS = [5_000, 30_000, 120_000, 600_000] as const

/** Dispatched on window when the session is over and cannot be renewed. */
export const AUTH_EXPIRED_EVENT = 'jitpack:auth-expired'

/**
 * Whether `endSession` has run in this page's lifetime.
 *
 * A DOM event reaches only the listeners that exist when it is dispatched,
 * and the first request a deactivated account's app makes is M1's `me`, sent
 * from a child's `onMounted` — it answered before App.vue had finished the
 * awaits ahead of its listener, the event was lost, and the dashboard stood
 * there saying *offline* (E2E-M20-02, 2026-09-02). The latch lets a handler
 * attached afterwards still learn that the session is over. It is never
 * reset on purpose: a new session is only ever entered through a full reload
 * (CallbackPage), which starts a fresh module.
 */
let sessionEnded = false

/**
 * End the session for good: drop the tokens and tell the app to go back to
 * the login page.
 *
 * Two callers, one meaning. The IdP rejecting the refresh token is the
 * expected one; the other is an account deactivated while it was logged in
 * (FR-23.3), whose tokens stay valid-looking in localStorage — without this
 * every request 403s and the app is indistinguishable from an offline one.
 */
export function endSession(): void {
  clearTokens()
  sessionEnded = true
  window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT))
}

/**
 * Run `handler` when the session ends — including when it already has, so
 * an end that fired before anybody was listening is not lost. Returns the
 * disposer.
 */
export function onSessionEnded(handler: () => void): () => void {
  window.addEventListener(AUTH_EXPIRED_EVENT, handler)
  if (sessionEnded) handler()
  return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handler)
}

export interface AuthRefresher {
  /** Token for the next request, refreshed first if it expires within the skew. */
  freshToken(): Promise<string | null>
  /** Unconditional refresh — the 401-retry path. Concurrent calls share one request. */
  refresh(): Promise<string | null>
}

/**
 * `now` is the clock the backoff is measured on. Injected for the reason the
 * sync layer injects its own: a test of an interval must be able to state
 * where it is in that interval, rather than wait to find out.
 */
export function createAuthRefresher(baseUrl: string, now: NowMs = defaultNowMs): AuthRefresher {
  const base = baseUrl.replace(/\/+$/, '')
  let inflight: Promise<string | null> | null = null
  /** Consecutive refreshes that could not be completed; 0 once one lands. */
  let failures = 0
  /** Nothing is sent to the IdP before this instant (see REFRESH_BACKOFF_MS). */
  let nextAttemptAt = 0

  /** The stored token while it is still worth sending, and null once it is not. */
  function usableToken(): string | null {
    const tokens = loadTokens()
    if (!tokens) return null
    // Past its expiry the token is not a degraded answer but a wrong one: the
    // server refuses it, and answering with it is what turned an outage into
    // a request loop. The skew is deliberately *not* applied here — a token
    // inside the skew window is still accepted, and holding it back during an
    // outage would end a session the IdP has said nothing about.
    return now() < tokens.expires_at ? tokens.access_token : null
  }

  /** What a failed attempt answers, after arming the next one. */
  function backOff(): string | null {
    failures += 1
    const delay = REFRESH_BACKOFF_MS[Math.min(failures - 1, REFRESH_BACKOFF_MS.length - 1)]!
    nextAttemptAt = now() + delay
    return usableToken()
  }

  async function freshToken(): Promise<string | null> {
    const tokens = loadTokens()
    if (!tokens) return null
    if (now() < tokens.expires_at - EXPIRY_SKEW_MS) return tokens.access_token
    return refresh()
  }

  function refresh(): Promise<string | null> {
    // Inside the backoff window the IdP is not asked at all. The caller gets
    // the same answer it would have got from a failed attempt, without one.
    if (now() < nextAttemptAt) return Promise.resolve(usableToken())
    inflight ??= doRefresh().finally(() => {
      inflight = null
    })
    return inflight
  }

  async function doRefresh(): Promise<string | null> {
    const tokens = loadTokens()
    if (!tokens) return null

    let resp: Response
    try {
      resp = await fetch(`${base}${API.authRefresh}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: tokens.refresh_token }),
      })
    } catch {
      return backOff()
    }

    if (resp.status === 401) {
      endSession()
      return null
    }
    if (!resp.ok) return backOff()

    // Partial rather than SessionTokens: the server always sends all three,
    // but the guard below is about a body that is not one — an interposed
    // proxy, a truncated response — and a non-optional type would make it
    // read as dead code.
    const set = (await resp.json()) as Partial<SessionTokens>
    if (!set.access_token) return backOff()
    saveTokens(
      {
        access_token: set.access_token,
        // Some IdPs don't rotate refresh tokens on use — keep the old one then.
        refresh_token: set.refresh_token || tokens.refresh_token,
        expires_in: set.expires_in ?? 300,
      },
      now,
    )
    failures = 0
    nextAttemptAt = 0
    return set.access_token
  }

  return { freshToken, refresh }
}
