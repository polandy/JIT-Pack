/**
 * Fixtures for the multi-identity project (`server`, UI-Test-Spec §2.3).
 *
 * The one thing this file exists for is `loginAs`: a page that is a
 * *particular person*. Everything the project can prove that `single`
 * cannot — whose name is on a claimed row, who packed an item, who may take
 * a row over — rests on two contexts holding two different sessions.
 *
 * The login is driven, never seeded. Writing a token into localStorage
 * would skip the whole broker path (ADR-007: code + PKCE verifier →
 * exchange → JIT provisioning), and that path is itself under test here —
 * the display name every later assertion reads is the one UserInfo
 * supplied.
 */

import { expect, type BrowserContext, type Page } from '@playwright/test'

import { seed, visiblePage } from '../fixtures'

/** The mock IdP's accounts (e2e/server/mockIdp.mjs). */
export type Account = 'alice' | 'bob'

/** The display names those accounts carry into the app via UserInfo. */
export const ACCOUNT_NAMES: Record<Account, string> = { alice: 'Alice', bob: 'Bob' }

/**
 * Log a fresh page in as `account` and leave it on the dashboard.
 *
 * The flow is the real one end to end: the app finds no session, sends the
 * page to M1's login, the login redirects to the IdP, the IdP redirects
 * back with a code, and the callback exchanges it. Nothing here waits for a
 * duration — each step is awaited on the element or the page that proves
 * the previous one landed.
 */
export async function loginAs(context: BrowserContext, account: Account): Promise<Page> {
  const page = await context.newPage()
  await seed(page, { mode: 'server' })
  await page.goto('/')

  // App.vue: server mode + no tokens + the server offers OIDC → /login.
  await expect(visiblePage(page).getByTestId('login-action')).toBeVisible()
  await page.getByTestId('login-action').click()

  // The browser is at the IdP now, off the app's origin entirely.
  await page.getByTestId(`idp-login-${account}`).click()

  // The callback replaces itself with the dashboard once the exchange is
  // done, so the greeting is the proof that a session exists.
  await expect(visiblePage(page).getByTestId('dashboard-greeting')).toBeVisible()
  return page
}
