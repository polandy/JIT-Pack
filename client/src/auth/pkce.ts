/**
 * PKCE helpers for the OIDC Authorization-Code flow (Sync-API §2).
 * Pure WebCrypto, no dependencies.
 */

function base64url(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** generateVerifier returns a high-entropy PKCE code verifier (RFC 7636). */
export function generateVerifier(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return base64url(bytes)
}

/** challengeS256 derives the S256 code challenge for a verifier. */
export async function challengeS256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64url(new Uint8Array(digest))
}

/** buildAuthorizeURL assembles the IdP redirect for the login page. */
export function buildAuthorizeURL(opts: {
  authorizeUrl: string
  clientId: string
  redirectUri: string
  challenge: string
  state: string
}): string {
  const url = new URL(opts.authorizeUrl)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', opts.clientId)
  url.searchParams.set('redirect_uri', opts.redirectUri)
  url.searchParams.set('scope', 'openid profile offline_access')
  url.searchParams.set('code_challenge', opts.challenge)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('state', opts.state)
  return url.toString()
}
