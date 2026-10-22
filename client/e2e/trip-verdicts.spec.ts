import type { Page } from '@playwright/test'
import {
  test,
  expect,
  addPosition,
  backToTemplateList,
  createTemplate,
  expectTripOpen,
  tripAction,
  visiblePage as visible,
} from './fixtures'
import { chooseInRowMenu, openRowMenu, row, startTrip } from './helpers/m4'
import { openGroupFromList } from './helpers/templates'
import { PATH } from './routes'

/**
 * FR-9.6 — three verdicts and a reason, across the three places that ask:
 * M4's closing pass (a skipped row offered only *missing*, and the pass's
 * own forgotten-row door landing already judged), M5's Details block (the
 * chips once the trip is archived, and the stepper *zu viel* opens), and
 * M14 (the *fewer* proposal a judged surplus writes).
 *
 * `review.spec.ts` owns the *unused* / *missing* proposal pair already; this
 * file's M14 case is the third kind, *fewer*, which needs its own fixture —
 * a group position packed beyond what `needed_quantity` later says it took.
 */

/** M3 with one named group picked in step 3 — rows arrive with provenance. */
async function tripFromGroup(page: Page, name: string, group: string): Promise<string> {
  await page.goto(PATH.newTrip)
  await page.getByTestId('wizard-name').locator('input').fill(name)
  await expect(page.getByTestId('wizard-next')).not.toHaveAttribute('aria-disabled', 'true')
  await page.getByTestId('wizard-next').click()
  await expect(page.getByTestId('wizard-step-2')).toBeVisible()
  await page.getByTestId('wizard-next').click()

  await expect(page.getByTestId('wizard-step-3')).toBeVisible()
  await visible(page)
    .getByTestId('wizard-section-groups')
    .locator('ion-item')
    .filter({ hasText: group })
    .locator('ion-checkbox')
    .first()
    .click()
  await page.getByTestId('wizard-next').click()

  await expect(page.getByTestId('wizard-step-4')).toBeVisible()
  await page.getByTestId('wizard-create').click()
  await expectTripOpen(page, name)
  return new URL(page.url()).pathname
}

/** The open row on M14, filtered by the item it proposes about. */
function openRow(page: Page, item: string) {
  return visible(page).getByTestId('m14-open-row').filter({ hasText: item })
}

