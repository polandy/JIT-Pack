/**
 * FR-25.21 — who needs an item, and how many each.
 *
 * The assertions are made on the **rendered M4 cluster**, never on a row count:
 * FR-25.8's own history records an implementation that satisfied "one row per
 * traveler" with N unrelated items sharing a name, and every count-based check
 * passed against it. What proves the feature is that the item is named *once*
 * and its children carry *different* amounts.
 */
import {
  addInComposer,
  test,
  expect,
  createTripViaWizard,
  openQuickAdd,
  visiblePage,
} from './fixtures'
import { FOR_WHOM_M5, lightTraveler, openCluster, openForWhom, setMemberInM5 } from './helpers/m4'
import { createMasterItem } from './helpers/templates'
import type { Page } from '@playwright/test'
import { PATH } from './routes'

const TRIP = { name: 'Sommerferien Elba', travelers: ['Andy', 'Leonardo', 'Mia'] }
const ITEM = 'Kurze Hosen'

/** A trip with a roster and one shared, ad-hoc row to make per-person. */
async function seedTrip(page: Page) {
  await createTripViaWizard(page, TRIP)
  await openQuickAdd(page)
  await addInComposer(page, ITEM)
  await expect(page.getByTestId(`m4-row-${ITEM}`)).toBeVisible()
}

/**
 * Open M5 on the item, where the for-whom strip carries a stepper per person
 * (FR-25.28).
 */
async function openItem(page: Page, itemName: string) {
  await visiblePage(page).getByTestId(`m4-row-${itemName}`).click()
  await expect(page.getByTestId('m5-sheet')).toBeVisible()
  await expect(page.getByTestId(`for-whom-strip-${FOR_WHOM_M5}`)).toBeVisible()
}

async function closeItem(page: Page) {
  await page.getByTestId('m5-close').click()
  await expect(page.getByTestId('m5-sheet')).toHaveCount(0)
}

const m5Amount = (page: Page, name: string) =>
  page.getByTestId(`for-whom-qty-${FOR_WHOM_M5}-${name}`)
const m5Summary = (page: Page) => page.getByTestId(`for-whom-summary-${FOR_WHOM_M5}`)

