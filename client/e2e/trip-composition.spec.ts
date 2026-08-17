import { test, expect } from './fixtures'
import {
  addPosition,
  backToTemplateList as backToList,
  createTemplate,
  includeGroup,
  visiblePage as visible,
} from './fixtures'
import type { Page } from '@playwright/test'

/**
 * M3 step 3 — generating a trip from a *composed* template (§3.27).
 *
 * Covers E2E-M3-11 (the two scopes as separate sections, and a composition
 * that resolves for real: deduped count, merge named with both groups) and
 * E2E-M3-13 (the FR-27.7 task count in the preview, and the task arriving on
 * the generated row as an FR-7.3 todo).
 *
 * Local Mode throughout, and deliberately: generation, include expansion and
 * task materialisation all run client-side (invariant 4), so the mode without
 * a server is the one where a missing client rule shows up. It is also the
 * strictest check that nothing here quietly needs a round trip.
 */

/** One group under one Vorlage — the least composition a case can need. */
async function seedOneGroup(page: Page) {
  await page.goto('/tabs/templates')

  await createTemplate(page, 'group', 'Makro')
  await addPosition(page, 'Kamera')
  await addPosition(page, 'Makro-Objektiv')
  await backToList(page)

  await createTemplate(page, 'template', 'Fototage')
  await includeGroup(page, 'Makro')
  await backToList(page)
}

/** The owner's scenario: two photo groups sharing a camera, under one Vorlage. */
async function seedComposition(page: Page) {
  await page.goto('/tabs/templates')

  await createTemplate(page, 'group', 'Makro')
  await addPosition(page, 'Kamera')
  await addPosition(page, 'Makro-Objektiv')
  await backToList(page)

  await createTemplate(page, 'group', 'Wildlife')
  await addPosition(page, 'Kamera')
  await addPosition(page, 'Teleobjektiv')
  await backToList(page)

  await createTemplate(page, 'template', 'Fototage')
  await includeGroup(page, 'Makro')
  await includeGroup(page, 'Wildlife')
  await backToList(page)
}

/** Hang an FR-27.7 preparation task off the Kamera position of a group. */
async function addTaskToPosition(page: Page, group: string, item: string, task: string) {
  await page.goto('/tabs/templates')
  // Filter to the Gruppen scope first: in "Alle" a Ferien-Vorlage row lists
  // the groups it contains, so a row filtered by the group's name would match
  // the Vorlage above it.
  await visible(page).getByTestId('m7-scope-group').click()
  await visible(page).locator('ion-item').filter({ hasText: group }).first().click()
  await expect(page.getByTestId('header-title')).toHaveText(group)

  await visible(page).locator('ion-item').filter({ hasText: item }).first().click()
  const composer = page.getByTestId('m8-task-input').locator('input')
  await composer.fill(task)
  await composer.press('Enter')
  await expect(page.getByTestId('m8-task-row')).toContainText(task)
  await page.getByTestId('m8-position-close').click()
}

/**
 * Walk M3 to step 3 with a name and nothing else — the FR-2.1b minimum.
 *
 * The wait between filling and clicking is load-bearing, not decoration:
 * `fill()` resolves once the input holds the text, while step 1's gate opens
 * only after Vue has handled `ionInput`. Clicking straight after the fill is a
 * race that loses under parallel load — Playwright finds the ion-button
 * "visible, enabled and stable", clicks the disabled control inside it, and
 * then waits out the full timeout. The gate's own aria state is the signal
 * that the model caught up (the same seam E2E-M3-01 uses).
 */
async function wizardToStepThree(page: Page, name: string) {
  await page.goto('/trips/new')
  await page.getByTestId('wizard-name').locator('input').fill(name)
  await expect(page.getByTestId('wizard-next')).not.toHaveAttribute('aria-disabled', 'true')
  await page.getByTestId('wizard-next').click()
  await expect(page.getByTestId('wizard-step-2')).toBeVisible()
  await page.getByTestId('wizard-next').click()
  await expect(page.getByTestId('wizard-step-3')).toBeVisible()
}

