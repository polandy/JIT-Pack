/**
 * Auth composable — OIDC code exchange or Single-User auto-auth (Sync-API §2, FR-17.3).
 *
 * Single-User Mode: no token needed; all requests go unauthenticated and
 * the server's api.NewSingleUser middleware injects the implicit local user.
 */

export type AuthConfig = { mode: 'single-user' } | { mode: 'oidc'; baseUrl: string }

interface TokenSet {
  accessToken: string
  refreshToken: string
  expiresIn: number
}

function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const parts = jwt.split('.')
  const payload = parts[1]
  if (!payload) throw new Error('invalid JWT')
  return JSON.parse(atob(payload))
}

export function useAuth(config: AuthConfig) {
  let tokens: TokenSet | null = null

  if (config.mode === 'single-user') {
    return {
      isAuthenticated: () => true,
      getToken: () => null,
      userId: () => 'local',
      exchangeCode: async () => {},
      refresh: async () => {},
      logout: () => {},
    }
  }

  const baseUrl = config.baseUrl.replace(/\/+$/, '')

  async function exchangeCode(
    code: string,
    codeVerifier: string,
    redirectUri: string,
  ): Promise<void> {
    const resp = await fetch(`${baseUrl}/api/v1/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, code_verifier: codeVerifier, redirect_uri: redirectUri }),
    })
    const json = await resp.json()
    tokens = {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresIn: json.expires_in,
    }
  }

  async function refresh(): Promise<void> {
    if (!tokens) throw new Error('no tokens to refresh')
    const resp = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: tokens.refreshToken }),
    })
    const json = await resp.json()
    tokens = {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresIn: json.expires_in,
    }
  }

  function logout(): void {
    tokens = null
  }

  function isAuthenticated(): boolean {
    return tokens !== null
  }

  function getToken(): string | null {
    return tokens?.accessToken ?? null
  }

  function userId(): string | null {
    if (!tokens) return null
    try {
      const payload = decodeJwtPayload(tokens.accessToken)
      return (payload.sub as string) ?? null
    } catch {
      return null
    }
  }

  return { isAuthenticated, getToken, userId, exchangeCode, refresh, logout }
}