test.describe('FR-25.21 membership with per-person amounts @local @m5', () => {
  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  test('E2E-M5-18: three travelers, three different amounts, one cluster', async ({ page }) => {
    await seedTrip(page)

    await openItem(page, ITEM)
    await setMemberInM5(page, 'Andy', 2)
    await setMemberInM5(page, 'Leonardo', 3)
    await setMemberInM5(page, 'Mia', 1)
    await expect(m5Summary(page)).toContainText('6')
    await closeItem(page)

    // The item is named once — the cluster head — with one child per traveler.
    const list = visiblePage(page)
    await expect(list.getByTestId(`m4-cluster-${ITEM}`)).toBeVisible()
    // FR-25.23: shut by default, so the three amounts are one tap away.
    await openCluster(page, ITEM)
    await expect(list.getByTestId(`m4-child-${ITEM}-Andy`)).toContainText('0/2')
    await expect(list.getByTestId(`m4-child-${ITEM}-Leonardo`)).toContainText('0/3')
    // G-6: a quantity of one renders a checkbox rather than a stepper, so Mia's
    // amount shows as its control. That difference *is* the assertion — the
    // three children carry three different amounts.
    await expect(list.getByTestId(`m4-child-${ITEM}-Mia`).getByTestId('row-check')).toBeVisible()
    await expect(list.getByTestId(`m4-child-${ITEM}-Andy`).getByTestId('row-plus')).toBeVisible()
    // FR-25.22: the head counts units, so it is the sum of the three children
    // (2 + 3 + 1) and not a count of the people under it — which would be the
    // one line on the cluster that cannot be added up from the rest.
    await expect(list.getByTestId(`m4-cluster-${ITEM}`)).toContainText('0/6')
    // The name is not repeated as its own row beside the cluster.
    await expect(list.getByTestId(`m4-row-${ITEM}`)).toHaveCount(0)
  })

  /*
   * FR-21.16. Read off the *rendered* type, because that is the only place the
   * defect existed: both blocks used legal tokens (invariant 9b), the
   * component's own comment described the intended order correctly, and the
   * stylesheet under it did the opposite. A screenshot would catch it too, but
   * only a person comparing two baselines — this states the rule.
   */
  test('E2E-M5-24: a cluster names its item louder than its people (FR-21.16)', async ({
    page,
  }) => {
    const PLAIN = 'Zahnbürste'
    await seedTrip(page)

    await openItem(page, ITEM)
    await setMemberInM5(page, 'Andy', 1)
    await setMemberInM5(page, 'Leonardo', 1)
    await closeItem(page)

    // A plain row, to pin the head to the app's row size rather than only to
    // "bigger than its child" — which a head three steps too large also passes.
    await openQuickAdd(page)
    await addInComposer(page, PLAIN)
    const list = visiblePage(page)
    await expect(list.getByTestId(`m4-row-${PLAIN}`)).toBeVisible()

    const type = (locator: ReturnType<Page['getByTestId']>) =>
      locator.evaluate((el) => {
        const style = getComputedStyle(el)
        return { size: parseFloat(style.fontSize), weight: Number(style.fontWeight) }
      })

    await openCluster(page, ITEM)
    const head = await type(list.getByTestId(`m4-cluster-${ITEM}`).locator('.cluster-name'))
    const child = await type(list.getByTestId(`m4-child-${ITEM}-Andy`).locator('h3'))
    const plainRow = await type(list.getByTestId(`m4-row-${PLAIN}`).locator('h3'))

    // The item is what is being packed; the person only qualifies it.
    expect(head.size).toBeGreaterThan(child.size)
    expect(head.weight).toBeGreaterThan(child.weight)
    // And the head is a row name, not a size of its own.
    expect(head.size).toBe(plainRow.size)
  })

  /*
   * FR-25.21c. The tap is made from a *partial* membership carrying a chosen
   * amount, because that is the half a select-all can get wrong: the missing
   * travelers arrive at one and Leonardo's three stay three. The toggle's own
   * state is read before and after — unlit, then lit — so the case cannot
   * pass against a control that only writes and never reports.
   */
  test('E2E-M5-26: one tap adds the missing travelers and leaves a chosen amount alone', async ({
    page,
  }) => {
    await seedTrip(page)

    await openItem(page, ITEM)
    await setMemberInM5(page, 'Leonardo', 3)

    const all = page.getByTestId(`for-whom-all-${FOR_WHOM_M5}`)
    await expect(all).toHaveAttribute('aria-pressed', 'false')
    await expect(m5Amount(page, 'Andy')).toHaveCount(0)

    await all.click()

    await expect(m5Amount(page, 'Andy')).toHaveText('1')
    await expect(m5Amount(page, 'Mia')).toHaveText('1')
    await expect(m5Amount(page, 'Leonardo')).toHaveText('3')
    await expect(m5Summary(page)).toContainText('5')
    // Nothing left to add, and the toggle says so as an ordinary lit one —
    // not a faded one, which is the G-3 lock's sentence about a claimed row.
    await expect(all).toHaveAttribute('aria-pressed', 'true')
    await expect(all).toBeEnabled()

    // Tapping it again therefore has to be answerable: it changes nothing.
    await all.click()
    await expect(all).toHaveAttribute('aria-pressed', 'true')
    await expect(m5Amount(page, 'Leonardo')).toHaveText('3')
    await expect(m5Summary(page)).toContainText('5')

    await closeItem(page)

    const list = visiblePage(page)
    await openCluster(page, ITEM)
    await expect(list.getByTestId(`m4-child-${ITEM}-Andy`).getByTestId('row-check')).toBeVisible()
    await expect(list.getByTestId(`m4-child-${ITEM}-Leonardo`)).toContainText('0/3')
    await expect(list.getByTestId(`m4-cluster-${ITEM}`)).toContainText('0/5')
  })

  test('E2E-M5-19: removing a packed traveler is confirmed; removing a costless one is not', async ({
    page,
  }) => {
    await seedTrip(page)

    await openItem(page, ITEM)
    await setMemberInM5(page, 'Andy', 2)
    await setMemberInM5(page, 'Leonardo', 2)
    await setMemberInM5(page, 'Mia', 1)
    await closeItem(page)

    // Pack one of Leonardo's, so removing him would cost something.
    await openCluster(page, ITEM)
    const child = visiblePage(page).getByTestId(`m4-child-${ITEM}-Leonardo`)
    await child.getByTestId('row-plus').click()
    await expect(child).toContainText('1/2')

    // From here on the question is M4's own strip: asked under the row, in
    // place of the summary line, with the list still on the screen (FR-25.28).
    const strip = await openForWhom(page, ITEM)
    const ask = strip.getByTestId(`for-whom-ask-${ITEM}`)
    const leonardo = strip.getByTestId(`for-whom-${ITEM}-Leonardo`)
    await leonardo.click()
    await expect(ask).toContainText('Leonardo')
    await expect(ask).toContainText('1')
    await expect(page.locator('ion-alert')).toHaveCount(0)
    await expect(strip.getByTestId(`for-whom-summary-${ITEM}`)).toHaveCount(0)

    // Cancelling is the positive signal: the removal is a decision, not a side
    // effect of tapping the avatar.
    await strip.getByTestId(`for-whom-no-${ITEM}`).click()
    await expect(ask).toHaveCount(0)
    await expect(leonardo).toHaveAttribute('aria-pressed', 'true')
    await expect(child).toContainText('1/2')

    await leonardo.click()
    await strip.getByTestId(`for-whom-yes-${ITEM}`).click()
    await expect(leonardo).toHaveAttribute('aria-pressed', 'false')
    await expect(child).toHaveCount(0)

    // Two left — Andy's 2 and Mia's 1, which is what the head reports (FR-25.22).
    await expect(visiblePage(page).getByTestId(`m4-cluster-${ITEM}`)).toContainText('0/3')

    // Mia's row carries nothing — no progress, no thread, no todo — so it is
    // written without a question. The unlit toggle is the positive signal; the
    // absent question is what proves it is raised by cost and not by the
    // control. The strip is still open: the item went from a cluster to a lone
    // row under it and the strip followed (FR-25.28).
    const mia = visiblePage(page).getByTestId(`for-whom-${ITEM}-Mia`)
    await mia.click()
    await expect(mia).toHaveAttribute('aria-pressed', 'false')
    await expect(visiblePage(page).getByTestId(`for-whom-ask-${ITEM}`)).toHaveCount(0)

    // One member left: FR-25.1's flat fallback (E2E-M4-13) — an ordinary row
    // carrying the person's name, not a one-child cluster. Both halves are the
    // assertion: a cluster of one would also "show Andy" in its child.
    await expect(visiblePage(page).getByTestId(`m4-cluster-${ITEM}`)).toHaveCount(0)
    await expect(visiblePage(page).getByTestId(`m4-row-${ITEM}`)).toContainText(`${ITEM} · Andy`)
  })

  test('E2E-M5-20: collapsing back to shared sums the amounts and keeps the row', async ({
    page,
  }) => {
    await seedTrip(page)

    await openItem(page, ITEM)
    await setMemberInM5(page, 'Andy', 2)
    await setMemberInM5(page, 'Leonardo', 3)
    await closeItem(page)

    // A preparation todo on Leonardo's row (FR-7.3). It makes his the survivor
    // — content leads the ladder — and it is the thing ADR-036's keep-and-repoint
    // exists to protect: delete-and-recreate would collapse the amounts just as
    // correctly and lose this.
    const TODO = 'Groesse pruefen'
    await openCluster(page, ITEM)
    await visiblePage(page).getByTestId(`m4-child-${ITEM}-Leonardo`).click()
    await expect(page.getByTestId('m5-sheet')).toBeVisible()
    await page.getByTestId('m5-todo-input').locator('input').fill(TODO)
    await page.getByTestId('m5-todo-add').click()
    await expect(page.getByTestId('m5-sheet')).toContainText(TODO)
    await page.getByTestId('m5-close').click()
    await expect(page.getByTestId('m5-sheet')).toHaveCount(0)

    const strip = await openForWhom(page, ITEM)
    await strip.getByTestId(`for-whom-shared-${ITEM}`).click()
    // The sum, stated before it is written — not the largest.
    await expect(strip.getByTestId(`for-whom-ask-${ITEM}`)).toContainText('5')
    await visiblePage(page).getByTestId(`for-whom-yes-${ITEM}`).click()

    await expect(visiblePage(page).getByTestId(`m4-cluster-${ITEM}`)).toHaveCount(0)
    await expect(visiblePage(page).getByTestId(`m4-row-${ITEM}`)).toContainText('0/5')

    // The surviving row is the row, not a new one wearing its name.
    await visiblePage(page).getByTestId(`m4-row-${ITEM}`).click()
    await expect(page.getByTestId('m5-sheet')).toContainText(TODO)
  })
  /*
   * FR-25.28. M5 is open on *one* instance and its strip acts on all of them,
   * so it can delete the row it is standing on. Left open it reported *not
   * found* about a row the user had just asked it to remove.
   */
  test('E2E-M5-29: unlighting the traveler the sheet is open on closes the sheet', async ({
    page,
  }) => {
    await seedTrip(page)
    await openItem(page, ITEM)
    await setMemberInM5(page, 'Andy', 1)
    await setMemberInM5(page, 'Leonardo', 1)
    await closeItem(page)

    await openCluster(page, ITEM)
    await visiblePage(page).getByTestId(`m4-child-${ITEM}-Leonardo`).click()
    await expect(page.getByTestId('m5-sheet')).toBeVisible()

    // Andy's is a sibling: the sheet stays, and says so by still being here
    // with one traveler fewer lit — the positive signal the close is read against.
    await page.getByTestId(`for-whom-${FOR_WHOM_M5}-Andy`).click()
    await expect(page.getByTestId(`for-whom-${FOR_WHOM_M5}-Andy`)).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    await expect(page.getByTestId('m5-sheet')).toBeVisible()

    await lightTraveler(page, FOR_WHOM_M5, 'Andy')
    await page.getByTestId(`for-whom-${FOR_WHOM_M5}-Leonardo`).click()
    await expect(page.getByTestId('m5-sheet')).toHaveCount(0)
    await expect(page.getByTestId('m5-missing')).toHaveCount(0)
    await expect(visiblePage(page).getByTestId(`m4-row-${ITEM}`)).toContainText(`${ITEM} · Andy`)
  })
})

