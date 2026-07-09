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

import { clearTokens, loadTokens, saveTokens } from './tokens'

/** Refresh this long before expiry so in-flight requests don't race the deadline. */
const EXPIRY_SKEW_MS = 30_000

/** Dispatched on window when the IdP rejects the refresh token. */
export const AUTH_EXPIRED_EVENT = 'jitpack:auth-expired'

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
      resp = await fetch(`${base}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: tokens.refresh_token }),
      })
    } catch {
      return tokens.access_token
    }

    if (resp.status === 401) {
      clearTokens()
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT))
      return null
    }
    if (!resp.ok) return tokens.access_token

    const set = (await resp.json()) as {
      access_token?: string
      refresh_token?: string
      expires_in?: number
    }
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
