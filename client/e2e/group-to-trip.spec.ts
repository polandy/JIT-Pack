import { test, expect } from './fixtures'
import {
  addPosition,
  backToTemplateList as backToList,
  createTemplate,
  createTripViaWizard,
  openQuickAdd,
  visiblePage as visible,
} from './fixtures'
import type { Page } from '@playwright/test'

/**
 * FR-27.10 — a whole group joins a trip that already exists.
 *
 * Covers E2E-M4-26 (the composer lists groups, one tap expands the group with
 * its provenance and its FR-27.7 tasks, already-present positions are reported
 * rather than doubled) and E2E-M4-27 (the fully present group, and the
 * FR-27.4 registration that follows the add).
 *
 * Local Mode, like the FR-27.4 suite beside it: the whole resolution runs
 * client-side (invariant 4), so a missing client rule shows up here instead of
 * hiding behind a round trip.
 */

/** Type into M4's composer and read back what it offers. */
async function searchQuickAdd(page: Page, query: string) {
  await openQuickAdd(page)
  await visible(page).getByTestId('quick-add-input').locator('input').fill(query)
}

/** Add one position to an existing group through M7 → M8. */
async function addToGroup(page: Page, group: string, item: string) {
  await page.goto('/tabs/templates')
  await visible(page).getByTestId('m7-scope-group').click()
  await visible(page).locator('ion-item').filter({ hasText: group }).first().click()
  await expect(page.getByTestId('header-title')).toHaveText(group)
  await addPosition(page, item)
}

