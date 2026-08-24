/**
 * Token persistence for Server Mode with OIDC (Sync-API §2). Tokens
 * live in localStorage so a reload keeps the session; refresh tokens
 * are long-lived (IdP default 90 days) to survive offline stretches.
 */

import type { SessionTokens } from '@/api/types'
const KEY = 'jitpack_tokens'

export interface StoredTokens {
  access_token: string
  refresh_token: string
  /** Epoch millis when the access token expires. */
  expires_at: number
}

export function saveTokens(set: SessionTokens): void {
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

/**
 * The account id inside a JIT-Pack session token, or null when there is no
 * token or it cannot be read.
 *
 * The server signs its own access tokens with `sub` set to the user id
 * (auth.go, `writeSessionTokens`), so a client in Server Mode knows who it
 * is without asking — which is what lets a device tell its own claim from
 * somebody else's after a takeover (FR-5.7). Single-User and Local Mode
 * have no token and therefore no answer here, deliberately: there is one
 * person in both, and the device is the only distinction that exists.
 */
export function subjectOf(token: string | null): string | null {
  if (!token) return null
  const payload = token.split('.')[1]
  if (!payload) return null
  try {
    const claims = JSON.parse(atob(payload)) as Record<string, unknown>
    return typeof claims['sub'] === 'string' ? claims['sub'] : null
  } catch {
    return null
  }
}
