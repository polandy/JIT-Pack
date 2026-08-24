/**
 * Boots the `server` project's backend: the mock IdP first, then jitpackd
 * against it (UI-Test-Spec §2.3).
 *
 * One launcher rather than two Playwright `webServer` entries, because the
 * order is load-bearing and Playwright starts its servers concurrently:
 * jitpackd resolves OIDC discovery *at start-up* and exits when the issuer
 * does not answer (cmd/jitpackd), so an IdP that loses the boot race is a
 * dead backend and a suite that reports a missing health endpoint instead
 * of the cause. Here the IdP is listening before the child is spawned —
 * ordering by construction, with nothing to poll and nothing to wait out.
 *
 * Every port and secret arrives in the environment; playwright.config.ts
 * owns the values (client/e2e/backendPort.ts names the ports once).
 */

import { spawn } from 'node:child_process'
import process from 'node:process'

import { startMockIdp } from './mockIdp.mjs'

const {
  E2E_IDP_PORT,
  E2E_SERVER_API_PORT,
  E2E_OIDC_CLIENT_ID,
  E2E_OIDC_CLIENT_SECRET,
  E2E_SERVER_DB_PATH,
  E2E_SESSION_SECRET,
  E2E_ADMIN_EMAILS,
  E2E_JITPACKD,
} = process.env

const { issuer } = await startMockIdp({
  port: Number(E2E_IDP_PORT),
  clientId: E2E_OIDC_CLIENT_ID,
  clientSecret: E2E_OIDC_CLIENT_SECRET,
})
console.log(`mock IdP listening on ${issuer}`)

const child = spawn(E2E_JITPACKD, {
  stdio: 'inherit',
  env: {
    ...process.env,
    JITPACK_LISTEN: `localhost:${E2E_SERVER_API_PORT}`,
    JITPACK_DB_PATH: E2E_SERVER_DB_PATH,
    JITPACK_SESSION_SECRET: E2E_SESSION_SECRET,
    JITPACK_OIDC_ISSUER: issuer,
    JITPACK_OIDC_CLIENT_ID: E2E_OIDC_CLIENT_ID,
    JITPACK_OIDC_CLIENT_SECRET: E2E_OIDC_CLIENT_SECRET,
    JITPACK_ADMIN_EMAILS: E2E_ADMIN_EMAILS,
  },
})

// Playwright kills this process, not the grandchild: without the forward
// jitpackd survives the run and the next one fails on a bound port.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal))
}
child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 0)))
