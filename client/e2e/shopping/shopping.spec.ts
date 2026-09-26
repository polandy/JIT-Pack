import type { Page } from '@playwright/test'

import {
  addInComposer,
  writesLanded,
  test,
  expect,
  chooseInSelect,
  createTripViaWizard,
  openTripView,
  visiblePage as visible,
} from '../fixtures'
import { PATH } from '../routes'
import { createItem } from '../helpers/m9'
import { addBuyRowOnM4, setMemberInM5, startTrip } from '../helpers/m4'
import { setDateField } from '../helpers/ionic'

/**
 * M6 — the shopping list (UI-Test-Spec §6, FR-30).
 *
 * The shopping list is a module of its own since FR-30 (ADR-066): it holds
 * entries typed into it, which are on the shopping list only, and it shows the
 * packing list's rows in a buy mode, which stay packing rows. Every case here
 * reaches a packing row the way a person does — added on M4, given its mode in
 * M5 — because M6 no longer writes packing rows at all. The module's cases
 * live in this directory (FR-29.9's layout, first used here).
 *
 * Local Mode throughout, like the M4 suite: everything here is client-side.
 */

const TRIP = { name: 'Samedan Einkauf', endDate: '2026-12-31', travelers: ['Andy'] }

/**
 * M6 alone. ADR-012 leaves M4 mounted and *visible* behind it, so the
 * visible-page locator resolves to two pages here and every shared testid is
 * ambiguous without this.
 */
function m6(page: Page) {
  return visible(page).getByTestId('m6-page')
}

/** The entry sheet (FR-30.9); its presentation is a state, not an event. */
function sheet(page: Page) {
  return page.getByTestId('m6-entry-sheet')
}

/** One of M6's two lists, standing one under the other since 2026-09-26. */
type ListKey = 'before' | 'local'

/** One list's section — `m6-before` or `m6-local`. */
function list(page: Page, key: ListKey) {
  return m6(page).getByTestId(`m6-${key}`)
}

/**
 * A list's head: its name, and „N open" beside it while anything stands
 * under it. An exact `toHaveText` on the name alone is the zero.
 */
function head(page: Page, key: ListKey) {
  return list(page, key).getByRole('heading', { level: 2 })
}

/**
 * A list with nothing open, folded to one line at the end of the screen
 * (owner, 2026-09-26 — M25 alike): *„Before departure · nothing open"*.
 */
function restLine(page: Page, key: ListKey) {
  return list(page, key).getByTestId(`m6-${key}-fold`)
}

/**
 * Type an entry into M6's own field and commit it with the button — no
 * keyboard, which is the phone case (E2E-M6-16). Lands on the list the
 * composer's chip names; `key` presses that chip first, which is only there
 * while the trip is planned and its packing open (FR-30.8).
 */
async function addEntry(page: Page, name: string, key?: ListKey) {
  if (key) {
    const chip = m6(page).getByTestId(`m6-list-${key}`)
    await chip.click()
    await expect(chip).toHaveAttribute('aria-pressed', 'true')
  }
  await m6(page).getByTestId('m6-add-input').locator('input').fill(name)
  await m6(page).getByTestId('m6-add-submit').click()
  await expect(m6(page).getByTestId('m6-row').filter({ hasText: name })).toBeVisible()
}

/**
 * Remove an own entry the one way M6 offers since 2026-09-26: its name opens
 * its sheet, and the sheet's *Remove* takes it — the row carries no ✕.
 */
async function removeEntry(page: Page, name: string) {
  await m6(page).getByTestId('m6-row').filter({ hasText: name }).getByTestId('m6-row-label').click()
  await expect(sheet(page)).toHaveAttribute('data-presented', 'true')
  await page.getByTestId('m6-entry-remove').click()
  await expect(sheet(page)).not.toHaveAttribute('data-presented', 'true')
  await expect(m6(page).getByTestId('m6-row').filter({ hasText: name })).toHaveCount(0)
}

