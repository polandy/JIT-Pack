import { test, expect, seed, visiblePage } from '../fixtures'

import { ACCOUNT_NAMES, loginAs } from './fixtures'

/**
 * A 1×1 JPEG, small enough to write inline and real enough to decode — the
 * `<img>` has to actually paint, or the FR-23.4a fallback would hide the
 * upload and E2E-M20-03b would assert the absence of something that was
 * never there.
 */
const TINY_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
  'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA' +
  'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q=='

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
 * **Why `dave` exists, and why nobody else may log in as him.** These cases
 * change the account they act on — deactivate it, take its picture, reset its
 * name — and one backend serves the whole run with this file and
 * `multi-user.spec.ts` free to land on two workers. Deactivating an account
 * another file is logged in as at that moment ends *its* session mid-case
 * (FR-23.3 does exactly what it promises), and every later login as that
 * account is refused until this file reaches its reactivate step. That is
 * what happened with `carol` on 2026-09-02, after E2E-M17-01 had borrowed
 * her: one red case, then three more at the login. The rule the fixture now
 * states: an account a file *changes* is logged in by that file alone.
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
  test('E2E-M17-09, E2E-M20-01, E2E-M20-04: the admin row leads to an overview that names every account and offers no delete', async ({
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

    // FR-25.3: nobody in this fixture ever uploaded a picture, and the
    // avatar endpoint 404s for such an account. The circle carries the
    // person's initials and no `<img>` at all — this row used to render the
    // browser's torn-picture glyph.
    const face = aliceRow.getByTestId('user-avatar')
    await expect(face).toHaveText('AL')
    await expect(face.getByTestId('user-avatar-picture')).toHaveCount(0)

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
   * The access half is asserted on Dave's *own screen*, which is what makes
   * it worth running: FR-23.3 is enforced per request in the auth middleware,
   * and his tokens go on looking valid in localStorage — so before this case
   * a deactivated account's app was indistinguishable from an offline one and
   * simply stopped syncing without a word. The client now ends the session on
   * that one error code and the screen is the login again.
   */
  test('E2E-M20-02, E2E-M20-03: a deactivated account is put out and let back in, and a display name can be reset', async ({
    browser,
  }) => {
    const ctxDave = await browser.newContext()
    const dave = await loginAs(ctxDave, 'dave')

    const ctxAlice = await browser.newContext()
    const alice = await loginAs(ctxAlice, 'alice')
    await alice.goto('/admin')

    const list = visiblePage(alice).getByTestId('admin-list')
    const daveRow = list.getByTestId(`admin-row-${ACCOUNT_NAMES.dave}`)
    await expect(daveRow).toBeVisible()
    await expect(daveRow.getByTestId('admin-deactivated-chip')).toHaveCount(0)

    await daveRow.click()
    await alice
      .locator('ion-action-sheet')
      .getByRole('button', { name: /^Deactivate$/ })
      .click()

    // FR-23.3: the confirmation spells the consequences out — whom it hits,
    // that it is immediate, that what they made stays, and that logging in
    // again is not the way back.
    const confirm = alice.locator('ion-alert')
    await expect(confirm).toContainText(ACCOUNT_NAMES.dave)
    await expect(confirm).toContainText(/loses all access immediately/i)
    await expect(confirm).toContainText(/remain visible to others/i)
    await expect(confirm).toContainText(/only Reactivate/i)
    await confirm.getByRole('button', { name: /^Deactivate$/ }).click()

    await expect(daveRow.getByTestId('admin-deactivated-chip')).toBeVisible()

    // Dave's next request is refused, and his screen says so by being the
    // login again — the app boots, M1's `me` comes back 403 and the session
    // ends. That request is sent from a child's `onMounted`, so it can answer
    // before App.vue is listening, which is what `onSessionEnded`'s latch is
    // for. Asserted on the rendered page: the tokens are still in his
    // localStorage at the moment of the reload, so a URL assertion alone
    // would pass against a client that ignored the refusal.
    await dave.reload()
    await expect(visiblePage(dave).getByTestId('login-action')).toBeVisible()

    // …and the way back is the one the confirmation named.
    await daveRow.click()
    await alice
      .locator('ion-action-sheet')
      .getByRole('button', { name: /^Reactivate$/ })
      .click()
    await expect(daveRow.getByTestId('admin-deactivated-chip')).toHaveCount(0)

    const ctxDaveAgain = await browser.newContext()
    const daveAgain = await loginAs(ctxDaveAgain, 'dave')
    await expect(visiblePage(daveAgain).getByTestId('dashboard-greeting')).toBeVisible()

    // FR-23.4: the name the IdP supplied can be taken away. It is done last
    // on purpose — the row is addressed by that name, and a reset is the one
    // action in this unit that nothing undoes. The row then falls back to the
    // account id, so its disappearance is asserted beside the list still
    // holding an unnamed row rather than on its own.
    const before = await list.locator('ion-item').count()
    await daveRow.click()
    await alice
      .locator('ion-action-sheet')
      .getByRole('button', { name: /^Reset display name$/ })
      .click()
    await expect(list.getByTestId(`admin-row-${ACCOUNT_NAMES.dave}`)).toHaveCount(0)
    await expect(list.locator('ion-item')).toHaveCount(before)

    await ctxAlice.close()
    await ctxDave.close()
    await ctxDaveAgain.close()
  })

  /**
   * E2E-M20-03b: the avatar half of FR-23.4, which E2E-M20-03 has never
   * covered — the ledger said so, and the reason it gave was that no fixture
   * account has a picture. Reading it against the screen found a second
   * reason underneath: **the removal changed nothing on M20 even when there
   * was one.** The row is keyed by user id, so reloading the list hands the
   * same `<img>` the same `src`, and the browser is never asked again — and
   * the avatar response carries `max-age=3600`, so it would not be told
   * anything if it were. M17 had carried the cache-busting query for
   * FR-17.13 since the profile picture shipped; M20 was written without it.
   * Moderation whose whole point is that the picture goes has to show it
   * going on the screen that did it.
   *
   * The picture is put on Dave's account through the app's own endpoint
   * rather than through M17's control: the crop modal renders into a canvas
   * with no settled signal to wait on, which is why E2E-M17-12 is still
   * open, and this case is about M20's row rather than about the crop.
   */
  test('E2E-M20-03b: a picture on the row is what Remove avatar removes', async ({ browser }) => {
    const ctxDave = await browser.newContext()
    const dave = await loginAs(ctxDave, 'dave')

    // A 1×1 JPEG. `PUT /users/{id}/avatar` is `self`-guarded, so it is sent
    // from inside Dave's own session — an admin cannot put one there, only
    // take it away, which is FR-23.4's whole shape.
    const uploaded = await dave.evaluate(async (jpegBase64) => {
      const stored = localStorage.getItem('jitpack_tokens')
      if (!stored) return 'no session'
      const token = (JSON.parse(stored) as { access_token: string }).access_token
      const auth = { Authorization: `Bearer ${token}` }
      const me = (await (await fetch('/api/v1/me', { headers: auth })).json()) as {
        user_id: string
      }
      const bytes = Uint8Array.from(atob(jpegBase64), (c) => c.charCodeAt(0))
      const resp = await fetch(`/api/v1/users/${me.user_id}/avatar`, {
        method: 'PUT',
        headers: { ...auth, 'Content-Type': 'image/jpeg' },
        body: bytes,
      })
      return resp.ok ? 'ok' : `status ${resp.status}`
    }, TINY_JPEG_BASE64)
    expect(uploaded).toBe('ok')

    const ctxAlice = await browser.newContext()
    const alice = await loginAs(ctxAlice, 'alice')
    await alice.goto('/admin')

    const daveRow = visiblePage(alice)
      .getByTestId('admin-list')
      .getByTestId(`admin-row-${ACCOUNT_NAMES.dave}`)
    const face = daveRow.getByTestId('user-avatar')
    // The picture is laid over the initials (FR-23.4a), so its presence is
    // the state this case then takes away.
    await expect(face.getByTestId('user-avatar-picture')).toBeVisible()

    await daveRow.click()
    await alice
      .locator('ion-action-sheet')
      .getByRole('button', { name: /^Remove avatar$/ })
      .click()

    // Gone from the screen that removed it, and the letters are underneath
    // where FR-23.4a says they always were — asserted together, because an
    // avatar that stopped rendering at all would satisfy the absence alone.
    await expect(face.getByTestId('user-avatar-picture')).toHaveCount(0)
    await expect(face).toHaveText('DA')

    await ctxAlice.close()
    await ctxDave.close()
  })

  /**
   * E2E-M20-06 (FR-23.3/23.6): a deactivated account signs in again, and the
   * IdP still vouches for it — FR-23.6 keeps provisioning open on purpose.
   * FR-23.3's answer is that this does not bring the account back, "otherwise
   * deactivation would be meaningless under FR-23.6".
   *
   * The clause had no case anywhere on the screen. `store/admin_test.go`
   * proves the login does not clear `deactivated_at`, and `issueSession`
   * refuses the exchange with `account_deactivated` — and the app said
   * *„The server rejected the login."* to it, the same sentence a replayed
   * code gets. This is the login-screen twin of the defect the FR's own
   * 2026-08-28 amendment fixed inside the app: a person told nothing, left
   * to read a permanent state as a glitch and try again. The callback now
   * narrows on that one code, the way `client.ts` does.
   */
  test('E2E-M20-06: a deactivated account signing in again is refused, and told why', async ({
    browser,
  }) => {
    const ctxDave = await browser.newContext()
    // Dave logs in first: it provisions her, and it re-stamps the display
    // name the row is addressed by (FR-23.4) in case a sibling case reset it.
    await loginAs(ctxDave, 'dave')
    await ctxDave.close()

    const ctxAlice = await browser.newContext()
    const alice = await loginAs(ctxAlice, 'alice')
    await alice.goto('/admin')

    const daveRow = visiblePage(alice)
      .getByTestId('admin-list')
      .getByTestId(`admin-row-${ACCOUNT_NAMES.dave}`)
    await daveRow.click()
    await alice
      .locator('ion-action-sheet')
      .getByRole('button', { name: /^Deactivate$/ })
      .click()
    await alice
      .locator('ion-alert')
      .getByRole('button', { name: /^Deactivate$/ })
      .click()
    await expect(daveRow.getByTestId('admin-deactivated-chip')).toBeVisible()

    // A fresh device, a real login, all the way through the IdP.
    const ctxAgain = await browser.newContext()
    const again = await ctxAgain.newPage()
    await seed(again, { mode: 'server' })
    await again.goto('/')
    await expect(visiblePage(again).getByTestId('login-action')).toBeVisible()
    await again.getByTestId('login-action').click()
    await again.getByTestId('idp-login-dave').click()

    // The sentence, not merely a refusal: "rejected the login" is what every
    // other failed exchange says, so a regex that matched it would pass
    // against the build this case was written for.
    await expect(visiblePage(again).getByTestId('login-error')).toContainText(/deactivated/i)
    // …and nothing was let through behind it.
    expect(await again.evaluate(() => localStorage.getItem('jitpack_tokens'))).toBeNull()
    await ctxAgain.close()

    // Put the account back, because the next case in this file expects an
    // ordinary account to administer.
    await daveRow.click()
    await alice
      .locator('ion-action-sheet')
      .getByRole('button', { name: /^Reactivate$/ })
      .click()
    await expect(daveRow.getByTestId('admin-deactivated-chip')).toHaveCount(0)

    await ctxAlice.close()
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
