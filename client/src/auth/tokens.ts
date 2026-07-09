/**
 * Token persistence for Server Mode with OIDC (Sync-API §2). Tokens
 * live in localStorage so a reload keeps the session; refresh tokens
 * are long-lived (IdP default 90 days) to survive offline stretches.
 */

const KEY = 'jitpack_tokens'

export interface StoredTokens {
  access_token: string
  refresh_token: string
  /** Epoch millis when the access token expires. */
  expires_at: number
}

export function saveTokens(set: { access_token: string; refresh_token: string; expires_in: number }): void {
  const stored: StoredTokens = {
    access_token: set.access_token,
    refresh_token: set.refresh_token,
    expires_at: Date.now() + set.expires_in * 1000,
  }
  localStorage.setItem(KEY, JSON.stringify(stored))
}

export function loadTokens(): StoredTokens | null {
  const raw = localStorage.getItem(KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as StoredTokens
  } catch {
    return null
  }
}

export function clearTokens(): void {
  localStorage.removeItem(KEY)
}