test.describe('M6 shopping — the list’s own entries @local @m6', () => {
  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  /**
   * E2E-M6-26 (FR-30.1): an entry typed into the shopping list is on the
   * shopping list and nowhere else. The packing list's progress is the
   * positive signal for the absence of a row there — an entry that had become
   * a packing row would count, as every free-text add on M6 did before FR-30.
   */
  test('E2E-M6-26: an entry typed on M6 is on the shopping list only (FR-30.1)', async ({
    page,
  }) => {
    await createTripViaWizard(page, TRIP)
    await addBuyRowOnM4(page, 'Sonnencreme', 'Buy there')
    await expect(visible(page).getByTestId('m4-progress')).toContainText('0/1')

    await openTripView(page, 'shopping')
    await addEntry(page, 'Milch', 'local')

    // Its own section, named; the packing row sits in the combined heading.
    const own = list(page, 'local').getByTestId('m6-group-own')
    await expect(own).toContainText('Added here')
    await expect(own.getByTestId('m6-row').locator('h3')).toHaveText(['Milch'])
    await expect(
      list(page, 'local').getByTestId('m6-row').filter({ hasText: 'Sonnencreme' }),
    ).toBeVisible()
    await expect(head(page, 'local')).toContainText('2 open')
    await expect(page.getByTestId('trip-view-shopping')).toHaveAccessibleName('Shopping (2)')

    // The packing list did not grow: one row, still the one it had.
    await page.getByTestId('header-back').click()
    await expect(visible(page).getByTestId('m4-progress')).toContainText('0/1')
    await expect(visible(page).getByTestId('m4-row-Milch')).toHaveCount(0)
    await expect(visible(page).getByTestId('m4-row-Sonnencreme')).toBeVisible()
  })

  /**
   * E2E-M6-27 (FR-30.1, FR-25.11j): an entry is bought, revealed, put back
   * and removed — and survives a reload in between, because it is a row of
   * its own table on the device rather than a screen's state. The fold under
   * its list counts what was bought and keeps its words when opened; its
   * state is `aria-expanded`. Removing is its sheet's, since the row lost its
   * ✕ (owner, 2026-09-26).
   */
  test('E2E-M6-27: an entry is bought, put back and removed, and survives a reload (FR-30.1)', async ({
    page,
  }) => {
    await createTripViaWizard(page, TRIP)
    await openTripView(page, 'shopping')
    await addEntry(page, 'Kaffee')
    await addEntry(page, 'Zucker')

    await m6(page)
      .getByTestId('m6-row')
      .filter({ hasText: 'Kaffee' })
      .locator('ion-checkbox')
      .click()
    await expect(m6(page).getByTestId('m6-row').filter({ hasText: 'Kaffee' })).toHaveCount(0)
    await expect(list(page, 'before').getByTestId('m6-bought-bar')).toHaveText('1 bought')
    await writesLanded(page)

    await page.reload()
    await expect(m6(page).getByTestId('m6-row').filter({ hasText: 'Zucker' })).toBeVisible()
    await expect(m6(page).getByTestId('m6-row').filter({ hasText: 'Kaffee' })).toHaveCount(0)
    const bar = list(page, 'before').getByTestId('m6-bought-bar')
    await expect(bar).toHaveText('1 bought')
    await expect(bar).toHaveAttribute('aria-expanded', 'false')
    await bar.click()
    await expect(bar).toHaveAttribute('aria-expanded', 'true')
    await expect(bar).toHaveText('1 bought')
    const bought = m6(page).getByTestId('m6-bought-row').filter({ hasText: 'Kaffee' })
    await expect(bought).toBeVisible()
    // It was never anywhere but here, so it names nowhere it went.
    await expect(bought.getByTestId('m6-bought-note')).toHaveCount(0)
    // FR-30.4: when it was bought — and survived the reload with it. No who:
    // Local Mode has no account to name (G-8); E2E-M6-29 names one.
    await expect(bought.getByTestId('m6-bought-stamp')).toContainText('bought · today')

    await bought.locator('ion-checkbox').click()
    await expect(m6(page).getByTestId('m6-row').filter({ hasText: 'Kaffee' })).toBeVisible()
    await expect(m6(page).getByTestId('m6-bought-bar')).toHaveCount(0)

    await removeEntry(page, 'Kaffee')
    await expect(head(page, 'before')).toContainText('1 open')
    await writesLanded(page)
    await page.reload()
    await expect(m6(page).getByTestId('m6-row').locator('h3')).toHaveText(['Zucker'])
  })

  /**
   * E2E-M6-31 (FR-30.9): an entry carries one tag, the open list is grouped
   * by it, and the check-off sits at the end of the row. What is bought is
   * not grouped — the reveal stays flat and says the tag in the row. The
   * bounding boxes are the positive signal for „right": a checkbox that had
   * stayed at the start would pass every locator and fail the geometry.
   */
  test('E2E-M6-31: entries are filed under one tag each, and the open list is grouped by it (FR-30.9)', async ({
    page,
  }) => {
    await createTripViaWizard(page, TRIP)
    await openTripView(page, 'shopping')

    // A tag made in the sheet stays a chip when nothing carries it: add an
    // entry under „Laden", remove it, and unselect the chip — it must remain.
    await m6(page).getByTestId('m6-tag-new').click()
    await expect(sheet(page)).toHaveAttribute('data-presented', 'true')
    await page.getByTestId('m6-entry-name').locator('input').fill('Probe')
    await page.getByTestId('tag-pick-search').locator('input').fill('Laden')
    await page.getByTestId('tag-pick-create').click()
    await page.getByTestId('m6-entry-confirm').click()
    await expect(sheet(page)).not.toHaveAttribute('data-presented', 'true')
    await removeEntry(page, 'Probe')
    const laden = m6(page).getByTestId('m6-tag-chip').filter({ hasText: 'Laden' })
    await expect(laden).toHaveAttribute('aria-pressed', 'true')
    await laden.click()
    await expect(laden).toHaveAttribute('aria-pressed', 'false')

    // The sheet adds an entry with its name and a tag made in it; the tag is
    // then kept for the next entry typed in the field.
    await m6(page).getByTestId('m6-tag-new').click()
    await expect(sheet(page)).toHaveAttribute('data-presented', 'true')
    await page.getByTestId('m6-entry-name').locator('input').fill('Pasta')
    await page.getByTestId('tag-pick-search').locator('input').fill('Supermarkt')
    await page.getByTestId('tag-pick-create').click()
    await page.getByTestId('m6-entry-confirm').click()
    await expect(sheet(page)).not.toHaveAttribute('data-presented', 'true')
    await expect(m6(page).getByTestId('m6-row').filter({ hasText: 'Pasta' })).toBeVisible()
    await addEntry(page, 'Brot')

    // Untagged: unselect the chip, and the next entry has no tag at all.
    const chip = m6(page).getByTestId('m6-tag-chip').filter({ hasText: 'Supermarkt' })
    await chip.click()
    await expect(chip).toHaveAttribute('aria-pressed', 'false')
    await addEntry(page, 'Batterien')

    const supermarkt = m6(page).getByTestId('m6-group-tag-Supermarkt')
    await expect(supermarkt.locator('h3')).toHaveText(['Brot', 'Pasta'])
    await expect(m6(page).getByTestId('m6-group-own').locator('h3')).toHaveText(['Batterien'])

    // Edit through the sheet: the title and a new tag; A–Z puts it first.
    await m6(page)
      .getByTestId('m6-row')
      .filter({ hasText: 'Batterien' })
      .getByTestId('m6-row-label')
      .click()
    await expect(sheet(page)).toHaveAttribute('data-presented', 'true')
    await expect(page.getByTestId('m6-entry-name').locator('input')).toHaveValue('Batterien')
    await page.getByTestId('m6-entry-name').locator('input').fill('Batterien AA')
    await page.getByTestId('tag-pick-search').locator('input').fill('Baumarkt')
    await page.getByTestId('tag-pick-create').click()
    await page.getByTestId('m6-entry-confirm').click()
    await expect(sheet(page)).not.toHaveAttribute('data-presented', 'true')
    await expect(m6(page).getByTestId('m6-group-tag-Baumarkt').locator('h3')).toHaveText([
      'Batterien AA',
    ])
    await expect(m6(page).getByTestId('m6-group-own')).toHaveCount(0)
    await expect(list(page, 'before').locator('ion-item-group').first()).toHaveAttribute(
      'data-testid',
      'm6-group-tag-Baumarkt',
    )

    // The check-off is right of the name.
    const row = m6(page).getByTestId('m6-row').filter({ hasText: 'Brot' })
    const box = await row.locator('ion-checkbox').boundingBox()
    const label = await row.locator('h3').boundingBox()
    expect(box!.x).toBeGreaterThan(label!.x + label!.width)

    // Bought: leaves its group, and the flat reveal names the tag.
    await row.locator('ion-checkbox').click()
    await expect(supermarkt.locator('h3')).toHaveText(['Pasta'])
    await list(page, 'before').getByTestId('m6-bought-bar').click()
    await expect(m6(page).getByTestId('m6-bought-row').getByTestId('m6-bought-tag')).toHaveText([
      'Supermarkt',
    ])
    await expect(m6(page).getByTestId('m6-bought-list').locator('ion-item-group')).toHaveCount(0)

    // The tags survive a reload — they are a column of the row.
    await writesLanded(page)
    await page.reload()
    await expect(m6(page).getByTestId('m6-group-tag-Supermarkt').locator('h3')).toHaveText([
      'Pasta',
    ])
    await expect(m6(page).getByTestId('m6-group-tag-Baumarkt')).toBeVisible()
  })

  /**
   * E2E-M6-32 (FR-30.9): several own entries — already tagged or not — are
   * retagged in one act, entered inline on the list itself rather than
   * through a separate selection screen like M9's own (FR-24.9): a shopping
   * row is not a navigation link, so a long press fights no tap the way it
   * would there. `contextmenu` stands in for the hold, the same substitution
   * M4's own row-menu case makes (`helpers/m4.ts`'s `openRowMenu`).
   */
  test('E2E-M6-32: several entries, already tagged or not, are retagged in one act (FR-30.9)', async ({
    page,
  }) => {
    await createTripViaWizard(page, TRIP)
    await openTripView(page, 'shopping')
    await addEntry(page, 'Brot')
    await addEntry(page, 'Mückenspray')

    await m6(page)
      .getByTestId('m6-row')
      .filter({ hasText: 'Mückenspray' })
      .getByTestId('m6-row-label')
      .click()
    await page.getByTestId('tag-pick-search').locator('input').fill('Apotheke')
    await page.getByTestId('tag-pick-create').click()
    await page.getByTestId('m6-entry-confirm').click()
    await expect(sheet(page)).not.toHaveAttribute('data-presented', 'true')

    // A long press on the untagged row enters the mode with it pre-selected.
    await m6(page)
      .getByTestId('m6-row')
      .filter({ hasText: 'Brot' })
      .getByTestId('m6-row-label')
      .dispatchEvent('contextmenu')
    await expect(page.getByTestId('m6-selbar')).toBeVisible()
    await expect(m6(page).getByTestId('m6-row-check-Brot')).toHaveClass(/on/)

    // „Alle N" takes the already-tagged one too — the reach FR-30.9 added
    // over M9's own selection mode, which never offered a retag.
    await page.getByTestId('m6-select-all').click()
    await expect(page.getByTestId('m6-select-count')).toContainText('2')

    await m6(page).getByTestId('m6-bulk-tag').click()
    await expect(page.getByTestId('m6-bulk-sheet')).toHaveAttribute('data-presented', 'true')
    await expect(page.getByTestId('m6-bulk-title')).toContainText('2')
    await page.getByTestId('tag-pick-search').locator('input').fill('Reise')
    await page.getByTestId('tag-pick-create').click()

    // The mode ends with the batch, and both now share the new tag.
    await expect(page.getByTestId('m6-selbar')).toHaveCount(0)
    await expect(m6(page).getByTestId('m6-group-tag-Reise').locator('h3')).toHaveText([
      'Brot',
      'Mückenspray',
    ])

    // The toast's undo puts both back exactly where they were. Scoped to
    // `.pack-toast`, the app's one undo-snackbar style (found 2026-09-22: a
    // shopping toast without it silently fell back to Ionic's stock, barely
    // readable palette, and no assertion here would have caught it).
    await page.locator('ion-toast.pack-toast').getByRole('button', { name: 'Undo' }).click()
    await expect(m6(page).getByTestId('m6-group-tag-Apotheke').locator('h3')).toHaveText([
      'Mückenspray',
    ])
    await expect(m6(page).getByTestId('m6-group-own').locator('h3')).toHaveText(['Brot'])
  })

  /**
   * E2E-M6-33 (FR-25.11j): a bought row leaves the open list with a smooth
   * effect rather than vanishing, and its own toast — not a trip through the
   * reveal bar — is the fast way to take a mistap back. M4's own shape
   * (`presentToast` with a button), not the dashboard card's inline panel,
   * which exists only because several cards share that page.
   */
  test('E2E-M6-33: a bought row leaves smoothly, with its own undo (FR-25.11j)', async ({
    page,
  }) => {
    await createTripViaWizard(page, TRIP)
    await openTripView(page, 'shopping')
    await addEntry(page, 'Kaffee')

    await m6(page)
      .getByTestId('m6-row')
      .filter({ hasText: 'Kaffee' })
      .locator('ion-checkbox')
      .click()
    await expect(m6(page).getByTestId('m6-row').filter({ hasText: 'Kaffee' })).toHaveCount(0)

    // Scoped to `.pack-toast`, the app's one undo-snackbar style — see the
    // same note on E2E-M6-32.
    const toast = page.locator('ion-toast.pack-toast')
    await expect(toast).toContainText('“Kaffee” bought')
    await toast.getByRole('button', { name: 'Undo' }).click()
    await expect(m6(page).getByTestId('m6-row').filter({ hasText: 'Kaffee' })).toBeVisible()
    // Brought back by the toast alone — the reveal was never opened.
    await expect(m6(page).getByTestId('m6-bought-bar')).toHaveCount(0)
  })

  /**
   * E2E-M6-34 (FR-30.9): one own entry, lifted by its grip and dropped onto
   * another own section, is retagged in one act — the gesture the bulk sheet
   * gives a batch of one. The mechanics are `useDragToGroup`'s own (FR-7.8,
   * `TripTasksPage.vue`'s `E2E-M25-08`/`E2E-M25-09`); this only proves the
   * shopping list wired it up: which section a drop lands in, and which one
   * it never can — a packing-projected line's own heading files nothing
   * under a tag, so it is never a target either.
   */
  test('E2E-M6-34: a grip drags one entry into another tag, and refuses a heading it cannot honestly hold (FR-30.9)', async ({
    page,
  }) => {
    await createTripViaWizard(page, TRIP)
    await addBuyRowOnM4(page, 'Sonnencreme', 'Buy before')
    await openTripView(page, 'shopping')
    await addEntry(page, 'Brot')
    await addEntry(page, 'Mückenspray')

    await m6(page)
      .getByTestId('m6-row')
      .filter({ hasText: 'Mückenspray' })
      .getByTestId('m6-row-label')
      .click()
    await page.getByTestId('tag-pick-search').locator('input').fill('Apotheke')
    await page.getByTestId('tag-pick-create').click()
    await page.getByTestId('m6-entry-confirm').click()
    await expect(sheet(page)).not.toHaveAttribute('data-presented', 'true')

    const host = m6(page)
    await expect(host).toHaveAttribute('data-drag', 'idle')

    // A packing row has nothing to drag either — a dashed placeholder
    // rather than an empty gap (owner feedback 2026-09-23), and the same
    // refusal named once in words below the list.
    const sunscreenRow = host.getByTestId('m6-row').filter({ hasText: 'Sonnencreme' })
    await expect(sunscreenRow.getByTestId(/^m6-row-grip-/)).toHaveCount(0)
    await expect(sunscreenRow.locator('.drag-grip.off')).toBeVisible()
    await expect(host.getByTestId('m6-drag-hint')).toBeVisible()

    // Refused: the packing row's own combined heading carries no tag of its own.
    const grip = host.getByTestId('m6-row-grip-Brot')
    const fromPacking = host.getByTestId('m6-group-packing')
    await expect(fromPacking).toHaveAttribute('data-droppable', 'false')
    let g = (await grip.boundingBox())!
    let target = (await fromPacking.boundingBox())!
    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2)
    await page.mouse.down()
    await expect(host).toHaveAttribute('data-drag', 'dragging')
    // A heading that can never take this drop dims for as long as one is
    // in the air, rather than sitting inert next to the one that lit up.
    await expect(fromPacking).toHaveCSS('opacity', '0.5')
    await page.mouse.move(target.x + target.width / 2, target.y + 10, { steps: 8 })
    await expect(fromPacking).not.toHaveAttribute('data-drop-over', '')
    await page.mouse.up()
    await expect(host).toHaveAttribute('data-drag', 'idle')
    await expect(fromPacking).toHaveCSS('opacity', '1')
    await expect(host.getByTestId('m6-group-own')).toContainText('Brot')

    // Accepted: dropped onto the already-tagged group, it takes that tag.
    const apotheke = host.getByTestId('m6-group-tag-Apotheke')
    g = (await grip.boundingBox())!
    target = (await apotheke.boundingBox())!
    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2)
    await page.mouse.down()
    // The shared frame (`composables/dragToGroup.css`, unified with
    // `TripTasksPage.vue`'s own drag 2026-09-23) still reaches this page's
    // ghost now that it moved out of this component's own scoped style.
    await expect(page.locator('[data-drag-ghost]')).toHaveCSS('border-style', 'solid')
    await page.mouse.move(target.x + target.width / 2, target.y + 10, { steps: 8 })
    await expect(apotheke).toHaveAttribute('data-drop-over', '')
    // The heading says so out loud, too — not only the highlight the CSS
    // gate would already catch.
    await expect(apotheke.getByText('drop here')).toHaveCSS('opacity', '1')
    await expect(fromPacking.getByText('drop here')).toHaveCSS('opacity', '0')
    await page.mouse.up()
    await expect(host).toHaveAttribute('data-drag', 'idle')
    await expect(apotheke.locator('h3')).toHaveText(['Brot', 'Mückenspray'])

    // The toast's own undo puts it back where it was.
    const toast = page.locator('ion-toast.pack-toast')
    await expect(toast).toContainText('“Brot” → Apotheke')
    await toast.getByRole('button', { name: 'Undo' }).click()
    await expect(host.getByTestId('m6-group-own')).toContainText('Brot')
    await expect(apotheke.locator('h3')).toHaveText(['Mückenspray'])
  })

  /**
   * E2E-M6-35 (FR-30.10): an entry names the day it is due — FR-7.11's day
   * for a task, on the shopping list.
   *
   * The day is set in the entry's own sheet and written on *Save*, so the
   * promises are asserted on the list: the line wears the day in words
   * (*Tomorrow*), and the dated entry leads the screen — since 2026-09-26 a
   * line due within two days leaves its group for the *Due* block on top,
   * which names the group it left — while *Brot*, undated, stays where it
   * was. A reload proves the write, not the repaint. Then M1: the card
   * under the trip leads with it and wears the same pill, and Local Mode's
   * stand-in for the push says once, when the app opens, that it is due — the
   * trip is started first, because M1 counts the active trips.
   */
  test('E2E-M6-35: a due day is set in the sheet, leads the list and the dashboard, and is said when the app opens (FR-30.10)', async ({
    page,
  }) => {
    const name = 'Samedan Fällig'
    await createTripViaWizard(page, { ...TRIP, name })
    await startTrip(page)
    await openTripView(page, 'shopping')
    // Running: at the destination is the list M1's card reads (FR-30.8), and
    // the only one the composer still files on — no list chips to press.
    await expect(m6(page).getByTestId('m6-composer')).toBeVisible()
    await expect(m6(page).getByTestId('m6-composer-list')).toHaveCount(0)
    await addEntry(page, 'Brot')
    await addEntry(page, 'Pasta')

    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const iso = [
      tomorrow.getFullYear(),
      String(tomorrow.getMonth() + 1).padStart(2, '0'),
      String(tomorrow.getDate()).padStart(2, '0'),
    ].join('-')

    await m6(page)
      .getByTestId('m6-row')
      .filter({ hasText: 'Pasta' })
      .getByTestId('m6-row-label')
      .click()
    await expect(sheet(page)).toHaveAttribute('data-presented', 'true')
    await setDateField(page, 'm6-entry-due', iso)
    await page.getByTestId('m6-entry-confirm').click()
    await expect(sheet(page)).not.toHaveAttribute('data-presented', 'true')

    const pill = m6(page).getByTestId('m6-row-due-Pasta')
    await expect(pill).toHaveText('Tomorrow')
    await expect(pill).toHaveAttribute('data-due', 'soon')
    await expect(m6(page).getByTestId('m6-row-due-Brot')).toHaveCount(0)
    const due = m6(page).getByTestId('m6-due')
    await expect(due.locator('h3')).toHaveText(['Pasta'])
    await expect(due.getByTestId('m6-row-tag-Pasta')).toHaveText('Added here')
    await expect(list(page, 'local').getByTestId('m6-group-own').locator('h3')).toHaveText(['Brot'])
    // On top: the block stands above the list it came from.
    const [block, local] = [(await due.boundingBox())!, (await list(page, 'local').boundingBox())!]
    expect(block.y + block.height).toBeLessThanOrEqual(local.y)
    await writesLanded(page)

    await page.reload()
    await expect(m6(page).getByTestId('m6-row-due-Pasta')).toHaveText('Tomorrow')
    await expect(m6(page).getByTestId('m6-due').locator('h3')).toHaveText(['Pasta'])
    await expect(list(page, 'local').getByTestId('m6-group-own').locator('h3')).toHaveText(['Brot'])

    // M1: the trip's card leads with it, and the app says it once on opening.
    await page.goto(PATH.dashboard)
    await expect(page.locator('ion-toast').filter({ hasText: '1 purchase due' })).toBeVisible()
    const card = visible(page).getByTestId(`dashboard-shopping-${name}`)
    await expect(card.getByTestId('dash-shop-row').locator('.name')).toHaveText(['Pasta', 'Brot'])
    await expect(card.getByTestId('dash-shop-due-Pasta')).toHaveText('Tomorrow')
  })

  /**
   * E2E-M6-28 (FR-30.2): a packing row reaches the shopping list by its mode,
   * and leaves it the same way — it is a projection, never a copy. Setting the
   * row back to *Pack* on M5 empties the shopping list; a copy would have left
   * it there to be bought twice.
   */
  test('E2E-M6-28: a packing row is on the shopping list exactly while its mode says so (FR-30.2)', async ({
    page,
  }) => {
    await createTripViaWizard(page, TRIP)
    await addBuyRowOnM4(page, 'Adapter', 'Buy there')

    await openTripView(page, 'shopping')
    const adapter = list(page, 'local').getByTestId('m6-row').filter({ hasText: 'Adapter' })
    await expect(adapter).toBeVisible()
    // A packing row leaves by being bought or by its mode — never by a remove
    // here: its name opens no sheet (where an entry's *Remove* lives), so it
    // is not offered as a button at all.
    await expect(adapter.getByTestId('m6-row-label')).not.toHaveAttribute('role', 'button')

    await page.getByTestId('header-back').click()
    await visible(page).getByTestId('m4-row-Adapter').click()
    await page.getByTestId('m5-details').click()
    await chooseInSelect(page, 'm5-mode', 'Pack')
    await page.getByTestId('m5-close').click()
    await expect(page.getByTestId('m5-sheet')).toHaveCount(0)

    await openTripView(page, 'shopping')
    await expect(m6(page).getByTestId('m6-empty')).toBeVisible()
    await expect(m6(page).getByTestId('m6-row')).toHaveCount(0)
    await expect(page.getByTestId('trip-view-shopping')).toHaveAccessibleName('Shopping')
  })
})