test.describe('FR-27.10 — adding a whole group to a running trip', () => {
  // Built through M7/M8/M3 per spec §2.4, which lands near the default budget
  // on WebKit: declared rather than raced.
  test.slow()

  test.beforeEach(async ({ seedMode, page }) => {
    await seedMode({ mode: 'local' })
    await page.goto('/tabs/templates')
    await createTemplate(page, 'group', 'Makro')
    await addPosition(page, 'Kamera')
    await addPosition(page, 'Stativ')
    await backToList(page)
  })

  test('E2E-M4-26: the composer offers the group, and one tap expands it', async ({ page }) => {
    // The task is added first, so the row the group generates has to carry it.
    await page.goto('/tabs/templates')
    await visible(page).getByTestId('m7-scope-group').click()
    await visible(page).locator('ion-item').filter({ hasText: 'Makro' }).first().click()
    await visible(page).locator('ion-item').filter({ hasText: 'Kamera' }).first().click()
    await expect(page.getByTestId('m8-position-sheet')).toBeVisible()
    const composer = page.getByTestId('m8-task-input').locator('input')
    await composer.fill('Akkus laden')
    await composer.press('Enter')
    await expect(page.getByTestId('m8-task-row')).toContainText('Akkus laden')
    await page.getByTestId('m8-position-close').click()

    // A trip that picked nothing: the group is a decision taken on site.
    await createTripViaWizard(page, { name: 'Fototour 2026' })

    await searchQuickAdd(page, 'Makro')
    const group = visible(page).getByTestId('quick-add-group')
    await expect(group).toHaveCount(1)
    // FR-27.12: the row answers what is inside without being opened, and
    // names the resolved position count rather than a bare "group".
    await expect(group).toContainText('Kamera')
    await expect(group).toContainText('2 positions')

    await group.click()

    // Both positions landed, once each.
    for (const name of ['Kamera', 'Stativ']) {
      await expect(visible(page).locator('ion-item').filter({ hasText: name })).toHaveCount(1)
    }
    await expect(visible(page).getByTestId('m4-progress')).toContainText('0/2')

    // The result is reported, never silent.
    await expect(page.locator('ion-toast')).toContainText('Group “Makro” added — 2 positions')

    // FR-27.7: the position's task arrives as an ordinary FR-7.3 prep todo on
    // the row it was generated for, and blocks it like a hand-added one.
    await expect(visible(page).getByTestId('m4-header')).toContainText('1 preparation open')
    const prep = visible(page).getByTestId('m4-prep-section')
    await prep.getByTestId('m4-prep-toggle').click()
    await expect(prep).toContainText('Kamera')
    await expect(prep).toContainText('Akkus laden')

    // The FR-9.1 half of the case — the added rows are *not* flagged Missing —
    // is asserted in `composables/__tests__/groupToTrip.spec.ts` instead: the
    // flag is only ever set on an **active** trip, and nothing user-facing
    // moves a trip to active yet, so an e2e assertion here would pass on a
    // planning trip whatever the production code did. It moves back here with
    // the North-Star phase transition.
  })

  test('E2E-M4-26: a position the trip already carries is reported, not doubled', async ({
    page,
  }) => {
    await createTripViaWizard(page, { name: 'Fototour 2026' })

    // Typed by hand, so the row carries no source item — the group has to
    // recognise it by name, which is the case that would double it.
    await openQuickAdd(page)
    const input = visible(page).getByTestId('quick-add-input').locator('input')
    await input.fill('Kamera')
    await input.press('Enter')
    await expect(visible(page).locator('ion-item').filter({ hasText: 'Kamera' })).toHaveCount(1)

    await input.fill('Makro')
    await visible(page).getByTestId('quick-add-group').click()

    await expect(visible(page).locator('ion-item').filter({ hasText: 'Kamera' })).toHaveCount(1)
    await expect(visible(page).locator('ion-item').filter({ hasText: 'Stativ' })).toHaveCount(1)
    await expect(page.locator('ion-toast')).toContainText('1 position, 1 already there')
  })

  test('E2E-M8-20: M8 reuses the same composer and offers no groups in it', async ({ page }) => {
    // The composer is one component with a prop, so M4 gaining groups could
    // hand them to M8 — where a group is not a position and FR-27.1 forbids
    // nesting one anyway. The absence needs a positive signal beside it: the
    // free-text hint proves the composer is open and searching, and it is the
    // line M4 *hides* when groups match, so it falls if the prop leaks.
    await page.goto('/tabs/templates')
    await visible(page).getByTestId('m7-scope-group').click()
    await visible(page).locator('ion-item').filter({ hasText: 'Makro' }).first().click()
    await expect(page.getByTestId('header-title')).toHaveText('Makro')

    await openQuickAdd(page, 'm8-fab')
    await visible(page).getByTestId('quick-add-input').locator('input').fill('Mak')

    await expect(visible(page).getByText('Add “Mak” as a new item')).toBeVisible()
    await expect(visible(page).getByTestId('quick-add-groups')).toHaveCount(0)
  })

  test('E2E-M4-27: a fully present group says so, and the trip follows it afterwards', async ({
    page,
  }) => {
    await createTripViaWizard(page, { name: 'Fototour 2026' })
    const tripPath = new URL(page.url()).pathname

    await searchQuickAdd(page, 'Makro')
    await visible(page).getByTestId('quick-add-group').click()
    await expect(visible(page).getByTestId('m4-progress')).toContainText('0/2')
    await expect(page.locator('ion-toast')).toContainText('added — 2 positions')

    // Reloaded rather than continued: a fresh document leaves no toast
    // behind, so the next assertion reads *this* add's report instead of
    // racing the previous one's three seconds.
    await page.goto(tripPath)
    await expect(page.getByTestId('header-title')).toHaveText('Fototour 2026')
    await expect(page.locator('ion-toast')).toHaveCount(0)

    // Adding it a second time adds nothing and says so, rather than being
    // silently inert — the row count is the positive half of that claim.
    await searchQuickAdd(page, 'Makro')
    await visible(page).getByTestId('quick-add-group').click()
    await expect(page.locator('ion-toast')).toContainText('already fully on the list')
    await expect(visible(page).getByTestId('m4-progress')).toContainText('0/2')

    // FR-27.4: the add registered the group as one of the trip's sources, so
    // a later edit to it reaches this trip as a question.
    await addToGroup(page, 'Makro', 'Blitz')
    await page.goto(tripPath)
    const proposal = visible(page).getByTestId('m4-group-proposal')
    await expect(proposal).toContainText('Blitz')
    await proposal.getByTestId('m4-group-proposal-apply').click()
    await expect(visible(page).locator('ion-item').filter({ hasText: 'Blitz' })).toHaveCount(1)
  })
})