test.describe('M3 step 3 — composed templates (§3.27)', () => {
  // Spec §2.4 forbids injecting preconditions, so each case builds a template,
  // its groups and their positions by driving M7/M8 — far more UI work than a
  // unit that only reads a screen. On WebKit that lands near the 30 s default,
  // and crossing it under parallel load produced failures at whatever step the
  // clock happened to run out on. Declaring the budget is the honest fix; the
  // alternative is a suite that fails by arithmetic rather than by defect.
  test.slow()

  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  test('E2E-M3-11: the scopes are separate sections, and a Vorlage resolves through its groups', async ({
    page,
  }) => {
    await seedComposition(page)
    await wizardToStepThree(page, 'Fototour 2026')

    // FR-27.6: two sections, each holding only its own scope. Asserted on the
    // row titles, not on the section text: since FR-27.12 a Vorlage's row also
    // *names its items*, so "Makro-Objektiv" legitimately appears under
    // Ferien-Vorlagen and a substring check would read that as a stray group.
    const vorlagen = visible(page).getByTestId('wizard-section-templates')
    const gruppen = visible(page).getByTestId('wizard-section-groups')
    await expect(vorlagen.locator('ion-item h3')).toHaveText(['Fototage'])
    await expect(gruppen.locator('ion-item h3')).toHaveText(['Makro', 'Wildlife'])

    // FR-27.2: the Vorlage owns no positions of its own — its count is what
    // the composition resolves to. Before include expansion this read "0".
    await expect(vorlagen).toContainText('3 items')

    await vorlagen.locator('ion-checkbox').first().click()

    // The camera arrives once, and the preview says which groups asked for it.
    await expect(visible(page).getByTestId('wizard-item-count')).toContainText('3 items')
    const merges = visible(page).getByTestId('wizard-merges')
    await expect(merges).toContainText('Kamera')
    await expect(merges).toContainText('Makro & Wildlife')

    // Both groups are already on board — the rows say so rather than letting
    // a second tap look like it added something.
    await expect(gruppen).toContainText('already included via “Fototage”')
  })

  test('E2E-M3-17: a group row says what is in it, and the chevron shows the rest', async ({
    page,
  }) => {
    await seedComposition(page)
    await wizardToStepThree(page, 'Fototour 2026')

    const gruppen = visible(page).getByTestId('wizard-section-groups')
    // C: the row answers the easy case without a tap — ordered by item name.
    await expect(gruppen).toContainText('Kamera · Makro-Objektiv')

    // A: the chevron opens the read-only sheet on the resolved content. The
    // testid carries the template's uuid, so the row is found by its name.
    await gruppen.locator('ion-item').filter({ hasText: 'Makro' }).first().locator('button').click()
    const sheet = page.getByTestId('group-peek-sheet')
    await expect(sheet.getByTestId('group-peek-name')).toHaveText('Makro')
    await expect(sheet.getByTestId('group-peek-line')).toHaveCount(2)

    // A look, not an editor: close is the only thing it offers.
    await expect(sheet.locator('button')).toHaveCount(1)
    await sheet.getByTestId('group-peek-close').click()
    await expect(page.locator('ion-modal.show-modal')).toHaveCount(0)

    // The draft survived — which is the whole point of not leaving for M8.
    await expect(visible(page).getByTestId('wizard-step-3')).toBeVisible()
  })

  test('E2E-M3-18: a row dropped in the review lands as skipped, not missing (FR-2.6/5.5)', async ({
    page,
  }) => {
    await seedComposition(page)
    await wizardToStepThree(page, 'Fototour 2026')
    await visible(page)
      .getByTestId('wizard-section-templates')
      .locator('ion-checkbox')
      .first()
      .click()
    await page.getByTestId('wizard-next').click()
    await expect(page.getByTestId('wizard-step-4')).toBeVisible()

    const before = await visible(page).getByTestId('wizard-review-row').count()
    const camera = visible(page)
      .getByTestId('wizard-review-row')
      .filter({ hasText: 'Kamera' })
      .first()
    await camera.getByTestId('wizard-review-drop').click()

    // Still on the review — the decision is visible rather than a row quietly
    // gone — and the count stops including what is no longer coming.
    await expect(visible(page).getByTestId('wizard-review-row')).toHaveCount(before)
    const dropped = await page.getByTestId('wizard-create').textContent()

    // Reversible, and *asserted* by taking it back rather than by the presence
    // of a button: a restore that did nothing would pass that.
    await camera.getByTestId('wizard-review-restore').click()
    await expect(camera.getByTestId('wizard-review-drop')).toBeVisible()
    await expect(page.getByTestId('wizard-create')).not.toHaveText(dropped ?? '')

    // Drop it again — this is the state the trip is created from.
    await camera.getByTestId('wizard-review-drop').click()
    await expect(page.getByTestId('wizard-create')).toHaveText(dropped ?? '')

    await page.getByTestId('wizard-create').click()
    await expect(page.getByTestId('header-title')).toHaveText('Fototour 2026')

    // On the trip it is *skipped*, not absent: FR-25.2 hides it with the done
    // rows, and revealing them shows it. A deleted row would teach the next
    // trip nothing (FR-5.5).
    await expect(visible(page).getByText('Kamera')).toHaveCount(0)
    await visible(page).getByTestId('m4-done-bar').click()
    await expect(visible(page).getByText('Kamera').first()).toBeVisible()
  })

  test('E2E-M3-13: a position task is previewed and lands as a prep todo on the generated row', async ({
    page,
  }) => {
    await seedOneGroup(page)
    await addTaskToPosition(page, 'Makro', 'Kamera', 'Akkus laden')
    await wizardToStepThree(page, 'Fototour 2026')

    // Nothing picked yet: the preview has no task to report.
    await expect(visible(page).getByTestId('wizard-task-count')).toHaveCount(0)

    await visible(page)
      .getByTestId('wizard-section-templates')
      .locator('ion-checkbox')
      .first()
      .click()
    await expect(visible(page).getByTestId('wizard-task-count')).toContainText('1 preparation task')

    await page.getByTestId('wizard-next').click()
    await expect(page.getByTestId('wizard-step-4')).toBeVisible()
    await page.getByTestId('wizard-create').click()
    await expect(page.getByTestId('header-title')).toHaveText('Fototour 2026')

    // FR-27.7 on the trip: an ordinary FR-7.3 todo, on the row it came from,
    // counted in the header and listed in the prep section.
    await expect(visible(page).getByTestId('m4-header')).toContainText('1 preparation open')
    const prep = visible(page).getByTestId('m4-prep-section')
    await prep.getByTestId('m4-prep-toggle').click()
    await expect(prep).toContainText('Kamera')
    await expect(prep).toContainText('Akkus laden')

    // Only the position that carries the task gets one — the other row of the
    // composition stays clean.
    await expect(prep.locator('ion-item')).toHaveCount(1)
  })
})