/**
 * FR-25.11j: checking a packing row off a shopping list must stay reversible.
 *
 * The reveal is the only way back for a BUY_BEFORE row — buying it changes
 * its mode, so it is gone from both lists — which makes every "it disappeared"
 * assertion here worth a positive one beside it: the fold that counts what
 * disappeared, and the row it names once revealed.
 */
test.describe('M6 shopping — what was bought can be found and put back @local @m6', () => {
  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  // E2E-M6-17 (FR-25.11i/j): the BUY_BEFORE case, where checking off changes
  // the item's mode and would otherwise make the row unreachable from the
  // shopping side. The reveal is hidden by default, states its count, names
  // where the row went, and gives it back.
  test('E2E-M6-17: a purchase before departure is revealable and reversible (FR-25.11j)', async ({
    page,
  }) => {
    await createTripViaWizard(page, TRIP)
    await addBuyRowOnM4(page, 'Kaffee', 'Buy before')
    await openTripView(page, 'shopping')

    // Nothing bought yet: the bar is absent, and the open row is the signal
    // that the list itself is rendered.
    await expect(
      list(page, 'before').getByTestId('m6-row').filter({ hasText: 'Kaffee' }),
    ).toBeVisible()
    await expect(m6(page).getByTestId('m6-bought-bar')).toHaveCount(0)

    await m6(page)
      .getByTestId('m6-row')
      .filter({ hasText: 'Kaffee' })
      .locator('ion-checkbox')
      .click()

    // Gone from the open list — and counted by the line the emptied list
    // folds to (owner, 2026-09-26), which is what makes the disappearance an
    // outcome rather than a loss.
    await expect(m6(page).getByTestId('m6-row').filter({ hasText: 'Kaffee' })).toHaveCount(0)
    const bar = restLine(page, 'before')
    await expect(bar).toHaveText('Before departure · nothing open · 1 bought')
    await expect(bar).toHaveAttribute('aria-expanded', 'false')
    await expect(m6(page).getByTestId('m6-bought-list')).toHaveCount(0)

    await bar.click()
    const bought = m6(page).getByTestId('m6-bought-row')
    await expect(bought).toContainText('Kaffee')
    // FR-25.11j: the revealed row says where it went.
    await expect(bought.getByTestId('m6-bought-note')).toHaveText('on the packing list')
    // FR-30.4: the purchase keeps its time although the row is a packing row
    // again — the record lives beside `bought_from`, not in the mode.
    await expect(bought.getByTestId('m6-bought-stamp')).toContainText('bought · today')
    // Open now, and still saying what it holds rather than what it would do.
    await expect(bar).toHaveAttribute('aria-expanded', 'true')
    await expect(bar).toHaveText('Before departure · nothing open · 1 bought')

    // E2E-M6-02 (FR-3.3), and the half the note only *claims*: the row really
    // is on the packing list now. The sentence above is a string until the
    // screen it names has been looked at.
    await page.getByTestId('header-back').click()
    await expect(visible(page).getByTestId('m4-row-Kaffee')).toBeVisible()
    // E2E-FLOW-03's last clause: it arrives as something still *to* pack.
    // Being bought is not being packed, and the mode flip is the only part
    // of the row buying changes — the progress counter is where that shows,
    // since a row that arrived packed would be hidden by FR-25.2 instead.
    await expect(visible(page).getByTestId('m4-progress')).toContainText('0/1')
    await openTripView(page, 'shopping')
    await expect(bar).toBeVisible()
    await bar.click()

    // And the way back: it returns to the list it was bought from, which
    // stands in its place again.
    await bought.locator('ion-checkbox').click()
    await expect(m6(page).getByTestId('m6-row').filter({ hasText: 'Kaffee' })).toBeVisible()
    await expect(m6(page).getByTestId('m6-bought-bar')).toHaveCount(0)
    await expect(restLine(page, 'before')).toHaveCount(0)
  })

  // E2E-M6-22 (FR-3.3/25.11j): the destination list's half. A BUY_LOCAL row
  // never changes mode — being bought there *is* its packed state — so the
  // record has to name that list too, or the two lists share one reveal.
  test('E2E-M6-22: a purchase at the destination is revealed under its own list (FR-25.11j)', async ({
    page,
  }) => {
    await createTripViaWizard(page, TRIP)
    await addBuyRowOnM4(page, 'Brot vor Ort', 'Buy before')
    await addBuyRowOnM4(page, 'Milch', 'Buy there')
    await openTripView(page, 'shopping')

    const local = list(page, 'local')
    await local.getByTestId('m6-row').filter({ hasText: 'Milch' }).locator('ion-checkbox').click()

    // Nothing open is left at the destination: its line at the end counts it.
    const line = restLine(page, 'local')
    await expect(line).toHaveText('At destination · nothing open · 1 bought')
    await line.click()
    await expect(local.getByTestId('m6-bought-row')).toContainText('Milch')
    await expect(local.getByTestId('m6-bought-note')).toHaveText('packed')

    // The other list has its own fold, and nothing in it: its open row is
    // the signal that the section rendered, the fold's absence the promise.
    const before = list(page, 'before')
    await expect(before.getByTestId('m6-row').filter({ hasText: 'Brot vor Ort' })).toBeVisible()
    await expect(before.getByTestId('m6-bought-bar')).toHaveCount(0)
    await expect(m6(page).getByTestId('m6-bought-row')).toHaveCount(1)
  })
})

