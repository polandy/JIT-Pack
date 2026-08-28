import { test, expect, visiblePage } from '../fixtures'

import { ACCOUNT_NAMES, loginAs } from './fixtures'

/**
 * M20 — the instance admin surface (Addendum §3.23, FR-23.1–23.5), the last
 * of the three areas the `server` project was built for and had not reached.
 *
 * It could not be driven anywhere else: every rule here is a rule about
 * *another account* — who may be deactivated, whose row says "(you)", who is
 * refused the overview — and `single` has one identity by construction.
 * Until this unit the whole screen carried no `data-testid` at all, which is
 * the plainest possible statement that nothing had ever driven it.
 *
 * **Why `carol` exists.** These cases change the account they act on, and one
 * backend serves the whole run with `admin.spec.ts` and `multi-user.spec.ts`
 * free to land on two workers. Administering `bob` would reach sideways into
 * that unit's trips mid-test, so the mock IdP carries a third ordinary
 * account whose only job is to be administered.
 */
test.describe('M20 — the instance admin surface @server @m20', () => {
  // Two or three real logins through the broker per case (§2.4's cost).
  test.slow()

  /**
   * E2E-M17-09 + E2E-M20-01 + E2E-M20-04: the way in, the overview, and the
   * two things FR-23.5/23.1 promise are *not* there.
   *
   * The entry is asserted rather than the route typed, because M17's row is
   * the only way a person reaches M20 and it is gated on the same two
   * conditions the screen is (`collaborative && is_instance_admin`) — a
   * screen reachable only by URL is not a reachable screen.
   */
  test('E2E-M17-09/M20-01/M20-04: the admin row leads to an overview that names every account and offers no delete', async ({
    browser,
  }) => {
    // Bob first: an account is in the overview once the IdP has vouched for
    // it, and nothing else in this file provisions him.
    const ctxBob = await browser.newContext()
    await loginAs(ctxBob, 'bob')

    const ctxAlice = await browser.newContext()
    const alice = await loginAs(ctxAlice, 'alice')

    await alice.goto('/tabs/settings')
    await expect(visiblePage(alice).getByTestId('settings-admin')).toBeVisible()
    await visiblePage(alice).getByTestId('settings-admin').click()

    const list = visiblePage(alice).getByTestId('admin-list')
    await expect(list).toBeVisible()

    // FR-23.2: the row carries who, how they are reached, when they were
    // provisioned and what they have — asserted as text, because the whole
    // point of the row is that an operator can read it.
    const aliceRow = list.getByTestId(`admin-row-${ACCOUNT_NAMES.alice}`)
    await expect(aliceRow).toContainText('alice@example.test')
    await expect(aliceRow).toContainText(/trips?/)
    await expect(aliceRow).toContainText(/templates?/)
    // …and the date is in the *app's* language, not the device's. The suite
    // runs a de-CH device with the app pinned to English, so the unfixed
    // `toLocaleDateString()` printed `28.8.2026` under "Provisioned" — the
    // same defect the conflict log had. A month abbreviation is something
    // the numeric German form cannot produce.
    await expect(aliceRow).toContainText(/Provisioned \w{3} \d{1,2}, \d{4}/)
    // The two markers that only ever belong on this row of this instance.
    await expect(aliceRow.getByTestId('admin-self')).toBeVisible()
    await expect(aliceRow.getByTestId('admin-role-chip')).toBeVisible()

    const bobRow = list.getByTestId(`admin-row-${ACCOUNT_NAMES.bob}`)
    await expect(bobRow).toContainText('bob@example.test')
    // The negatives are asserted beside a positive on the same row, so a row
    // that failed to render cannot satisfy them by being absent.
    await expect(bobRow.getByTestId('admin-self')).toHaveCount(0)
    await expect(bobRow.getByTestId('admin-role-chip')).toHaveCount(0)

    // FR-23.5/23.1: the per-row menu is the only place an action could hide,
    // and it offers exactly three — no delete, no role toggle. Counted, so a
    // fourth cannot arrive unnoticed.
    await bobRow.click()
    const sheet = alice.locator('ion-action-sheet')
    await expect(sheet).toBeVisible()
    await expect(sheet.getByRole('button', { name: /^Deactivate$/ })).toBeVisible()
    await expect(sheet.getByRole('button', { name: /^Remove avatar$/ })).toBeVisible()
    await expect(sheet.getByRole('button', { name: /^Reset display name$/ })).toBeVisible()
    await expect(sheet.getByRole('button')).toHaveCount(4) // the three plus Cancel
    await expect(
      sheet.getByRole('button', { name: /delete|remove account|role|make admin/i }),
    ).toHaveCount(0)
    await sheet.getByRole('button', { name: /^Cancel$/ }).click()
    await expect(sheet).toHaveCount(0)

    // FR-23.3's two exemptions, on the one row that is both: Alice is an
    // instance admin *and* the person looking. The split between the two
    // reasons is where it can be stated exhaustively — `domain/admin.ts`'s
    // unit — because this instance has exactly one admin.
    await aliceRow.click()
    const ownSheet = alice.locator('ion-action-sheet')
    await expect(ownSheet).toBeVisible()
    await expect(ownSheet.getByRole('button', { name: /^Deactivate$/ })).toHaveCount(0)
    await expect(ownSheet.getByRole('button', { name: /^Reset display name$/ })).toBeVisible()
    await ownSheet.getByRole('button', { name: /^Cancel$/ }).click()
    await expect(ownSheet).toHaveCount(0)

    // Leaving is a behaviour too (ADR-011): M20 declares Settings as its
    // static parent, and this is the only project where the screen exists at
    // all — `global-nav.spec.ts` runs `local`, where G-8 removes the entry.
    // The header lives outside the router outlet, so it is addressed
    // unscoped while the destination is asserted on the visible page.
    await alice.getByTestId('header-back').click()
    await expect(visiblePage(alice).getByTestId('settings-admin')).toBeVisible()

    await ctxAlice.close()
    await ctxBob.close()
  })

  /**
   * E2E-M20-02 + E2E-M20-03: deactivation ends the account's access where it
   * is sitting, reactivation gives it back, and a display name can be reset.
   *
   * The access half is asserted on Carol's *own screen*, which is what makes
   * it worth running: FR-23.3 is enforced per request in the auth middleware,
   * and her tokens go on looking valid in localStorage — so before this case
   * a deactivated account's app was indistinguishable from an offline one and
   * simply stopped syncing without a word. The client now ends the session on
   * that one error code and the screen is the login again.
   */
  test('E2E-M20-02/M20-03: a deactivated account is put out and let back in, and a display name can be reset', async ({
    browser,
  }) => {
    const ctxCarol = await browser.newContext()
    const carol = await loginAs(ctxCarol, 'carol')

    const ctxAlice = await browser.newContext()
    const alice = await loginAs(ctxAlice, 'alice')
    await alice.goto('/admin')

    const list = visiblePage(alice).getByTestId('admin-list')
    const carolRow = list.getByTestId(`admin-row-${ACCOUNT_NAMES.carol}`)
    await expect(carolRow).toBeVisible()
    await expect(carolRow.getByTestId('admin-deactivated-chip')).toHaveCount(0)

    await carolRow.click()
    await alice
      .locator('ion-action-sheet')
      .getByRole('button', { name: /^Deactivate$/ })
      .click()

    // FR-23.3: the confirmation spells the consequences out — whom it hits,
    // that it is immediate, that what they made stays, and that logging in
    // again is not the way back.
    const confirm = alice.locator('ion-alert')
    await expect(confirm).toContainText(ACCOUNT_NAMES.carol)
    await expect(confirm).toContainText(/loses all access immediately/i)
    await expect(confirm).toContainText(/remain visible to others/i)
    await expect(confirm).toContainText(/only Reactivate/i)
    await confirm.getByRole('button', { name: /^Deactivate$/ }).click()

    await expect(carolRow.getByTestId('admin-deactivated-chip')).toBeVisible()

    // Carol's next request is refused, and her screen says so by being the
    // login again — the app boots, its first pull comes back 403 and the
    // session ends. Asserted on the rendered page: the tokens are still in
    // her localStorage at the moment of the reload, so a URL assertion alone
    // would pass against a client that ignored the refusal.
    await carol.reload()
    await expect(visiblePage(carol).getByTestId('login-action')).toBeVisible()

    // …and the way back is the one the confirmation named.
    await carolRow.click()
    await alice
      .locator('ion-action-sheet')
      .getByRole('button', { name: /^Reactivate$/ })
      .click()
    await expect(carolRow.getByTestId('admin-deactivated-chip')).toHaveCount(0)

    const ctxCarolAgain = await browser.newContext()
    const carolAgain = await loginAs(ctxCarolAgain, 'carol')
    await expect(visiblePage(carolAgain).getByTestId('dashboard-greeting')).toBeVisible()

    // FR-23.4: the name the IdP supplied can be taken away. It is done last
    // on purpose — the row is addressed by that name, and a reset is the one
    // action in this unit that nothing undoes. The row then falls back to the
    // account id, so its disappearance is asserted beside the list still
    // holding an unnamed row rather than on its own.
    const before = await list.locator('ion-item').count()
    await carolRow.click()
    await alice
      .locator('ion-action-sheet')
      .getByRole('button', { name: /^Reset display name$/ })
      .click()
    await expect(list.getByTestId(`admin-row-${ACCOUNT_NAMES.carol}`)).toHaveCount(0)
    await expect(list.locator('ion-item')).toHaveCount(before)

    await ctxAlice.close()
    await ctxCarol.close()
    await ctxCarolAgain.close()
  })

  /**
   * E2E-M20-05 (FR-23.1/G-8): an ordinary account is not offered the screen
   * and is refused it when it asks anyway.
   *
   * Both halves, because either alone is the wrong guarantee: a hidden entry
   * over an open endpoint is security by menu, and a refused endpoint under a
   * visible entry is a dead-end the operator gets blamed for.
   */
  test('E2E-M20-05: an ordinary account is neither offered the overview nor served it', async ({
    browser,
  }) => {
    const ctxBob = await browser.newContext()
    const bob = await loginAs(ctxBob, 'bob')

    await bob.goto('/tabs/settings')
    // A positive on the same screen, so "not there" cannot be satisfied by a
    // Settings page that never rendered.
    await expect(visiblePage(bob).getByTestId('settings-section-retired')).toBeVisible()
    await expect(visiblePage(bob).getByTestId('settings-admin')).toHaveCount(0)

    await bob.goto('/admin')
    await expect(visiblePage(bob).getByTestId('admin-unavailable')).toBeVisible()
    await expect(visiblePage(bob).getByTestId('admin-list')).toHaveCount(0)

    await ctxBob.close()
  })
})
