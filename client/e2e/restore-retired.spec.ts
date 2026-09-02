import type { Page } from '@playwright/test'

import {
  addPosition,
  backToTemplateList,
  createTemplate,
  createTripFollowingGroup,
  test,
  expect,
  visiblePage,
} from './fixtures'
import { backToInventory, createItem } from './helpers/m9'
import { PATH } from './routes'

/**
 * FR-24.3 / M23 — the way back from a retire.
 *
 * A retire keeps the row and hides it, which FR-24.3 called a free restore
 * because the marker is an ordinary field. Free it was not: nothing listed
 * the hidden rows, so the delete was one-way in practice. These cases drive
 * the surface that lists them and the two things a restore can meet — a free
 * name, and a name an active row took while the row was hidden.
 *
 * The collision is the substance. Retiring *frees* the name (the unique
 * indexes are partial over the active rows), so re-creating what you just
 * deleted is allowed — and then the original cannot simply come back. Only a
 * rendered case shows what the user meets there: the refusal has to arrive
 * before the optimistic restore, or ADR-031's repair makes the row appear and
 * vanish again.
 *
 * Local Mode throughout: with no server the client's check is the only guard
 * there is, so a missing rule has nowhere to hide (invariant 4/5).
 */

/**
 * The state, never a duration: the indicator returns to "on this device" once
 * the IndexedDB write has actually landed (FR-19.2), which is what a reload
 * depends on. Every `page.goto` after a write goes through this.
 */
async function localWriteSettled(page: Page) {
  await expect(page.getByTestId('sync-indicator')).toHaveAttribute('data-state', 'local')
}

/** Retire `item` by putting it in `group` first — a reference is what makes a delete a retire. */
async function retireItemViaGroup(page: Page, group: string, item: string) {
  await page.goto(PATH.templates)
  await createTemplate(page, 'group', group)
  await addPosition(page, item)
  await backToTemplateList(page)

  await page.goto(PATH.items)
  await visiblePage(page).getByTestId('m9-row').filter({ hasText: item }).click()
  await expect(page.getByTestId('header-title')).toHaveText(item)
  await expect(visiblePage(page).getByTestId('m10-delete-outlook')).toContainText(
    'hidden, not removed',
  )
  await visiblePage(page).getByTestId('m10-delete').click()

  const alert = page.locator('ion-alert')
  await expect(alert).toBeVisible()
  await alert.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(alert).toHaveCount(0)
  await expect(visiblePage(page).getByTestId('m9-fab')).toBeVisible()
  await expect(visiblePage(page).getByTestId('m9-row').filter({ hasText: item })).toHaveCount(0)
  await localWriteSettled(page)
}

/** A bare master item through M10, ending back on M9 with the write settled. */
async function createItemOnDevice(page: Page, name: string) {
  await createItem(page, name)
  await backToInventory(page)
  await localWriteSettled(page)
}

/** M23 through the door it actually has — the Settings row, not a typed URL. */
async function openRetired(page: Page) {
  await localWriteSettled(page)
  await page.goto(PATH.settings)
  await visiblePage(page).getByTestId('settings-retired').click()
  await expect(visiblePage(page).getByTestId('m23-segment')).toBeVisible()
}