/**
 * FR-25.6 — a per-person item is one thing to buy.
 *
 * Built the way a person would: the item is made per-person in M5's
 * membership editor with three different amounts, and only then looked at
 * from the shop. The assertion that carries the case is that the list holds
 * **one** row where the trip holds three — under the screen this replaced it
 * held three, each with its own amount and its own check-off, and nobody had
 * seen it because nothing could produce a per-person item by hand.
 */
test.describe('M6 shopping — a per-person item is one buy row @local @m6', () => {
  const ITEM = 'Kurze Hosen'
  // No end date: the wizard's date picker is not what these cases are about,
  // and every hop through it is a step that can fail for a reason M6 does not
  // own.
  const PER_PERSON_TRIP = { name: 'Sommerferien Elba', travelers: ['Andy', 'Leonardo', 'Mia'] }

  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  /**
   * A trip whose "Kurze Hosen" is bought before departure and belongs to
   * three travelers with 2, 3 and 1 — the amounts that make one aggregated
   * row plainly right and three rows plainly wrong.
   */
  async function seedPerPersonPurchase(page: Page) {
    await createTripViaWizard(page, PER_PERSON_TRIP)
    await visible(page).getByTestId('m4-fab').click()
    await addInComposer(page, ITEM)
    await expect(visible(page).getByTestId(`m4-row-${ITEM}`)).toBeVisible()

    // The mode first, while the item is still one row: the membership
    // fan-out copies it onto the rows it creates (ADR-036).
    await visible(page).getByTestId(`m4-row-${ITEM}`).click()
    await page.getByTestId('m5-details').click()
    await chooseInSelect(page, 'm5-mode', 'Buy before')

    for (const [name, quantity] of [
      ['Andy', 2],
      ['Leonardo', 3],
      ['Mia', 1],
    ] as const) {
      await setMemberInM5(page, name, quantity)
    }
    await page.getByTestId('m5-close').click()
    await expect(page.getByTestId('m5-sheet')).toHaveCount(0)

    await openTripView(page, 'shopping')
    await expect(m6(page)).toBeVisible()
  }

  // E2E-M6-05 (FR-25.6): three instances, one row — with the summed amount
  // and the recipients derived from membership.
  test('E2E-M6-05: a per-person item is one aggregated buy row (FR-25.6)', async ({ page }) => {
    await seedPerPersonPurchase(page)

    const rows = m6(page).getByTestId('m6-row')
    await expect(rows).toHaveCount(1)
    await expect(rows.first()).toContainText(ITEM)
    await expect(rows.first()).toContainText('6×')
    // Derived, never entered (FR-25.10) — and in roster order.
    // `toContainText`: the recipients' avatars sit in the same line and
    // contribute their initials to its text.
    const forWhom = rows.first().getByTestId('m6-row-for')
    await expect(forWhom).toContainText('for Andy, Leonardo, Mia')
    // The spec promises the avatars beside the names, so they are asserted
    // rather than left to the initials the text assertion swallows.
    await expect(forWhom.getByTestId('user-avatar')).toHaveCount(3)
    // The head counts things to buy, so it agrees with what the list shows.
    await expect(head(page, 'before')).toContainText('1 open')

    // E2E-M6-08 (FR-25.10): *for whom* is derived and there is nothing here to
    // re-enter it with. The row's only control is the check-off — asserted as
    // a count rather than as an absence, so the assertion has something
    // positive to fail against.
    await expect(forWhom.locator('button, input, ion-select, ion-checkbox')).toHaveCount(0)
    await expect(rows.first().locator('ion-checkbox')).toHaveCount(1)
  })

  // E2E-M6-06 (FR-25.6/3.3): the half that matters — one act settles every
  // instance. Two instances left behind would still render a row, so the
  // list's empty hint is the positive signal that none was, and the restored 6×
  // is the positive signal that the undo took all of them with it.
  test('E2E-M6-06: checking the aggregated row off settles every instance (FR-3.3)', async ({
    page,
  }) => {
    await seedPerPersonPurchase(page)

    await m6(page).getByTestId('m6-row').locator('ion-checkbox').click()

    await expect(m6(page).getByTestId('m6-row')).toHaveCount(0)
    // With nothing open the list is one line at the end, and it counts one
    // purchase, not three.
    const line = restLine(page, 'before')
    await expect(line).toHaveText('Before departure · nothing open · 1 bought')
    await line.click()
    const bought = m6(page).getByTestId('m6-bought-row')
    await expect(bought).toHaveCount(1)
    await expect(bought.getByTestId('m6-bought-note')).toHaveText('on the packing list')

    await bought.locator('ion-checkbox').click()
    const back = m6(page).getByTestId('m6-row')
    await expect(back).toHaveCount(1)
    await expect(back.first()).toContainText('6×')
  })
})