test.describe('FR-9.6 — three verdicts and a reason @local', () => {
  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  // E2E-M4-160: a skipped row only gives up *missing* — it never travelled,
  // so *unused* and *zu viel* would both be judging a trip it was not on.
  // The pass's own forgotten-row door writes the same judgement in one step,
  // and both feed a *missing* proposal once the trip carries at least one
  // group-sourced row for `dominantGroup` to land on.
  test('E2E-M4-160: a skipped row offers only missing, and the forgotten door writes it pre-judged', async ({
    page,
  }) => {
    test.slow()
    await page.goto(PATH.templates)
    await createTemplate(page, 'group', 'Expedition')
    await addPosition(page, 'Kamera')
    await backToTemplateList(page)

    await tripFromGroup(page, 'Gletschertour', 'Expedition')
    await startTrip(page)

    await openRowMenu(page, 'Kamera')
    await chooseInRowMenu(page, /do not pack this/i)

    await tripAction(page, 'archive')
    await expect(visible(page).getByTestId('m4-pass-banner')).toBeVisible()

    // Untouched so far, and the forgotten row has not been added yet.
    await expect(page.getByTestId('m4-pass-verdict-Kamera')).toHaveText(/\+ verdict/i)
    await expect(page.getByTestId('m4-pass-verdict-Sonnenbrille')).toHaveCount(0)

    await page.getByTestId('m4-pass-verdict-Kamera').click()
    await expect(page.getByTestId('m4-verdict-sheet')).toBeVisible()
    // Skipped, so only the one judgement makes sense here.
    await expect(page.getByTestId('m4-verdict-missing')).toBeVisible()
    await expect(page.getByTestId('m4-verdict-unused')).toHaveCount(0)
    await expect(page.getByTestId('m4-verdict-fewer')).toHaveCount(0)

    await page.getByTestId('m4-verdict-missing').click()
    await page.getByTestId('m4-verdict-why').fill('Hätte Gletscherspalten fotografiert')
    await page.getByTestId('m4-verdict-save').click()

    await expect(page.getByTestId('m4-pass-verdict-Kamera')).toHaveText(/missing/i)
    await expect(page.getByTestId('m4-pass-reason-Kamera')).toContainText(
      'Hätte Gletscherspalten fotografiert',
    )

    // The forgotten door: a thing never on the list, written already judged.
    await page.getByTestId('m4-pass-forgotten').click()
    await page.getByTestId('m4-pass-forgotten-input').locator('input').fill('Sonnenbrille')
    await page.getByTestId('m4-pass-forgotten-submit').click()
    await expect(page.getByTestId('m4-pass-verdict-Sonnenbrille')).toHaveText(/missing/i)

    await page.getByTestId('m4-pass-finish').click()

    // Kamera's own judgement proposes nothing — its group still holds the
    // position, so FR-9.5's radar carries it forward instead. Sonnenbrille
    // has no provenance at all, so it is the one proposal this trip makes —
    // reachable only because Kamera's group-sourced row gives
    // `dominantGroup` something to land the proposal's target group on.
    await expect(visible(page).getByTestId('m14-open-count')).toBeVisible()
    await expect(openRow(page, 'Sonnenbrille')).toBeVisible()
    await expect(openRow(page, 'Kamera')).toHaveCount(0)
  })

  // E2E-M5-36: the archived trip's Details block offers all three verdicts,
  // *missing* alone disabled — a fully packed row stayed home on nobody, so
  // only the window gate, not the choice itself, keeps it off the list. The
  // stepper opens once *zu viel* is picked, and the reason lands in the
  // ordinary comment thread (`VerdictBlock.vue`'s own design: every chip
  // commits immediately, so there is no save button to find first).
  test('E2E-M5-36: M5 offers all three verdicts afterwards, and the reason joins the thread', async ({
    page,
  }) => {
    test.slow()
    await page.goto(PATH.templates)
    await createTemplate(page, 'group', 'Camp')
    await addPosition(page, 'Zelt')
    // Two were taken — `neededRange` only opens *zu viel* once the row
    // packed more than one.
    await visible(page).locator('ion-item').filter({ hasText: 'Zelt' }).first().click()
    await expect(page.getByTestId('m8-position-sheet')).toBeVisible()
    await page.getByTestId('m8-qty-inc').click()
    await expect(page.getByTestId('m8-qty')).toHaveText('2')
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('m8-position-sheet')).toHaveCount(0)
    await backToTemplateList(page)

    const path = await tripFromGroup(page, 'Hochtour', 'Camp')
    await startTrip(page)

    await row(page, 'Zelt').getByTestId('row-plus').click()
    await row(page, 'Zelt').getByTestId('row-plus').click()
    // Fully packed: FR-25.2 keeps it out of the list until revealed.
    await expect(row(page, 'Zelt')).toHaveCount(0)

    await tripAction(page, 'archive')
    await expect(visible(page).getByTestId('m4-pass-banner')).toBeVisible()
    await page.getByTestId('m4-pass-finish').click()

    await page.goto(path)
    await page.getByTestId('m4-done-bar').click()
    await row(page, 'Zelt').getByRole('heading').click()
    await expect(page.getByTestId('m5-sheet')).toBeVisible()
    await page.getByTestId('m5-details').click()

    await expect(page.getByTestId('m5-flag-unused')).toBeVisible()
    await expect(page.getByTestId('m5-flag-unused')).toBeEnabled()
    await expect(page.getByTestId('m5-flag-fewer')).toBeVisible()
    await expect(page.getByTestId('m5-flag-fewer')).toBeEnabled()
    // *Missing* stays on screen, disabled: the row was packed, so the
    // window gate — not the three-choice rule — is what is being shown.
    await expect(page.getByTestId('m5-flag-missing')).toBeVisible()
    await expect(page.getByTestId('m5-flag-missing')).toBeDisabled()

    await page.getByTestId('m5-flag-unused').click()
    await expect(page.getByTestId('m5-flag-unused')).toHaveAttribute('aria-pressed', 'true')

    // A row carries one verdict: picking *zu viel* releases *unused*.
    await page.getByTestId('m5-flag-fewer').click()
    await expect(page.getByTestId('m5-flag-unused')).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByTestId('m5-flag-fewer')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('m5-needed')).toBeVisible()

    const reason = 'Ein Zelt für zwei hätte gereicht'
    await page.getByTestId('m5-verdict-why').locator('textarea').fill(reason)
    await page.getByTestId('m5-verdict-why').locator('textarea').blur()
    await expect(page.getByTestId(`m5-note-${reason}`)).toBeVisible()
  })

  // E2E-M14-09: a *fewer* judgement in the closing pass is M14's third
  // proposal kind — it lowers the group's line by what went along unused,
  // rather than zeroing it (*unused*) or adding a position (*missing*).
  test('E2E-M14-09: a fewer judgement proposes the lowered quantity, with its reason', async ({
    page,
  }) => {
    test.slow()
    await page.goto(PATH.templates)
    await createTemplate(page, 'group', 'Lager')
    await addPosition(page, 'Kocher')
    await visible(page).locator('ion-item').filter({ hasText: 'Kocher' }).first().click()
    await expect(page.getByTestId('m8-position-sheet')).toBeVisible()
    await page.getByTestId('m8-qty-inc').click()
    await page.getByTestId('m8-qty-inc').click()
    await page.getByTestId('m8-qty-inc').click()
    await expect(page.getByTestId('m8-qty')).toHaveText('4')
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('m8-position-sheet')).toHaveCount(0)
    await backToTemplateList(page)

    await tripFromGroup(page, 'Herbstlager', 'Lager')
    await startTrip(page)

    await row(page, 'Kocher').getByTestId('row-plus').click()
    await row(page, 'Kocher').getByTestId('row-plus').click()
    await row(page, 'Kocher').getByTestId('row-plus').click()
    await row(page, 'Kocher').getByTestId('row-plus').click()
    await expect(row(page, 'Kocher')).toHaveCount(0)

    await tripAction(page, 'archive')
    await expect(visible(page).getByTestId('m4-pass-banner')).toBeVisible()

    await page.getByTestId('m4-pass-verdict-Kocher').click()
    await expect(page.getByTestId('m4-verdict-sheet')).toBeVisible()
    await page.getByTestId('m4-verdict-fewer').click()
    // The stepper opens on `max` (3, one below the 4 packed — ADR-103); the
    // spec's own example takes it down one more, to 2.
    await page
      .getByTestId('m4-verdict-needed')
      .getByRole('button', { name: /decrease/i })
      .click()
    const reason = 'Einer hat für das ganze Lager gekocht'
    await page.getByTestId('m4-verdict-why').fill(reason)
    await page.getByTestId('m4-verdict-save').click()
    await expect(page.getByTestId('m4-pass-verdict-Kocher')).toHaveText(/fewer/i)

    await page.getByTestId('m4-pass-finish').click()
    await expect(visible(page).getByTestId('m14-open-count')).toBeVisible()

    const proposalRow = openRow(page, 'Kocher')
    await expect(proposalRow).toContainText('fewer')
    // 4 packed, 2 needed — the group's line of 4 is proposed down to 2.
    await expect(proposalRow.getByTestId('m14-fewer-change')).toContainText('Lager')
    await expect(proposalRow.getByTestId('m14-fewer-change')).toContainText('4')
    await expect(proposalRow.getByTestId('m14-fewer-change')).toContainText('2')
    await expect(proposalRow.getByTestId('m14-reason')).toContainText(reason)

    await proposalRow.getByTestId('m14-apply').click()
    await expect(
      visible(page)
        .getByTestId('m14-handled-row')
        .filter({ hasText: 'Kocher' })
        .getByTestId('m14-state'),
    ).toContainText('applied')

    await openGroupFromList(page, 'Lager')
    const position = visible(page).locator('ion-item').filter({ hasText: 'Kocher' })
    await expect(position).toContainText('2×')
  })
})
