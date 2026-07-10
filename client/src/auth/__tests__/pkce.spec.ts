/** PKCE helpers (Sync-API §2). */
import { describe, expect, it } from 'vitest'

import { buildAuthorizeURL, challengeS256, generateVerifier } from '../pkce'

describe('pkce', () => {
  it('generates url-safe high-entropy verifiers', () => {
    const v1 = generateVerifier()
    const v2 = generateVerifier()

    expect(v1).not.toBe(v2)
    expect(v1.length).toBeGreaterThanOrEqual(43) // RFC 7636 minimum
    expect(v1).toMatch(/^[A-Za-z0-9\-_]+$/)
  })

  it('derives the RFC 7636 appendix-B challenge', async () => {
    // Known vector from RFC 7636 §B.
    const challenge = await challengeS256('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')

    expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })

  it('assembles the authorize redirect', () => {
    const url = new URL(
      buildAuthorizeURL({
        authorizeUrl: 'https://idp.example.com/authorize',
        clientId: 'jitpack',
        redirectUri: 'https://app.example.com/auth/callback',
        challenge: 'CH',
        state: 'ST',
      }),
    )

    expect(url.origin + url.pathname).toBe('https://idp.example.com/authorize')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('code_challenge')).toBe('CH')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('state')).toBe('ST')
    expect(url.searchParams.get('scope')).toContain('offline_access')
    // FR-23.1: the email claim feeds the instance-admin allowlist.
    expect(url.searchParams.get('scope')).toContain('email')
  })
})