/**
 * M6's own spine (UI-Test-Spec E2E-M6-01/03/04/16): the two lists, their
 * headings and their counts, with both kinds of line on them. The lists were
 * tabs until 2026-09-26; they now stand one under the other, each a section
 * with its own head.
 */
test.describe('M6 shopping — the two lists and their counts @local @m6', () => {
  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  test('E2E-M6-01: two lists, the packing list combined ahead of the own entries, each counting things to buy', async ({
    page,
  }) => {
    // A tagged master item; its category must not surface as a heading here
    // (revised 2026-09-23) — a packing category is not this list's tag.
    await page.goto(PATH.items)
    await createItem(page, 'Sonnencreme', { tags: ['Drogerie'] })
    await createTripViaWizard(page, TRIP)
    await addBuyRowOnM4(page, 'Sonnencreme', 'Buy before')
    await addBuyRowOnM4(page, 'Batterien', 'Buy before')
    await openTripView(page, 'shopping')
    await expect(m6(page)).toBeVisible()

    // E2E-M6-03/16: an entry of the list's own, committed by tapping the
    // button alone — the phone case, where Enter may be out of reach.
    await addEntry(page, 'Kaugummi')

    // Grouped — the row sits *inside* its group, which is the assertion the
    // promise makes; two rows on one screen prove nothing about where they sit.
    const before = list(page, 'before')
    await expect(before.getByTestId('m6-group-own').getByTestId('m6-row')).toContainText('Kaugummi')
    const packing = before.getByTestId('m6-group-packing')
    await expect(packing).toContainText('Packing list')
    await expect(packing.getByTestId('m6-row').filter({ hasText: 'Sonnencreme' })).toBeVisible()
    await expect(packing.getByTestId('m6-row').filter({ hasText: 'Batterien' })).toBeVisible()
    await expect(m6(page).getByTestId('m6-group-Drogerie')).toHaveCount(0)

    // The head counts things to buy (FR-25.6), and the other section is its
    // own list — a shared list would count three there too, and hold rows.
    await expect(head(page, 'before')).toContainText('3 open')
    await expect(restLine(page, 'local')).toHaveText('At destination · nothing open')
    await expect(list(page, 'local').getByTestId('m6-row')).toHaveCount(0)

    await addEntry(page, 'Eis', 'local')
    await expect(list(page, 'local').getByTestId('m6-row')).toHaveText([/Eis/])
    await expect(head(page, 'local')).toContainText('1 open')
    await expect(head(page, 'before')).toContainText('3 open')
  })

  /**
   * E2E-M6-36 (FR-30.8, FR-30.10; owner, 2026-09-26): M6 reads as M25 does —
   * both lists on one screen, one under the other, and what is due now in a
   * block above them both. The case the tabs got wrong: a thing due today on
   * the list not open was a thing nobody saw.
   *
   * The composer files the next entry on the list its chip names, and dates
   * it with its day chips. The entry due today stands in the *Due* block and
   * **not** under its own list — so that list's head counts nothing and it
   * also does not claim to be empty, since something of it is open, above.
   * The block names the group the line left. Then the row's lost ✕: an
   * entry is removed from its sheet, and stays removed across a reload.
   */
  test('E2E-M6-36: both lists stand on one screen, what is due today leads above them, and an entry is removed from its sheet', async ({
    page,
  }) => {
    await createTripViaWizard(page, TRIP)
    await openTripView(page, 'shopping')

    // Planned and open: the chips offer both lists, before departure first.
    await expect(m6(page).getByTestId('m6-list-before')).toHaveAttribute('aria-pressed', 'true')
    await expect(m6(page).getByTestId('m6-list-local')).toHaveAttribute('aria-pressed', 'false')
    await addEntry(page, 'Brot')

    // At the destination, due today — the day row appears once something is typed.
    const composer = m6(page).getByTestId('m6-composer')
    await composer.getByTestId('m6-list-local').click()
    await composer.getByTestId('m6-add-input').locator('input').fill('Milch')
    await expect(composer.getByTestId('m6-composer-due-chips')).toBeVisible()
    await composer.getByTestId('due-chip-today').click()
    await composer.getByTestId('m6-add-submit').click()

    const due = m6(page).getByTestId('m6-due')
    await expect(due.getByTestId('m6-row')).toHaveText([/Milch/])
    await expect(due.getByTestId('m6-row-due-Milch')).toHaveText('Today')
    await expect(due.getByTestId('m6-row-tag-Milch')).toHaveText('Added here')

    // Both lists render at once — no tab to switch.
    await expect(list(page, 'before').getByTestId('m6-row')).toHaveText([/Brot/])
    await expect(head(page, 'before')).toContainText('1 open')
    // The local list holds no row of its own: Milch stands above, not twice.
    await expect(head(page, 'local')).toHaveText('At destination')
    await expect(list(page, 'local').getByTestId('m6-row')).toHaveCount(0)
    await expect(restLine(page, 'local')).toHaveCount(0)
    // Top to bottom: the block, then before departure, then at destination.
    const box = async (el: ReturnType<typeof list>) => (await el.boundingBox())!
    const [block, before, local] = [
      await box(due),
      await box(list(page, 'before')),
      await box(list(page, 'local')),
    ]
    expect(block.y + block.height).toBeLessThanOrEqual(before.y)
    expect(before.y + before.height).toBeLessThanOrEqual(local.y)

    // Removed from its sheet; the row has no ✕ of its own.
    const brot = list(page, 'before').getByTestId('m6-row').filter({ hasText: 'Brot' })
    await expect(brot.locator('button')).toHaveCount(0)
    await removeEntry(page, 'Brot')
    await expect(restLine(page, 'before')).toHaveText('Before departure · nothing open')
    await writesLanded(page)

    await page.reload()
    await expect(m6(page).getByTestId('m6-due').getByTestId('m6-row')).toHaveText([/Milch/])
    await expect(restLine(page, 'before')).toHaveText('Before departure · nothing open')
    await expect(m6(page).getByTestId('m6-row').filter({ hasText: 'Brot' })).toHaveCount(0)
  })

  test('E2E-M6-04: an empty shopping list drops M4’s count, never the entry', async ({ page }) => {
    await createTripViaWizard(page, TRIP)

    // The destination exists either way — hiding the entry would strand M6 on
    // a trip that has yet to need it. Only the count answers to the count —
    // part of the word where the view is the current one, a badge beside its
    // glyph everywhere else (ADR-051 amendment 3); the name carries it both
    // ways.
    await expect(page.getByTestId('trip-view-shopping')).toHaveAccessibleName('Shopping')

    await openTripView(page, 'shopping')
    await expect(m6(page)).toBeVisible()
    await addEntry(page, 'Batterien')
    await expect(page.getByTestId('trip-view-shopping')).toHaveAccessibleName('Shopping (1)')
  })
})