/**
 * FR-25.28 — who an item is for, answered on the row.
 *
 * What these two cases hold is the part no unit can see: that the strip is a
 * line of the *list*, that it survives the row under it turning into a cluster
 * and back, and that the whole decision is made without a sheet ever opening.
 */
test.describe('FR-25.28 the for-whom strip on the row @local @m4', () => {
  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  test('E2E-M4-100: the seat unfolds a strip that follows its item from row to cluster', async ({
    page,
  }) => {
    const OTHER = 'Sonnencreme'
    await seedTrip(page)
    await addInComposer(page, OTHER)
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('quick-add-input')).toBeHidden()

    const list = visiblePage(page)
    const strip = await openForWhom(page, ITEM)
    // Read at once, while the rows under it are still sliding down to make
    // room: nothing may paint over the strip. They used to, for 0.3 s, and it
    // looked like a strip too transparent to hide them (owner, 2026-09-18).
    // Green does not depend on catching the slide — a covered strip is the
    // failure whenever it is sampled.
    const covered = await strip.evaluate((el) => {
      const box = el.getBoundingClientRect()
      const hit = document.elementFromPoint(box.left + box.width / 2, box.bottom - 6)
      return hit !== null && !el.contains(hit)
    })
    expect(covered).toBe(false)
    // Sized for three (TRIP's roster): every name is spelled out, none cut.
    for (const name of TRIP.travelers) {
      const label = strip.getByTestId(`for-whom-${ITEM}-${name}`).locator('.name')
      expect(await label.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
    }
    await expect(strip.getByTestId(`for-whom-shared-${ITEM}`)).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(strip.getByTestId(`for-whom-summary-${ITEM}`)).toContainText(/Gemeinsam|Shared/)

    // One traveler: FR-25.1's flat fallback, named for its person — and the
    // strip is still there, under a row that is no longer the same row kind.
    await lightTraveler(page, ITEM, 'Andy')
    await expect(list.getByTestId(`m4-row-${ITEM}`)).toContainText(`${ITEM} · Andy`)
    await expect(strip).toBeVisible()

    // Two: the row is a cluster now, a different element under a different
    // key — and the strip is open under its head, without a second tap.
    await lightTraveler(page, ITEM, 'Mia')
    await expect(list.getByTestId(`m4-cluster-${ITEM}`)).toBeVisible()
    await expect(list.getByTestId(`m4-row-${ITEM}`)).toHaveCount(0)
    await expect(strip).toBeVisible()
    await expect(strip.getByTestId(`for-whom-shared-${ITEM}`)).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    // The seat counts who it is for; the faces are the child rows.
    await expect(list.getByTestId(`for-whom-seat-${ITEM}`)).toHaveText('2')
    // No sheet was involved in any of it.
    await expect(page.getByTestId('m5-sheet')).toHaveCount(0)
    await expect(page.locator('ion-alert')).toHaveCount(0)

    // At most one strip: another row's seat moves it rather than adding one.
    await list.getByTestId(`for-whom-seat-${OTHER}`).click()
    await expect(list.getByTestId(`for-whom-strip-${OTHER}`)).toBeVisible()
    await expect(strip).toHaveCount(0)

    // And the seat that opened it folds it.
    await list.getByTestId(`for-whom-seat-${OTHER}`).click()
    await expect(list.getByTestId(`for-whom-strip-${OTHER}`)).toHaveCount(0)
  })

  /*
   * FR-25.28's narrowing of FR-25.21 (iii). Progress is put on the row first,
   * because that is what a silent path could lose: the row is re-pointed, not
   * deleted, so the count has to come back on the shared row.
   */
  test('E2E-M4-101: the last traveler leaving makes it gemeinsam, silently, progress kept', async ({
    page,
  }) => {
    await seedTrip(page)
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('quick-add-input')).toBeHidden()

    await openItem(page, ITEM)
    await setMemberInM5(page, 'Leonardo', 3)
    await closeItem(page)
    const list = visiblePage(page)
    const lone = list.getByTestId(`m4-row-${ITEM}`)
    await lone.getByTestId('row-plus').click()
    await expect(lone).toContainText('1/3')

    const strip = await openForWhom(page, ITEM)
    await strip.getByTestId(`for-whom-${ITEM}-Leonardo`).click()

    await expect(strip.getByTestId(`for-whom-shared-${ITEM}`)).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(strip.getByTestId(`for-whom-ask-${ITEM}`)).toHaveCount(0)
    await expect(lone).toContainText('1/3')
    await expect(lone).not.toContainText('Leonardo')
  })
})

