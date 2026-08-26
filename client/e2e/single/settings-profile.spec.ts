import { test, expect, visiblePage } from '../fixtures'
import { bootPage, uniq } from '../serverMode'

/**
 * E2E-M17-04 (FR-17.13): the editable Single-User profile, driven against a
 * real jitpackd so the round trip proves the server accepts the same names
 * the client does.
 *
 * The rule this pins down is the 2026-08-26 revision: 1–50 printable
 * characters, no leading or trailing whitespace. The old `[A-Za-z0-9._-]`
 * charset rejected the server's own seeded default ("Demo User") and every
 * human name with a space or a diacritic — the untouched screen opened with
 * a standing red error (UX review 2026-08-25, UX-3).
 */
test('E2E-M17-04: a human display name is accepted, and the rule only speaks when touched', async ({
  browser,
}) => {
  const context = await browser.newContext()
  const page = await bootPage(context, '/tabs/settings')
  const screen = visiblePage(page)

  // Untouched, the field carries whatever the server handed out and the
  // rule note stays silent — whatever that name looks like.
  const input = screen.getByTestId('settings-name-input')
  await expect(input).toBeVisible()
  await expect(screen.getByTestId('settings-name-rule')).toHaveCount(0)

  // Emptying the field is the first touch, and only now the rule speaks.
  await input.locator('input').fill('')
  await expect(screen.getByTestId('settings-name-rule')).toBeVisible()

  // A name with a space and a diacritic — the shape the old rule refused —
  // saves, and the server keeps it across a reload.
  const name = `Béatrice Müller ${uniq()}`
  await input.locator('input').fill(name)
  await expect(screen.getByTestId('settings-name-rule')).toHaveCount(0)
  await screen.getByTestId('settings-name-save').click()

  await page.reload()
  await expect(
    visiblePage(page).getByTestId('settings-name-input').locator('input'),
  ).toHaveValue(name)

  await context.close()
})
