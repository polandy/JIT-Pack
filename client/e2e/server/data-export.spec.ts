/**
 * E2E-M17-03 and E2E-NFR-05 (NFR-4.5): M17's data section, driven under a
 * real OIDC session — the branch that carries the auth header.
 *
 * NFR-05's catalogue entry said `single`, for the same reason M17-03's did
 * before the M17 audit corrected it: the mode was read off the screen's
 * section rather than off the request. Corrected here to `server`.
 *
 * Why `server` and not `all`, which the case used to claim: in Local Mode
 * this section is a different section entirely (per-trip and per-template
 * YAML written client-side, because there is no server to ask), and in
 * `single` there is no token, so the header the promise is about is never
 * sent. Only a logged-in account exercises `downloadExport` as written.
 *
 * Both files are read back rather than counted: an export is one half of a
 * pair whose other half is a restore, and the half that matters most is the
 * one that has to still be readable when it is the only copy left.
 */
import { readFile } from 'node:fs/promises'

import { test, expect, createTripViaWizard, visiblePage } from '../fixtures'
import { quickAddItem, uniq } from '../serverMode'

import { loginAs } from './fixtures'

test('E2E-M17-03, E2E-NFR-05: the full export and the trip CSV download and carry the trip', async ({
  browser,
}) => {
  const id = uniq()
  const trip = `Jotunheimen ${id}`
  const item = `Gaskocher-${id}`

  const context = await browser.newContext()
  const alice = await loginAs(context, 'alice')
  await createTripViaWizard(alice, { name: trip })
  await quickAddItem(alice, item)

  await alice.goto('/tabs/settings')
  const screen = visiblePage(alice)

  const json = alice.waitForEvent('download')
  await screen.getByTestId('settings-full-export').click()
  const full = await json
  expect(full.suggestedFilename()).toBe('jitpack-export.json')
  const parsed = JSON.parse(await readFile((await full.path())!, 'utf8'))
  // Read as data, not as a string match: a 401 body would also "contain"
  // nothing, and an HTML error page would contain neither.
  expect(JSON.stringify(parsed)).toContain(trip)

  // The CSV is per trip, so it has to be chosen first.
  await screen
    .locator('ion-item')
    .filter({ hasText: 'Trip packing list (CSV)' })
    .locator('ion-select')
    .click()
  await alice.locator('ion-popover ion-select-popover ion-item').filter({ hasText: trip }).click()
  await expect(alice.locator('ion-popover')).toHaveCount(0)

  const csvDownload = alice.waitForEvent('download')
  await screen
    .locator('ion-item')
    .filter({ hasText: 'Trip packing list (CSV)' })
    .getByRole('button', { name: 'Download' })
    .click()
  const csv = await csvDownload
  expect(csv.suggestedFilename()).toBe(`${trip}.csv`)
  expect(await readFile((await csv.path())!, 'utf8')).toContain(item)

  await context.close()
})