test.describe('FR-24.3 — a retired row can come back', () => {
  test.slow()

  test('E2E-M23-01: a hidden item is listed, restored, and back in the inventory', async ({
    seedMode,
    page,
  }) => {
    await seedMode({ mode: 'local' })
    await retireItemViaGroup(page, 'Fotografie', 'Kamera')

    // A second, untouched item: "the inventory grew by one" must not be
    // satisfiable by the list simply repainting from nothing.
    await createItemOnDevice(page, 'Stativ')

    await openRetired(page)
    await expect(visiblePage(page).getByTestId('m23-row')).toHaveCount(1)
    await expect(visiblePage(page).getByTestId('m23-row-name')).toHaveText('Kamera')
    // The Vorlagen segment is empty, which is the positive control for the
    // list above: both halves read the same store and only one has rows.
    await visiblePage(page).getByTestId('m23-segment-templates').click()
    await expect(visiblePage(page).getByTestId('m23-empty')).toBeVisible()
    await visiblePage(page).getByTestId('m23-segment-items').click()

    await visiblePage(page).getByTestId('m23-restore').click()
    // Settled by the row leaving the list it was on, not by a timer.
    await expect(visiblePage(page).getByTestId('m23-empty')).toBeVisible()
    await localWriteSettled(page)

    await page.goto(PATH.items)
    await expect(visiblePage(page).getByTestId('m9-row').filter({ hasText: 'Kamera' })).toHaveCount(
      1,
    )
    await expect(visiblePage(page).getByTestId('m9-row').filter({ hasText: 'Stativ' })).toHaveCount(
      1,
    )
  })

  test('E2E-M23-02: a restore whose name was taken meanwhile is refused, and renamed back in', async ({
    seedMode,
    page,
  }) => {
    await seedMode({ mode: 'local' })
    await retireItemViaGroup(page, 'Fotografie', 'Kamera')

    // Allowed, and the whole reason the unique index is partial: the name a
    // hidden row was created with is a name taken by nothing.
    await createItemOnDevice(page, 'Kamera')
    await expect(visiblePage(page).getByTestId('m9-row').filter({ hasText: 'Kamera' })).toHaveCount(
      1,
    )

    await openRetired(page)
    await expect(visiblePage(page).getByTestId('m23-row-name')).toHaveText('Kamera')
    await visiblePage(page).getByTestId('m23-restore').click()

    // Met before the mutation: the row is still on M23 behind the alert,
    // rather than having been restored and then reversed.
    const alert = page.locator('ion-alert')
    await expect(alert).toBeVisible()
    await expect(alert).toContainText('Another item is called “Kamera” now')
    await expect(visiblePage(page).getByTestId('m23-row')).toHaveCount(1)

    // The way out is part of the refusal.
    const input = alert.locator('input')
    await input.fill('Kamera (alt)')
    // Asserted, not assumed: an alert input that only took the first
    // keystroke would restore a row named "K" and every count below would
    // still be one — which is what the first run of this case actually did.
    await expect(input).toHaveValue('Kamera (alt)')
    await alert.getByRole('button', { name: 'Restore', exact: true }).click()
    await expect(alert).toHaveCount(0)
    await expect(visiblePage(page).getByTestId('m23-empty')).toBeVisible()
    await localWriteSettled(page)

    await page.goto(PATH.items)
    // Both rows, which is the point: the restore had to make room for itself
    // rather than take the name back from the row that holds it.
    await expect(visiblePage(page).getByTestId('m9-row').filter({ hasText: 'Kamera' })).toHaveCount(
      2,
    )
    await expect(
      visiblePage(page).getByTestId('m9-row').filter({ hasText: 'Kamera (alt)' }),
    ).toHaveCount(1)

    // And the group that kept the row alive still resolves it, under its
    // new name — the retire's own promise, unbroken by the rename.
    await localWriteSettled(page)
    await page.goto(PATH.templates)
    await visiblePage(page).locator('ion-item', { hasText: 'Fotografie' }).click()
    await expect(page.getByTestId('header-title')).toHaveText('Fotografie')
    await expect(
      visiblePage(page).locator('ion-item h2').filter({ hasText: 'Kamera (alt)' }),
    ).toHaveCount(1)
  })

  test('E2E-M23-04: a Vorlage a trip used is hidden too, listed on its own segment, and restored', async ({
    seedMode,
    page,
  }) => {
    // The half of M23 nothing had ever rendered (backlog item 6,
    // 2026-08-30). FR-24.3 retires master items *and* Vorlagen, and the
    // screen builds its two lists from two different row builders — but all
    // three cases above retire an item, and one of them uses the Vorlagen
    // segment's *emptiness* as a positive control, which only says anything
    // if that segment can ever hold a row. The retire branch of a Vorlage
    // had no rendered case either (E2E-M7-11 covers the remove branch and
    // says why it stops there); one trip pays for both.
    await seedMode({ mode: 'local' })
    await page.goto(PATH.templates)
    await createTemplate(page, 'group', 'Fotografie')
    await addPosition(page, 'Kamera')
    await backToTemplateList(page)

    // FR-9.2's provenance is what makes the delete a retire: the trip's rows
    // point back at the group they were generated from.
    await createTripFollowingGroup(page, 'Wochenende', 'Fotografie')

    await localWriteSettled(page)
    await page.goto(PATH.templates)
    const row = visiblePage(page).locator('ion-item', { hasText: 'Fotografie' })
    await row.dispatchEvent('contextmenu')
    const sheet = page.locator('ion-action-sheet')
    await expect(sheet).toBeVisible()
    await sheet.getByRole('button', { name: 'Delete', exact: true }).click()

    // The other sentence of the same confirm E2E-M7-11 reads: this one is
    // used, so it says it is kept rather than removed — before the tap.
    const confirm = page.locator('ion-alert')
    await expect(confirm).toContainText('hidden, not removed')
    await confirm.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(visiblePage(page).locator('ion-item', { hasText: 'Fotografie' })).toHaveCount(0)

    await openRetired(page)
    // The items segment is empty, so a row on the Vorlagen list is a fact
    // about which list it landed on — the mirror of E2E-M23-01's control.
    await expect(visiblePage(page).getByTestId('m23-empty')).toBeVisible()
    await visiblePage(page).getByTestId('m23-segment-templates').click()
    await expect(visiblePage(page).getByTestId('m23-row')).toHaveCount(1)
    await expect(visiblePage(page).getByTestId('m23-row-name')).toHaveText('Fotografie')
    // Still used by the trip, so a permanent delete would silently be
    // another retire and is not offered — the same rule E2E-M23-03 pins for
    // an item, asserted here against the restore button's presence.
    await expect(visiblePage(page).getByTestId('m23-restore')).toHaveCount(1)
    await expect(visiblePage(page).getByTestId('m23-purge')).toHaveCount(0)

    await visiblePage(page).getByTestId('m23-restore').click()
    await expect(visiblePage(page).getByTestId('m23-empty')).toBeVisible()
    await localWriteSettled(page)

    // Back where it was hidden from, and still itself: the group is on M7
    // and still holds the position it was created with.
    await page.goto(PATH.templates)
    await expect(visiblePage(page).locator('ion-item', { hasText: 'Fotografie' })).toHaveCount(1)
    await visiblePage(page).locator('ion-item', { hasText: 'Fotografie' }).click()
    await expect(page.getByTestId('header-title')).toHaveText('Fotografie')
    await expect(
      visiblePage(page).locator('ion-item h2').filter({ hasText: 'Kamera' }),
    ).toHaveCount(1)
  })

  test('E2E-M23-03: a hidden row nothing uses any more can be removed for good', async ({
    seedMode,
    page,
  }) => {
    await seedMode({ mode: 'local' })
    await retireItemViaGroup(page, 'Fotografie', 'Kamera')

    // While the group still holds it, M23 offers only the restore: a
    // permanent delete would silently be another retire.
    await openRetired(page)
    await expect(visiblePage(page).getByTestId('m23-restore')).toHaveCount(1)
    await expect(visiblePage(page).getByTestId('m23-purge')).toHaveCount(0)

    // Take the group away, which is what makes the row unreferenced.
    await localWriteSettled(page)
    await page.goto(PATH.templates)
    const row = visiblePage(page).locator('ion-item', { hasText: 'Fotografie' })
    await row.dispatchEvent('contextmenu')
    const sheet = page.locator('ion-action-sheet')
    await expect(sheet).toBeVisible()
    await sheet.getByRole('button', { name: 'Delete', exact: true }).click()
    const confirm = page.locator('ion-alert')
    await expect(confirm).toBeVisible()
    await confirm.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(visiblePage(page).locator('ion-item', { hasText: 'Fotografie' })).toHaveCount(0)

    await openRetired(page)
    await expect(visiblePage(page).getByTestId('m23-purge')).toHaveCount(1)
    await visiblePage(page).getByTestId('m23-purge').click()

    const purge = page.locator('ion-alert')
    await expect(purge).toBeVisible()
    await expect(purge).toContainText('removed for good')
    await purge.getByRole('button', { name: 'Delete for good', exact: true }).click()
    await expect(purge).toHaveCount(0)

    // Gone rather than hidden: the list it was on is empty, and the name is
    // free again — which a row still holding it, retired or not, would refuse.
    await expect(visiblePage(page).getByTestId('m23-empty')).toBeVisible()
    await localWriteSettled(page)
    await page.goto(PATH.items)
    await createItemOnDevice(page, 'Kamera')
    await expect(visiblePage(page).getByTestId('m9-row').filter({ hasText: 'Kamera' })).toHaveCount(
      1,
    )
  })
})
