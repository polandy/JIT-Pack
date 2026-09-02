/**
 * The mock IdP the `server` Playwright project logs in against
 * (UI-Test-Spec §2.3). A test fixture, never a shipped component — it
 * exists so two *different* accounts can drive one instance, which is the
 * one thing the `single` project structurally cannot do.
 *
 * It implements exactly the four surfaces jitpackd's broker uses (ADR-007,
 * auth.go): discovery, JWKS, the authorization-code grant with PKCE S256,
 * and UserInfo. Everything else an IdP does — consent, sessions, logout,
 * scopes beyond the ones the login page asks for — is deliberately absent.
 *
 * `/authorize` renders an account chooser rather than auto-redirecting.
 * That is what makes the identity a *test's* choice, and it keeps the login
 * a real click path: the browser leaves the app's origin, comes back with a
 * code, and the app exchanges it — the same trip a family member's phone
 * makes through Authelia.
 *
 * No dependency: RS256 signing is `node:crypto`, and the JWK comes out of
 * the key object itself (NFR-4.3).
 */

import { createHash, createSign, generateKeyPairSync, randomUUID } from 'node:crypto'
import { createServer } from 'node:http'

/**
 * The accounts the suite logs in as. `alice` is the instance admin
 * (JITPACK_ADMIN_EMAILS names her address); `bob` is an ordinary member.
 *
 * `carol` and `dave` are ordinary members too, and each exists for one
 * file: one backend serves the whole run and the files land on two workers,
 * so an account a case *changes* must be logged in by that file alone.
 * `carol` carries E2E-M17-01's notification preference (multi-user.spec.ts);
 * `dave` is administered by the M20 cases (admin.spec.ts) — deactivated,
 * stripped of his picture, his name reset. Sharing one of them between the
 * two files is a red suite whenever the workers overlap: a deactivation
 * ends the other file's session mid-case and refuses its next login.
 */
export const IDP_USERS = {
  alice: { sub: 'alice', name: 'Alice', email: 'alice@example.test' },
  bob: { sub: 'bob', name: 'Bob', email: 'bob@example.test' },
  carol: { sub: 'carol', name: 'Carol', email: 'carol@example.test' },
  dave: { sub: 'dave', name: 'Dave', email: 'dave@example.test' },
}

const KEY_ID = 'jitpack-e2e'
const TOKEN_TTL_SECONDS = 3600

function base64url(input) {
  return Buffer.from(input).toString('base64url')
}