/**
 * FR-30.6: M4's ＋ bottom right, on M6 too. The field it leads to stays at
 * the top, so the ＋ is the way back to it from a long, scrolled list — and
 * the list scrolls clear of it (E2E-M6-15, FR-25.11h's rule for M6's half).
 */
test.describe('M6 shopping — the ＋ bottom right @local @m6', () => {
  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  test('E2E-M6-15: the ＋ leads to the field, and the last row scrolls clear of it', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 700 })
    await createTripViaWizard(page, TRIP)
    await openTripView(page, 'shopping')
    const names = Array.from({ length: 14 }, (_, i) => `Artikel ${String(i + 1).padStart(2, '0')}`)
    for (const name of names) await addEntry(page, name)

    const last = m6(page).getByTestId('m6-row').last()
    await last.scrollIntoViewIfNeeded()
    // `m6-page` is the page's own ion-content.
    await m6(page).evaluate((el) =>
      (el as HTMLElement & { scrollToBottom(d: number): Promise<void> }).scrollToBottom(0),
    )
    const fab = m6(page).getByTestId('m6-fab')
    await expect(fab).toBeVisible()
    const [row, button] = [(await last.boundingBox())!, (await fab.boundingBox())!]
    expect(row.y + row.height <= button.y || row.y >= button.y + button.height).toBe(true)

    // The field is off-screen now; the ＋ brings it back and puts the cursor in it.
    const field = m6(page).getByTestId('m6-add-input').locator('input')
    await expect(field).not.toBeInViewport()
    await fab.click()
    await expect(field).toBeInViewport()
    await expect(field).toBeFocused()
    await field.fill('Zucker')
    await m6(page).getByTestId('m6-add-submit').click()
    await expect(m6(page).getByTestId('m6-row').filter({ hasText: 'Zucker' })).toBeVisible()
  })
})
