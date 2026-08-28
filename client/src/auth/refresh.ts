/**
 * OIDC access-token lifecycle (Sync-API §2). The server brokers the
 * refresh grant to the IdP (`POST /api/v1/auth/refresh`); this module
 * decides *when* to use it: proactively shortly before expiry, and
 * reactively when a request came back 401 despite a fresh-looking token.
 *
 * Offline stretches are normal in this app, so a refresh that fails for
 * network reasons keeps the current token — the sync layer already
 * tolerates failing requests. Only an explicit IdP rejection ends the
 * session: tokens are cleared and AUTH_EXPIRED_EVENT tells the app to
 * return to the login page.
 */

import { API } from '@/api/routes'
import type { SessionTokens } from '@/api/types'
import { clearTokens, loadTokens, saveTokens } from './tokens'

/** Refresh this long before expiry so in-flight requests don't race the deadline. */
const EXPIRY_SKEW_MS = 30_000

/** Dispatched on window when the session is over and cannot be renewed. */
export const AUTH_EXPIRED_EVENT = 'jitpack:auth-expired'

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
  window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT))
}

export interface AuthRefresher {
  /** Token for the next request, refreshed first if it expires within the skew. */
  freshToken(): Promise<string | null>
  /** Unconditional refresh — the 401-retry path. Concurrent calls share one request. */
  refresh(): Promise<string | null>
}

export function createAuthRefresher(baseUrl: string): AuthRefresher {
  const base = baseUrl.replace(/\/+$/, '')
  let inflight: Promise<string | null> | null = null

  async function freshToken(): Promise<string | null> {
    const tokens = loadTokens()
    if (!tokens) return null
    if (Date.now() < tokens.expires_at - EXPIRY_SKEW_MS) return tokens.access_token
    return refresh()
  }

  function refresh(): Promise<string | null> {
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
      return tokens.access_token
    }

    if (resp.status === 401) {
      endSession()
      return null
    }
    if (!resp.ok) return tokens.access_token

    // Partial rather than SessionTokens: the server always sends all three,
    // but the guard below is about a body that is not one — an interposed
    // proxy, a truncated response — and a non-optional type would make it
    // read as dead code.
    const set = (await resp.json()) as Partial<SessionTokens>
    if (!set.access_token) return tokens.access_token
    saveTokens({
      access_token: set.access_token,
      // Some IdPs don't rotate refresh tokens on use — keep the old one then.
      refresh_token: set.refresh_token || tokens.refresh_token,
      expires_in: set.expires_in ?? 300,
    })
    return set.access_token
  }

  return { freshToken, refresh }
}