/**
 * FR-25.8 / FR-25.28 — the quick-add's own per-person path (E2E-M4-12 +
 * E2E-M4-58).
 *
 * The two spec entries name one rendered outcome and this case asserts every
 * clause of both: the head M4-12 asks for, the absence of a second top-level
 * row wearing the name — the 2026-08-07 regression, where each row was
 * individually right and only the grouping was wrong — and M4-58's differing
 * amounts on rows that have no `source_item_id`, which is what makes this the
 * case that proves the folded-name cluster key.
 */
test.describe('FR-25.8 per-person quick-add @local @m4', () => {
  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  test('E2E-M4-12, E2E-M4-58: pro Person adds one cluster, not N items sharing a name', async ({
    page,
  }) => {
    await createTripViaWizard(page, TRIP)
    await openQuickAdd(page)

    // FR-25.28: who the add is for is said over the field, before it.
    const forWhom = page.getByTestId('quick-add-for-whom-summary')
    await expect(page.getByTestId('for-whom-shared-quick-add')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await lightTraveler(page, 'quick-add', 'Andy')
    await lightTraveler(page, 'quick-add', 'Leonardo')
    await expect(forWhom).toContainText('2')
    await addInComposer(page, ITEM)

    // No editor follows the add: the cluster is simply there, and the composer
    // still holds the choice for the next row of the run.
    await expect(visiblePage(page).getByTestId(`m4-cluster-${ITEM}`)).toBeVisible()
    await expect(page.locator('ion-modal.show-modal')).toHaveCount(0)
    await expect(page.getByTestId('m5-sheet')).toHaveCount(0)
    await expect(page.getByTestId('for-whom-quick-add-Andy')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('quick-add-input')).toBeHidden()

    // Both arrive at one; the differing amounts are set where M5 carries a
    // stepper per person — on rows that have no master item behind them.
    await openCluster(page, ITEM)
    await visiblePage(page).getByTestId(`m4-child-${ITEM}-Andy`).click()
    await expect(page.getByTestId('m5-sheet')).toBeVisible()
    for (const [name, clicks] of [
      ['Andy', 1],
      ['Leonardo', 2],
    ] as const) {
      for (let n = 0; n < clicks; n += 1) {
        await page.getByTestId(`for-whom-plus-${FOR_WHOM_M5}-${name}`).click()
        await expect(m5Amount(page, name)).toHaveText(String(n + 2))
      }
    }
    await closeItem(page)

    const list = visiblePage(page)
    // The cluster was opened above; open, its head says done/total.
    await expect(list.getByTestId(`m4-cluster-${ITEM}`)).toContainText('0/5')
    await expect(list.getByTestId(`m4-child-${ITEM}-Andy`)).toContainText('0/2')
    await expect(list.getByTestId(`m4-child-${ITEM}-Leonardo`)).toContainText('0/3')
    // Each child carries its own working control (E2E-M4-12), not one shared
    // by the cluster: two rows reading 0/2 and 0/3 could still be drawn by a
    // head that packs them together.
    await expect(list.getByTestId(`m4-child-${ITEM}-Andy`).getByTestId('row-plus')).toBeVisible()
    await expect(
      list.getByTestId(`m4-child-${ITEM}-Leonardo`).getByTestId('row-plus'),
    ).toBeVisible()
    // Mia was never lit, so she has no row at all — a quantity of 0 would
    // be FR-5.5's *skipped*, which is a different statement (FR-25.21).
    await expect(list.getByTestId(`m4-child-${ITEM}-Mia`)).toHaveCount(0)
    // The name is not repeated as a top-level row beside the cluster.
    await expect(list.getByTestId(`m4-row-${ITEM}`)).toHaveCount(0)
  })

  test('E2E-M4-64: with nobody to distribute over, the strip is absent (G-8)', async ({ page }) => {
    await createTripViaWizard(page, { name: 'Solo', travelers: ['Andy'] })
    await openQuickAdd(page)

    // Not disabled — absent. There is no membership to distribute, and a
    // control that can only say one thing is worse than no control.
    await expect(page.getByTestId('quick-add-for-whom')).toHaveCount(0)
    await expect(page.getByTestId('quick-add-input')).toBeVisible()

    // The same G-8 on the list: a solo trip has no *who* column at all, so its
    // rows are exactly as wide as they were. The row is the positive signal.
    await addInComposer(page, ITEM)
    await expect(visiblePage(page).getByTestId(`m4-row-${ITEM}`)).toBeVisible()
    await expect(visiblePage(page).getByTestId(`for-whom-seat-${ITEM}`)).toHaveCount(0)
  })

  /**
   * FR-25.13g/h — the whole point of the verb is that the run does not stop:
   * no editor opens, the sheet stays up, and the rows are there when it
   * closes. TRIP has exactly three travelers, so 👥 here is the same write
   * three avatar taps would make (FR-25.13h) — `assigning`, not the bulk
   * `acted` verb, precisely so the three it just picked stay deselectable
   * (found live: no way back from 👥's own "all three" once it closed the
   * row). Asserted on the rendered cluster for this file's own reason, and
   * the sheet being *visible* afterwards is the positive signal that nothing
   * was presented over it (E2E-M4-65 is the same question the other way
   * round).
   */
  test('E2E-M4-78: „für alle" gives every traveler a row without leaving the sheet', async ({
    page,
  }) => {
    await createMasterItem(page, 'Sonnenhut')
    await createTripViaWizard(page, TRIP)
    await openQuickAdd(page)
    await visiblePage(page).getByTestId('quick-add-browse-open').click()
    const sheet = page.getByTestId('inventory-browse-sheet')
    await expect(sheet).toBeVisible()

    const row = sheet.getByTestId('browse-row-free').filter({ hasText: 'Sonnenhut' })
    await row.getByTestId('browse-for-all').click()

    // The line says who it reached — roster order, the same label an avatar
    // tap would leave (FR-25.13h).
    await expect(sheet.getByTestId('browse-assigned-now')).toContainText('Andy, Leonardo, Mia')
    // Every avatar it just selected is still there and still deselectable —
    // the exact thing 👥's old bulk verb took away.
    await expect(row.getByTestId('browse-assign-Andy')).toHaveClass(/selected/)
    await expect(row.getByTestId('browse-assign-Leonardo')).toHaveClass(/selected/)
    await expect(row.getByTestId('browse-assign-Mia')).toHaveClass(/selected/)
    await expect(sheet).toBeVisible()

    await sheet.getByTestId('browse-close').click()
    await expect(sheet).toHaveCount(0)
    const list = visiblePage(page)
    await openCluster(page, 'Sonnenhut')
    for (const traveler of TRIP.travelers) {
      await expect(list.getByTestId(`m4-child-Sonnenhut-${traveler}`)).toBeVisible()
    }
    // Named once: three rows sharing a name is the shape FR-25.8 forbids.
    await expect(list.getByTestId('m4-row-Sonnenhut')).toHaveCount(0)
  })

  /**
   * The same verb on a line the trip already carries — the correction for a
   * shared row that turns out to be everybody's (ADR-036 keep-and-repoint).
   * Within one run of the sheet a line the run itself added offers the way
   * *back* and nothing else, so the sheet is closed and reopened here, which
   * is also the state a second visit is in.
   */
  test('E2E-M4-79: „für alle" spreads a row the trip already carries', async ({ page }) => {
    await createMasterItem(page, 'Sonnenhut')
    await createTripViaWizard(page, TRIP)
    await openQuickAdd(page)
    await visiblePage(page).getByTestId('quick-add-browse-open').click()
    const sheet = page.getByTestId('inventory-browse-sheet')
    await sheet.getByTestId('browse-row-free').filter({ hasText: 'Sonnenhut' }).click()
    await expect(sheet.getByTestId('browse-added-now')).toBeVisible()
    await sheet.getByTestId('browse-close').click()
    await expect(sheet).toHaveCount(0)
    await expect(visiblePage(page).getByTestId('m4-row-Sonnenhut')).toBeVisible()

    await visiblePage(page).getByTestId('quick-add-browse-open').click()
    await expect(sheet).toBeVisible()
    await sheet
      .getByTestId('browse-row-carried')
      .filter({ hasText: 'Sonnenhut' })
      .getByTestId('browse-for-all')
      .click()
    await expect(sheet.getByTestId('browse-for-all-now')).toContainText('3')

    await sheet.getByTestId('browse-close').click()
    await expect(sheet).toHaveCount(0)
    const list = visiblePage(page)
    await openCluster(page, 'Sonnenhut')
    for (const traveler of TRIP.travelers) {
      await expect(list.getByTestId(`m4-child-Sonnenhut-${traveler}`)).toBeVisible()
    }
    // The shared row is gone as a row of its own: it *became* one of the three
    // (ADR-036), rather than being left beside them.
    await expect(list.getByTestId('m4-row-Sonnenhut')).toHaveCount(0)
  })

  /*
   * E2E-M4-65 is retired with the promise it held: a per-person add from the
   * browse-sheet had to close the sheet first, because the membership editor
   * that followed was a modal that rendered behind it. No editor follows any
   * more (FR-25.28). What replaces it is the opposite rule, below.
   */
  test('E2E-M4-102: a browse-sheet add is deaf to the strip and the sheet stays up', async ({
    page,
  }) => {
    await page.goto(PATH.items)
    await page.getByTestId('m9-fab').click()
    await page.getByTestId('m10-name').locator('input').fill('Sonnenhut')
    await page.getByTestId('m10-create').click()
    await expect(page.getByTestId('header-title')).toHaveText('Sonnenhut')

    await createTripViaWizard(page, TRIP)
    await openQuickAdd(page)
    await lightTraveler(page, 'quick-add', 'Andy')
    await visiblePage(page).getByTestId('quick-add-browse-open').click()
    const sheet = page.getByTestId('inventory-browse-sheet')
    await expect(sheet).toBeVisible()
    await sheet.getByTestId('browse-row').filter({ hasText: 'Sonnenhut' }).click()

    // One door per surface: the sheet's lines answer *for whom* themselves
    // (FR-25.13g/h), so a tap there must not obey a control the sheet is
    // covering. The shared row is the positive signal that the add landed —
    // the absent `· Andy` is read against it.
    await expect(sheet).toBeVisible()
    await sheet.getByTestId('browse-close').click()
    await expect(sheet).toHaveCount(0)
    const added = visiblePage(page).getByTestId('m4-row-Sonnenhut')
    await expect(added).toBeVisible()
    await expect(added).not.toContainText('Andy')
    await expect(visiblePage(page).getByTestId('m4-cluster-Sonnenhut')).toHaveCount(0)
  })

  /**
   * FR-25.13h — the browse-sheet's per-traveler avatar buttons, up to three
   * travelers, multi-select. TRIP has exactly three, so this is also the
   * boundary the long-press menu takes over above.
   */
  test('E2E-M4-80: avatar buttons multi-select — tap adds, a second tap on the same one removes', async ({
    page,
  }) => {
    await createMasterItem(page, 'Sonnenhut')
    await createTripViaWizard(page, TRIP)
    await openQuickAdd(page)
    await visiblePage(page).getByTestId('quick-add-browse-open').click()
    const sheet = page.getByTestId('inventory-browse-sheet')
    const row = sheet.getByTestId('browse-row-free').filter({ hasText: 'Sonnenhut' })
    await expect(row).toBeVisible()

    // 👥 is still there and still one tap, exactly as FR-25.13g left it — the
    // avatar buttons are an addition, not a replacement.
    await expect(row.getByTestId('browse-for-all')).toBeVisible()
    await row.getByTestId('browse-assign-Leonardo').click()

    await expect(sheet.getByTestId('browse-assigned-now')).toContainText('Leonardo')
    // The row stays `browse-row-free` — unlike every other verb, this one
    // has to keep the avatar buttons reachable for a second tap.
    await expect(row).toHaveAttribute('data-testid', 'browse-row-free')

    // A second traveler joins the same row instead of starting a new one.
    await row.getByTestId('browse-assign-Mia').click()
    await expect(sheet.getByTestId('browse-assigned-now')).toContainText('Leonardo, Mia')

    // Tapping the first traveler again takes just that one back off.
    await row.getByTestId('browse-assign-Leonardo').click()
    await expect(sheet.getByTestId('browse-assigned-now')).toContainText('Mia')
    await expect(sheet.getByTestId('browse-assigned-now')).not.toContainText('Leonardo')

    await sheet.getByTestId('browse-close').click()
    await expect(sheet).toHaveCount(0)

    // Named once, not a cluster: one traveler ended up on the row, not a
    // spread — the shape FR-25.13g's own case would leave behind instead.
    const list = visiblePage(page)
    await expect(list.getByTestId('m4-row-Sonnenhut')).toBeVisible()
    await expect(list.getByTestId('m4-cluster-Sonnenhut')).toHaveCount(0)
  })

  /**
   * FR-25.13h above three travelers: the line keeps FR-25.13g's shape and a
   * long press on 👥 opens the menu instead. `dispatchEvent('contextmenu')`
   * is the same seam `E2E-M7-04` drives — the handler a real touch long-press
   * fires into, without a real-time 500 ms hold (see `useLongPress`).
   */
  test('E2E-M4-81: a long press on 👥 opens a menu above three travelers', async ({ page }) => {
    const FOUR = { name: 'Familienskiwoche', travelers: ['Andy', 'Leonardo', 'Mia', 'Theo'] }
    // Both items exist before the trip, so the run stays inside one open
    // sheet (FR-25.13d) rather than leaving M4 mid-test to create the second.
    await createMasterItem(page, 'Sonnenhut')
    await createMasterItem(page, 'Sonnenschirm')
    await createTripViaWizard(page, FOUR)
    await openQuickAdd(page)
    await visiblePage(page).getByTestId('quick-add-browse-open').click()
    const sheet = page.getByTestId('inventory-browse-sheet')
    const hutRow = sheet.getByTestId('browse-row-free').filter({ hasText: 'Sonnenhut' })
    await expect(hutRow).toBeVisible()

    // No avatar buttons at four — the line stays exactly the shape E2E-M4-78
    // renders it in, room for 👥/✓/✕ and nothing else.
    await expect(hutRow.getByTestId(/^browse-assign-/)).toHaveCount(0)

    await hutRow.getByTestId('browse-for-all').dispatchEvent('contextmenu')
    const menu = page.locator('ion-action-sheet')
    await expect(menu).toBeVisible()
    await menu.getByRole('button', { name: 'Theo' }).click()
    await expect(sheet.getByTestId('browse-assigned-now')).toContainText('Theo')
    // The outgoing sheet stays in the DOM (`overlay-hidden`) through its
    // dismiss animation; `openTravelerMenu`'s own re-entrancy guard means a
    // long press in that window is a no-op, not a second overlay — so the
    // second press has to wait for the first sheet to actually be gone
    // rather than racing it (a settled-state wait, not a timing guess).
    await expect(menu).toHaveCount(0)

    // FR-25.13h's multi-select over the menu too: a second long press picks
    // a second traveler for the *same* row — an action sheet has no way to
    // show a pick as already selected, so this path only ever adds.
    // `hutRow` still resolves it: an `assigning` line keeps `browse-row-free`
    // rather than moving to `browse-row-carried` the way `acted` lines do
    // (E2E-M4-78/79's reason) — it has to stay reachable for the next pick.
    await hutRow.getByTestId('browse-for-all').dispatchEvent('contextmenu')
    await expect(menu).toBeVisible()
    await menu.getByRole('button', { name: 'Mia' }).click()
    // Roster order (Andy, Leonardo, Mia, Theo), not tap order — the label is
    // built by filtering the roster to the selected set, so it stays stable
    // regardless of which traveler was picked first.
    await expect(sheet.getByTestId('browse-assigned-now')).toContainText('Mia, Theo')

    // The plain tap on a different line still means „für alle" —
    // unconditionally, whichever gesture the line beside it just took.
    await sheet
      .getByTestId('browse-row-free')
      .filter({ hasText: 'Sonnenschirm' })
      .getByTestId('browse-for-all')
      .click()
    await expect(sheet.getByTestId('browse-for-all-now')).toContainText('4')
  })
})

/**
 * FR-25.21 / FR-5.5 — a conversion never leaves a row claiming a state its own
 * numbers no longer support.
 *
 * The route is FR-25.13f's ✕ (*„zu Hause gelassen"*), which writes quantity 0
 * and state *skipped*, followed by FR-25.8's per-person mode, whose smallest
 * membership is 1. Before this rule the row came back with quantity 1 and the
 * skipped state intact — and `isDone` reads *skipped* as done, so FR-25.2 took
 * the row straight off the list. The assertion is therefore that the row is
 * **on the list**: an invisible row is the defect, and only a visible one
 * disproves it.
 */
test.describe('FR-25.21 the state follows the numbers @local @m5', () => {
  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  test('E2E-M5-21: taking a skipped row along again is asked, then visible', async ({ page }) => {
    await page.goto(PATH.items)
    await page.getByTestId('m9-fab').click()
    await page.getByTestId('m10-name').locator('input').fill(ITEM)
    await page.getByTestId('m10-create').click()
    await expect(page.getByTestId('header-title')).toHaveText(ITEM)

    await createTripViaWizard(page, TRIP)
    await openQuickAdd(page)
    await visiblePage(page).getByTestId('quick-add-browse-open').click()
    const sheet = page.getByTestId('inventory-browse-sheet')
    await sheet
      .getByTestId('browse-row-free')
      .filter({ hasText: ITEM })
      .getByTestId('browse-skip')
      .click()
    await sheet.getByTestId('browse-close').click()
    await expect(sheet).toHaveCount(0)
    // Not Escape: the sheet's teardown leaves focus outside the composer.
    await page.getByTestId('quick-add-close').click()
    await expect(page.getByTestId('quick-add-input')).toBeHidden()

    // A skipped row is a done row (FR-25.2), so it is revealed first.
    await page.getByTestId('m4-done-bar').click()
    const strip = await openForWhom(page, ITEM)
    const andy = strip.getByTestId(`for-whom-${ITEM}-Andy`)
    await andy.click()

    // The decision is undone as a side effect of a toggle, so it is asked —
    // in the strip — and cancelling is the positive signal that the question
    // is a gate: the avatar stays unlit.
    const ask = strip.getByTestId(`for-whom-ask-${ITEM}`)
    await expect(ask).toContainText(ITEM)
    await strip.getByTestId(`for-whom-no-${ITEM}`).click()
    await expect(ask).toHaveCount(0)
    await expect(andy).toHaveAttribute('aria-pressed', 'false')

    await andy.click()
    // The button names what it does (FR-25.28), never *OK*.
    await expect(strip.getByTestId(`for-whom-yes-${ITEM}`)).toHaveText(
      /Doch einpacken|Pack it after all/,
    )
    await strip.getByTestId(`for-whom-yes-${ITEM}`).click()
    await expect(visiblePage(page).getByTestId(`for-whom-${ITEM}-Andy`)).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    // On the list, not hidden as a done row.
    await expect(visiblePage(page).getByTestId(`m4-row-${ITEM}`)).toContainText(`${ITEM} · Andy`)
  })

  /**
   * E2E-M4-14 (FR-25.1/25.2): packing one instance leaves the cluster standing.
   *
   * The rule — decide cluster-vs-flat over the *full* set, not over what is
   * currently on screen — is unit-tested twice in `domain/packingView.spec.ts`.
   * What no unit can see is M4's own wiring: the screen holds two sets, the
   * full one and the hidden-done one, and handing the wrong one to the view
   * builder restructures the list under the user's finger mid-tap. Andy's row
   * would become a flat „Kurze Hosen · Andy" the instant Leonardo's was packed,
   * moving the control the finger is already on.
   */
  test('E2E-M4-14: packing one instance of a cluster does not flatten the other', async ({
    page,
  }) => {
    await seedTrip(page)

    await openItem(page, ITEM)
    await setMemberInM5(page, 'Andy', 1)
    await setMemberInM5(page, 'Leonardo', 1)
    await closeItem(page)

    const list = visiblePage(page)
    await openCluster(page, ITEM)
    await expect(list.getByTestId(`m4-cluster-${ITEM}`)).toContainText('0/2')

    await list.getByTestId(`m4-child-${ITEM}-Leonardo`).getByTestId('row-check').click()

    // The packed child drops out (FR-25.2), and the head still counts over the
    // full set — so the number goes up rather than the denominator down.
    await expect(list.getByTestId(`m4-child-${ITEM}-Leonardo`)).toHaveCount(0)
    await expect(list.getByTestId(`m4-cluster-${ITEM}`)).toContainText('1/2')

    // The assertion this case exists for: Andy's instance is still a *child*.
    // A flat row would also be visible and also say "Andy", so the negative
    // half — no top-level row by that name — is what carries it.
    await expect(list.getByTestId(`m4-child-${ITEM}-Andy`)).toBeVisible()
    // The flat row is testid'd by the item *name* (the „· Andy" is only in the
    // label), so this one locator is the whole negative half.
    await expect(list.getByTestId(`m4-row-${ITEM}`)).toHaveCount(0)
  })

  /*
   * FR-25.23. The cost the fold was bought with is that a cluster no longer
   * shows its people, so the shut head has to answer for them — and the two
   * halves are asserted together here because passing either one alone is
   * what a half-built fold looks like: children gone with nothing in their
   * place, or a head that summarises rows it never hid.
   *
   * It is an e2e case rather than a unit because the fold is state on the
   * screen, not in the view model: `ClusterHead` renders whatever `collapsed`
   * it is handed, and a unit of it cannot tell whether M4 hands it back the
   * value its own click asked for.
   */
  test('E2E-M4-82: a per-person cluster starts shut and answers for the rows it hides', async ({
    page,
  }) => {
    await seedTrip(page)

    await openItem(page, ITEM)
    await setMemberInM5(page, 'Andy', 2)
    await setMemberInM5(page, 'Leonardo', 3)
    await closeItem(page)

    const list = visiblePage(page)
    const head = list.getByTestId(`m4-cluster-${ITEM}`)

    // Shut is the default — the defect FR-25.23 answers is that the head used
    // to be one line *more* than the rows, never one instead of them.
    await expect(head).toHaveAttribute('aria-expanded', 'false')
    await expect(list.getByTestId(`m4-child-${ITEM}-Andy`)).toHaveCount(0)
    await expect(list.getByTestId(`m4-child-${ITEM}-Leonardo`)).toHaveCount(0)

    // Shut, it says who — one face per instance, in roster order — and how
    // much is left, in units rather than people (FR-25.22).
    await expect(head.getByTestId('user-avatar')).toHaveCount(2)
    await expect(head.getByTestId('user-avatar').nth(0)).toHaveAttribute('aria-label', 'Andy')
    await expect(head.getByTestId('user-avatar').nth(1)).toHaveAttribute('aria-label', 'Leonardo')
    await expect(head).toContainText('5 open')

    // Opening it hands the statement back to the children, so the head stops
    // making it twice.
    await head.click()
    await expect(head).toHaveAttribute('aria-expanded', 'true')
    await expect(list.getByTestId(`m4-child-${ITEM}-Andy`)).toContainText('0/2')
    await expect(list.getByTestId(`m4-child-${ITEM}-Leonardo`)).toContainText('0/3')
    await expect(head.getByTestId('user-avatar')).toHaveCount(0)
    await expect(head).toContainText('0/5')

    // And it shuts again: a one-way control is a reveal, not a fold.
    await head.click()
    await expect(head).toHaveAttribute('aria-expanded', 'false')
    await expect(list.getByTestId(`m4-child-${ITEM}-Andy`)).toHaveCount(0)
  })

  /*
   * FR-25.30. Filtered to one traveler — the FR-25.29 ring is the tap that
   * does it — a shut cluster with one person left in it is a fold around a
   * single row, and ticking your own socks cost opening it first. The case
   * never taps the head: the check it reaches for is the positive signal that
   * no fold stood in front of it, and the negative half (no cluster, no
   * children) is what separates a plain row from an opened cluster.
   *
   * The filter is cleared afterwards because that is the half a unit cannot
   * see: M4 has to hand the view builder the facet, not a list it already
   * narrowed, or the cluster would not come back for the others.
   */
  test('E2E-M4-113: filtered to one traveler, their instance is a plain row ticked without opening', async ({
    page,
  }) => {
    await seedTrip(page)

    await openItem(page, ITEM)
    await setMemberInM5(page, 'Andy', 1)
    await setMemberInM5(page, 'Leonardo', 2)
    await closeItem(page)

    const list = visiblePage(page)
    await expect(list.getByTestId(`m4-cluster-${ITEM}`)).toBeVisible()

    const andy = list.getByTestId('m4-traveler-progress-Andy')
    await andy.click()
    await expect(andy).toHaveAttribute('aria-pressed', 'true')

    // A plain row, not a cluster and not an opened one — and it does not say
    // „· Andy", which the chip row already says.
    const row = list.getByTestId(`m4-row-${ITEM}`)
    await expect(row).toBeVisible()
    await expect(list.getByTestId(`m4-cluster-${ITEM}`)).toHaveCount(0)
    await expect(list.getByTestId(`m4-child-${ITEM}-Andy`)).toHaveCount(0)
    await expect(row).not.toContainText('Andy')

    await row.getByTestId('row-check').click()
    await expect(row).toHaveCount(0)
    await expect(page.getByTestId('m4-progress')).toContainText('1/3')

    // Clearing the filter brings the cluster back for the people still open,
    // with Andy's face among them as dealt with.
    await andy.click()
    await expect(andy).toHaveAttribute('aria-pressed', 'false')
    const head = list.getByTestId(`m4-cluster-${ITEM}`)
    await expect(head).toBeVisible()
    await expect(head).toContainText('2 open')
    await expect(head.getByTestId('user-avatar')).toHaveCount(2)
  })

  /*
   * FR-25.26. The head is the only line that knows an item is one thing
   * several people carry, so it is where „everybody packs this on the morning
   * we leave" can be said once. What no unit can see is that the flag reached
   * each *instance*: `clusterActions` is tested against a list of instances,
   * and M4's own wiring is what turns a head into that list — a fan-out that
   * wrote the head's first row twice would satisfy every unit in the change.
   *
   * The per-instance assertion is therefore made in M5, one child at a time,
   * rather than on the head — the head paints its ⏰ when *any* instance
   * carries the flag (FR-25.23), so it is green on a fan-out that reached one
   * row of two.
   */
  test('E2E-M4-88: the cluster head sets the late-packer flag on every instance', async ({
    page,
  }) => {
    await seedTrip(page)

    await openItem(page, ITEM)
    await setMemberInM5(page, 'Andy', 1)
    await setMemberInM5(page, 'Leonardo', 1)
    await closeItem(page)

    const list = visiblePage(page)
    const head = list.getByTestId(`m4-cluster-${ITEM}`)
    await expect(head.getByTestId('row-late')).toHaveCount(0)

    await head.dispatchEvent('contextmenu')
    const menu = page.locator('ion-action-sheet')
    await expect(menu).toBeVisible()
    // The scope is stated before the action: a shut head hides the rows it
    // is about to write.
    await expect(menu).toContainText('2 rows')
    await menu.getByRole('button', { name: /late packer on for everyone/i }).click()
    await expect(menu).toHaveCount(0)

    await expect(head.getByTestId('row-late')).toBeVisible()

    await openCluster(page, ITEM)
    for (const traveler of ['Andy', 'Leonardo']) {
      await list.getByTestId(`m4-child-${ITEM}-${traveler}`).getByRole('heading').click()
      await expect(page.getByTestId('m5-sheet')).toBeVisible()
      await expect(page.getByTestId('m5-sheet')).toContainText(/late packer/i)
      await page.getByTestId('m5-close').click()
      await expect(page.getByTestId('m5-sheet')).toHaveCount(0)
    }

    // And back off again, which is the half a one-way fan-out would fail:
    // with every instance flagged the head offers the way out, not the way in.
    await head.dispatchEvent('contextmenu')
    await expect(menu).toBeVisible()
    await menu.getByRole('button', { name: /late packer off for everyone/i }).click()
    await expect(menu).toHaveCount(0)
    await expect(head.getByTestId('row-late')).toHaveCount(0)
  })
})