function signRS256(payload, privateKey) {
  const header = { alg: 'RS256', typ: 'JWT', kid: KEY_ID }
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`
  const signer = createSign('RSA-SHA256')
  signer.update(signingInput)
  return `${signingInput}.${signer.sign(privateKey).toString('base64url')}`
}

/** RFC 7636 S256: the verifier hashes to the challenge the client sent. */
function verifierMatches(verifier, challenge) {
  if (!verifier || !challenge) return false
  return createHash('sha256').update(verifier).digest('base64url') === challenge
}

function html(strings, ...values) {
  return strings.reduce((out, part, i) => out + part + (values[i] ?? ''), '')
}

/**
 * The account chooser. One link per user, each carrying the request's own
 * PKCE and state parameters onward, so nothing about the flow is remembered
 * across requests except the issued code.
 */
function chooserPage(params) {
  const rows = Object.entries(IDP_USERS)
    .map(([key, user]) => {
      const grant = new URLSearchParams(params)
      grant.set('account', key)
      return html`<li>
        <a data-testid="idp-login-${key}" href="/authorize/grant?${grant.toString()}"
          >${user.name} &lt;${user.email}&gt;</a
        >
      </li>`
    })
    .join('')
  return html`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>Mock IdP</title>
      </head>
      <body>
        <h1 data-testid="idp-chooser">Sign in</h1>
        <ul>
          ${rows}
        </ul>
      </body>
    </html>`
}

function sendJSON(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(payload)
}

/**
 * Start the mock IdP on `port` and resolve once it is listening. The issuer
 * is the URL the *server* and the *browser* both reach it at — one origin,
 * because the discovery document's issuer must equal the configured one and
 * the browser is redirected to the same host.
 */
export function startMockIdp({ port, clientId, clientSecret }) {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const jwk = publicKey.export({ format: 'jwk' })
  const issuer = `http://localhost:${port}`

  /** code → { sub, codeChallenge, redirectUri }; consumed by /token. */
  const codes = new Map()
  /** access or refresh token → sub. Opaque strings, exactly like a real IdP's. */
  const accessTokens = new Map()
  const refreshTokens = new Map()

  function issueTokensFor(sub) {
    const user = Object.values(IDP_USERS).find((u) => u.sub === sub)
    const now = Math.floor(Date.now() / 1000)
    const accessToken = randomUUID()
    const refreshToken = randomUUID()
    accessTokens.set(accessToken, sub)
    refreshTokens.set(refreshToken, sub)
    return {
      token_type: 'Bearer',
      expires_in: TOKEN_TTL_SECONDS,
      access_token: accessToken,
      refresh_token: refreshToken,
      id_token: signRS256(
        {
          iss: issuer,
          aud: clientId,
          sub,
          name: user.name,
          email: user.email,
          email_verified: true,
          iat: now,
          exp: now + TOKEN_TTL_SECONDS,
        },
        privateKey,
      ),
    }
  }

  /** client_secret_basic (RFC 6749 §2.3.1) — what the broker sends. */
  function clientAuthenticated(req) {
    const header = req.headers.authorization ?? ''
    if (!header.startsWith('Basic ')) return false
    const [id, secret] = Buffer.from(header.slice('Basic '.length), 'base64')
      .toString('utf8')
      .split(':')
    return decodeURIComponent(id) === clientId && decodeURIComponent(secret) === clientSecret
  }

  async function readForm(req) {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    return new URLSearchParams(Buffer.concat(chunks).toString('utf8'))
  }

  const server = createServer((req, res) => {
    const url = new URL(req.url, issuer)

    if (url.pathname === '/.well-known/openid-configuration') {
      sendJSON(res, 200, {
        issuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: `${issuer}/token`,
        userinfo_endpoint: `${issuer}/userinfo`,
        jwks_uri: `${issuer}/jwks`,
      })
      return
    }

    if (url.pathname === '/jwks') {
      sendJSON(res, 200, {
        keys: [{ kty: jwk.kty, n: jwk.n, e: jwk.e, kid: KEY_ID, alg: 'RS256', use: 'sig' }],
      })
      return
    }

    if (url.pathname === '/authorize') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(chooserPage(url.searchParams))
      return
    }

    if (url.pathname === '/authorize/grant') {
      const account = url.searchParams.get('account')
      const user = IDP_USERS[account]
      const redirectUri = url.searchParams.get('redirect_uri')
      if (!user || !redirectUri) {
        res.writeHead(400).end('unknown account or missing redirect_uri')
        return
      }
      const code = randomUUID()
      codes.set(code, {
        sub: user.sub,
        codeChallenge: url.searchParams.get('code_challenge'),
        redirectUri,
      })
      const back = new URL(redirectUri)
      back.searchParams.set('code', code)
      const state = url.searchParams.get('state')
      if (state) back.searchParams.set('state', state)
      res.writeHead(302, { location: back.toString() }).end()
      return
    }

    if (url.pathname === '/token' && req.method === 'POST') {
      if (!clientAuthenticated(req)) {
        sendJSON(res, 401, { error: 'invalid_client' })
        return
      }
      readForm(req).then((form) => {
        const grant = form.get('grant_type')
        if (grant === 'authorization_code') {
          const issued = codes.get(form.get('code'))
          // A code is single-use, whether or not it turns out to be valid.
          codes.delete(form.get('code'))
          if (
            !issued ||
            !verifierMatches(form.get('code_verifier'), issued.codeChallenge) ||
            form.get('redirect_uri') !== issued.redirectUri
          ) {
            sendJSON(res, 400, { error: 'invalid_grant' })
            return
          }
          sendJSON(res, 200, issueTokensFor(issued.sub))
          return
        }
        if (grant === 'refresh_token') {
          const sub = refreshTokens.get(form.get('refresh_token'))
          if (!sub) {
            sendJSON(res, 400, { error: 'invalid_grant' })
            return
          }
          // Rotating: the old link dies with the new one's issue, which is
          // the shape the broker's refresh chain is written against.
          refreshTokens.delete(form.get('refresh_token'))
          sendJSON(res, 200, issueTokensFor(sub))
          return
        }
        sendJSON(res, 400, { error: 'unsupported_grant_type' })
      })
      return
    }

    if (url.pathname === '/userinfo') {
      const header = req.headers.authorization ?? ''
      const sub = accessTokens.get(header.replace(/^Bearer /, ''))
      const user = Object.values(IDP_USERS).find((u) => u.sub === sub)
      if (!user) {
        sendJSON(res, 401, { error: 'invalid_token' })
        return
      }
      sendJSON(res, 200, {
        sub: user.sub,
        name: user.name,
        email: user.email,
        email_verified: true,
      })
      return
    }

    res.writeHead(404).end('not found')
  })

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, 'localhost', () => resolve({ issuer, server }))
  })
}
