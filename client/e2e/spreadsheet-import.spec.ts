import {
  test,
  expect,
  seed,
  visiblePage,
  createTripViaWizard,
  chooseInSelect,
} from './fixtures'

/**
 * M15 — the mapping step's two category layouts (FR-16.1), Local Mode.
 *
 * The `single` unit owns whether an import reaches the server (E2E-M15-05).
 * What it cannot show is the *choice* between the two layouts, because it
 * drives the detected default: a sheet whose category is a column, imported
 * as if it were not, is a different plan — and a "Notes" column that the
 * detector mistakes for a category is exactly the case the picker exists for.
 */

/**
 * Two header rows, a category column, two trip columns. Written out rather
 * than shared with the `single` unit: one fixture across two projects couples
 * suites that are meant to fail independently.
 */
const CSV = [
  ',,2016,2017',
  ',,Laos,Moskau',
  'Schuhe,Wanderschuhe,1,1',
  ',Sandalen,1,',
  'Unterwäsche,Socken,9,9',
].join('\n')

async function openMapping(page: import('@playwright/test').Page) {
  await seed(page, { mode: 'local' })
  await page.goto('/import')
  await visiblePage(page).getByTestId('import-paste').locator('textarea').fill(CSV)
  await visiblePage(page).getByTestId('import-analyze').click()
  await expect(visiblePage(page).getByTestId('import-trip-2')).toBeVisible()
}

/** An inventory: a list of things, with no trip and no quantity anywhere. */
const INVENTORY_CSV = [
  'Kategorie,Artikel',
  'Schuhe,Wanderschuhe',
  ',Sandalen',
  'Bad,Handtuch',
].join('\n')

test.describe('M15 mapping — category column or category rows @local @m15', () => {
  // E2E-M15-10 (UX-6, ADR-035): the file control is the app's own button —
  // catalogue-labelled, not the browser's "Choose File / No file chosen"
  // chrome — and a picked file lands on the same path the paste area feeds.
  test('E2E-M15-10: the file control is a themed button, and a picked file lands', async ({
    page,
  }) => {
    await seed(page, { mode: 'local' })
    await page.goto('/import')
    await expect(visiblePage(page).getByTestId('import-file')).toHaveText('Choose file')
    await visiblePage(page)
      .getByTestId('import-file-input')
      .setInputFiles({ name: 'history.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) })
    await expect(visiblePage(page).getByTestId('import-paste').locator('textarea')).toHaveValue(CSV)
    await visiblePage(page).getByTestId('import-analyze').click()
    await expect(visiblePage(page).getByTestId('import-trip-2')).toBeVisible()
  })

  test('E2E-M15-06: the detected category column files the items under it', async ({ page }) => {
    await openMapping(page)

    await expect(
      visiblePage(page).getByTestId('category-column').locator('.segment-button-checked'),
    ).toHaveText('Col 1')

    await visiblePage(page).getByTestId('import-next').click()
    // Two categories from the column, and no item became one: the sheet has
    // three item rows, and "Sandalen" is packed on only one of the two trips.
    await expect(visiblePage(page).getByTestId('import-summary-line')).toContainText('2 categories')
    await expect(visiblePage(page).getByTestId('import-summary-line')).toContainText('3 new items')
  })

  test('E2E-M15-07: setting the picker back to none drops the column again', async ({ page }) => {
    await openMapping(page)

    await visiblePage(page)
      .getByTestId('category-column')
      .locator('ion-segment-button')
      .first()
      .click()
    await expect(
      visiblePage(page).getByTestId('category-column').locator('.segment-button-checked'),
    ).toHaveText('None')

    await visiblePage(page).getByTestId('import-next').click()
    // Nothing ticks the category rows in their place, so the plan carries no
    // category at all — the override is honoured rather than re-detected.
    await expect(visiblePage(page).getByTestId('import-summary-line')).toContainText('0 categories')
  })
  /**
   * E2E-M15-08 (FR-16.1): a sheet with no trip column at all imports.
   *
   * It used to be refused — the mapping demanded one included trip column —
   * so the only way to bring an inventory in was to invent a trip and delete
   * it afterwards. The landing is the other half: with no trip created, the
   * whole result is in the inventory, and the trip list would have nothing
   * to show for it.
   */
  test('E2E-M15-08: an inventory with no trip column imports into the inventory', async ({
    page,
  }) => {
    await seed(page, { mode: 'local' })
    await page.goto('/import')
    await visiblePage(page).getByTestId('import-paste').locator('textarea').fill(INVENTORY_CSV)
    await visiblePage(page).getByTestId('import-analyze').click()

    // No trip rows to tick, and the step is passable anyway.
    await expect(visiblePage(page).getByTestId('import-mapping-note')).toHaveCount(0)
    await visiblePage(page).getByTestId('import-next').click()

    await expect(visiblePage(page).getByTestId('import-summary-line')).toContainText(
      '0 archived trips',
    )
    await expect(visiblePage(page).getByTestId('import-summary-line')).toContainText('3 new items')
    await visiblePage(page).getByTestId('import-commit').click()

    // M9, not M2: the import's whole result is master data.
    await expect(visiblePage(page).getByTestId('m9-row').first()).toBeVisible()
    await expect(visiblePage(page).getByText('Wanderschuhe')).toBeVisible()
    await expect(visiblePage(page).getByText('Handtuch')).toBeVisible()
  })
})

/**
 * The classic legacy layout: category *rows* between the items, and a header
 * that names the trip columns by their year. Everything the suite drove until
 * now had its category in a column — the branch `analyzeGrid` takes when
 * `categoryColumn` is null and there is a trip column for a heading row to be
 * empty in had no rendered coverage at all.
 */
const CATEGORY_ROWS_CSV = [
  ',2016,2017',
  'Schuhe,,',
  'Wanderschuhe,1,1',
  'Sandalen,1,',
  'Bad,,',
  'Handtuch,2,2',
].join('\n')

/**
 * A trip column the sheet dates but never names. It is preselected — FR-16.1
 * only leaves out a column carrying *neither* fact — so the mapping cannot be
 * valid until the user answers for it.
 */
const UNNAMED_TRIP_CSV = [',2016,2017', ',Laos,', 'Wanderschuhe,1,1'].join('\n')

/** The near-duplicate sheet, matched against what the inventory import left. */
const DUPLICATE_CSV = [
  'Kategorie,Artikel',
  'Schuhe,Wanderschuhe',
  ',Wanderschuh',
  'Bad,Zahnbürste',
].join('\n')

test.describe('M15 — the layout, the gate and the duplicates @local @m15', () => {
  /**
   * E2E-M15-11 (FR-16.1/16.2, FR-24.2): the category-*row* layout, end to end.
   *
   * The write half and the read half are two behaviours. Every other M15 case
   * in this file stops at the summary line, and the one that commits (M15-08)
   * imports a sheet with no category rows and no trip at all — so the layout
   * this wizard was built for had never produced a row anybody could see.
   */
  test('E2E-M15-11: category rows become tags, and the items land filed under them', async ({
    page,
  }) => {
    await seed(page, { mode: 'local' })
    await page.goto('/import')
    await visiblePage(page).getByTestId('import-paste').locator('textarea').fill(CATEGORY_ROWS_CSV)
    await visiblePage(page).getByTestId('import-analyze').click()

    // No category column here, so the picker is on its own "None" — the two
    // headings are claimed as rows instead.
    await expect(
      visiblePage(page).getByTestId('category-column').locator('.segment-button-checked'),
    ).toHaveText('None')

    await visiblePage(page).getByTestId('import-next').click()
    const summary = visiblePage(page).getByTestId('import-summary-line')
    // Two headings became categories and did not also become items: five
    // named rows, three of them things to pack.
    await expect(summary).toContainText('2 categories')
    await expect(summary).toContainText('3 new items')
    await expect(summary).toContainText('2 archived trips')

    await visiblePage(page).getByTestId('import-commit').click()

    // FR-16.2: archived trips, named by the only header the sheet has.
    await expect(visiblePage(page).getByTestId('trip-row-2016')).toBeVisible()
    await expect(visiblePage(page).getByTestId('trip-row-2017')).toBeVisible()

    // The read half: the heading is a tag *on the item* (FR-24.2), not merely
    // a tag that exists. Filtering to it is what tells the two apart.
    await page.getByTestId('rail-items').click()
    await visiblePage(page).getByTestId('m9-tag-chip-Schuhe').click()
    await expect(visiblePage(page).getByText('Wanderschuhe')).toBeVisible()
    await expect(visiblePage(page).getByText('Sandalen')).toBeVisible()
    await expect(visiblePage(page).getByText('Handtuch')).toHaveCount(0)
  })

  /**
   * E2E-M15-12 (FR-16.1, NFR-4.7): the mapping gate, and the include toggle
   * as the way past it.
   *
   * "Pre-validation blocks a bad file before commit" was written in 2026-07
   * and asserted nowhere — the only case that touches the note asserts its
   * *absence*. Both halves are here: the note that names what is missing, and
   * the step refusing to advance while it stands.
   */
  test('E2E-M15-12: an unnamed trip column blocks the step until it is unticked', async ({
    page,
  }) => {
    await seed(page, { mode: 'local' })
    await page.goto('/import')
    await visiblePage(page).getByTestId('import-paste').locator('textarea').fill(UNNAMED_TRIP_CSV)
    await visiblePage(page).getByTestId('import-analyze').click()

    // The note names the missing fact — there *are* rows to import, so this
    // is the mapping's own complaint and not "nothing to import".
    const note = visiblePage(page).getByTestId('import-mapping-note')
    await expect(note).toContainText('name and a year')
    await expect(visiblePage(page).getByTestId('import-next')).toHaveAttribute(
      'aria-disabled',
      'true',
    )

    // Answering it by dropping the column: FR-16.1's per-trip include toggle,
    // which nothing had ever clicked.
    await visiblePage(page).getByTestId('import-trip-2').locator('ion-checkbox').click()
    await expect(note).toHaveCount(0)

    await visiblePage(page).getByTestId('import-next').click()
    const summary = visiblePage(page).getByTestId('import-summary-line')
    await expect(summary).toContainText('1 archived trip')
    await expect(summary).toContainText('1 new item')
  })

  /**
   * E2E-NFR-07 (NFR-4.7): a file that fails pre-validation leaves nothing
   * behind, and the same file leaves something once it passes.
   *
   * NFR-4.7's "imports are transactional" is an approximation and says so
   * (the plan is validated in full before the first mutation is enqueued;
   * nothing rolls back). The clause that *is* built is therefore this one,
   * and E2E-M15-12 stops one step short of it: it asserts the step refuses
   * to advance, never that the device is unchanged behind the refusal.
   *
   * The absence needs the same event arriving somewhere else to be worth
   * anything, so the second half commits the identical sheet: what the
   * refusal withheld is exactly what the answered gate delivers.
   */
  test('E2E-NFR-07: a blocked mapping writes no rows, and the answered one writes them', async ({
    page,
  }) => {
    await seed(page, { mode: 'local' })
    await page.goto('/import')
    await visiblePage(page).getByTestId('import-paste').locator('textarea').fill(UNNAMED_TRIP_CSV)
    await visiblePage(page).getByTestId('import-analyze').click()
    await expect(visiblePage(page).getByTestId('import-next')).toHaveAttribute(
      'aria-disabled',
      'true',
    )

    // Leaving the wizard is the user's other answer to a gate, and the one
    // that would expose a half-written import: the inventory and the trip
    // list are read through their own screens, not through the wizard.
    await page.goto('/tabs/items')
    await expect(visiblePage(page).getByText('Wanderschuhe')).toHaveCount(0)
    await page.goto('/tabs/trips')
    await expect(visiblePage(page).getByTestId('trip-row-Laos')).toHaveCount(0)

    // The positive half: same sheet, gate answered, and both rows land.
    await page.goto('/import')
    await visiblePage(page).getByTestId('import-paste').locator('textarea').fill(UNNAMED_TRIP_CSV)
    await visiblePage(page).getByTestId('import-analyze').click()
    await visiblePage(page).getByTestId('import-trip-2').locator('ion-checkbox').click()
    await visiblePage(page).getByTestId('import-next').click()
    await visiblePage(page).getByTestId('import-commit').click()

    await expect(visiblePage(page).getByTestId('trip-row-Laos')).toBeVisible()
    await page.getByTestId('rail-items').click()
    await expect(visiblePage(page).getByText('Wanderschuhe')).toBeVisible()
  })

  /**
   * E2E-M15-03 (FR-16.3): step 3 decides the inventory.
   *
   * The step has existed since the wizard was built and no test had ever
   * opened it: every fixture here imports into an empty device, where there
   * is nothing to be a duplicate *of*. The inventory is built by an import of
   * its own — M15 is the screen that turns a sheet into master items, so the
   * second sheet meets exactly what the first one left.
   */
  test('E2E-M15-03: merge and keep-separate decide what the inventory gets', async ({ page }) => {
    await seed(page, { mode: 'local' })
    await page.goto('/import')
    await visiblePage(page).getByTestId('import-paste').locator('textarea').fill(INVENTORY_CSV)
    await visiblePage(page).getByTestId('import-analyze').click()
    await visiblePage(page).getByTestId('import-next').click()
    await visiblePage(page).getByTestId('import-commit').click()
    await expect(visiblePage(page).getByTestId('m9-row')).toHaveCount(3)

    /*
     * The reload is not decoration and not a wait: **the app cannot open M15
     * a second time in one session** (found by this case, 2026-08-30). The
     * commit's `router.replace` onto a tab root leaves that tab's page
     * unhidden in the root outlet, so the next push renders M15 *underneath*
     * it — proved by three probes: M2 → M15 on a fresh boot is fine, and the
     * same click after any M15 commit is not, whichever screen it landed on.
     * Open with the owner; M18's restore replaces the same way. The three
     * rows are re-asserted after it because they are also this case's settled
     * signal — the dedup step reads `master.itemList`, and a boot that has
     * not finished loading would offer no duplicates at all.
     *
     * The G-2 glyph is what makes the reload safe: in Local Mode it reads
     * `syncing` while a write is still open and `local` once the device has
     * it, so reloading on `local` cannot drop the import's last row (it did,
     * once, before this line existed).
     */
    await expect(page.getByTestId('sync-indicator')).toHaveAttribute('data-state', 'local')

    // Back through M2's own entry, so the second import is the app's own path.
    await page.getByTestId('rail-trips').click()
    await visiblePage(page).getByTestId('m2-spreadsheet-import').click()
    await visiblePage(page).getByTestId('import-paste').locator('textarea').fill(DUPLICATE_CSV)
    await visiblePage(page).getByTestId('import-analyze').click()
    await visiblePage(page).getByTestId('import-next').click()

    // Exactly the two names the inventory can answer for: the repeat and the
    // one-letter neighbour. "Zahnbürste" is nobody's near miss.
    await expect(visiblePage(page).getByTestId('import-dup-list').locator('ion-item')).toHaveCount(
      2,
    )
    await expect(visiblePage(page).getByTestId('import-dup-Wanderschuhe')).toContainText(
      'exact match',
    )

    // Both rows arrive on *merge* — the near match no less than the exact one,
    // so the switch below is a decision and not the row's own default.
    const near = visiblePage(page).getByTestId('import-dup-Wanderschuh')
    await expect(near.getByTestId('import-dup-merge')).toHaveClass(/segment-button-checked/)
    await expect(
      visiblePage(page).getByTestId('import-dup-Wanderschuhe').getByTestId('import-dup-merge'),
    ).toHaveClass(/segment-button-checked/)

    // The near one is kept apart, which is the answer the step exists to take.
    await near.getByTestId('import-dup-separate').click()
    await visiblePage(page).getByTestId('import-dup-next').click()

    const summary = visiblePage(page).getByTestId('import-summary-line')
    await expect(summary).toContainText('2 new items')
    await expect(summary).toContainText('1 merged')
    await visiblePage(page).getByTestId('import-commit').click()

    // Five rows, not four and not six: the count is what makes the merge
    // legible. "No second Wanderschuhe appeared" is equally true of an import
    // that created nothing at all.
    await expect(visiblePage(page).getByTestId('m9-row')).toHaveCount(5)
    await expect(visiblePage(page).getByText('Wanderschuh', { exact: true })).toBeVisible()
    await expect(visiblePage(page).getByText('Zahnbürste')).toBeVisible()
  })
})

/**
 * M15's three promises that the wizard has never kept (owner decision
 * 2026-08-31, backlog item 6). Each was specified, and each is about the
 * wizard *saying* something rather than doing it — the doing was already
 * built and unit-covered, which is exactly why nothing was red.
 */
test.describe('M15 — what the wizard says about what it read @local @m15', () => {
  /** A sheet with a mis-parseable shape: quoted commas and a ragged row. */
  const GRID_CSV = [
    'Kategorie,Artikel,2016',
    'Schuhe,"Wanderschuhe, hoch",1',
    ',Sandalen',
    'Bad,Handtuch,2',
  ].join('\n')

  /* NFR-4.7: the trailing '?' is the sheet's own uncertainty. */
  const NOISE_CSV = ['Artikel,2016', 'Wanderschuhe,1', 'Regenjacke?,1', 'Handtuch,1'].join('\n')

  // E2E-M15-13 (FR-16.1, ADR-041): step 1 shows the grid the parser read, before
  // anything is derived from it. The step was a file button, a paste box and
  // Analyze; the grid it promised existed nowhere, so a sheet split on the
  // wrong delimiter was invisible until the mapping step made no sense.
  test('E2E-M15-13: step 1 previews the grid the parser actually read', async ({ page }) => {
    await seed(page, { mode: 'local' })
    await page.goto('/import')
    const grid = visiblePage(page).getByTestId('import-grid')
    await expect(grid).toBeHidden()

    await visiblePage(page).getByTestId('import-paste').locator('textarea').fill(GRID_CSV)
    await expect(grid).toBeVisible()

    // The quoted comma is one cell, not two — the single thing a derived
    // list cannot show, and the reason to render the grid at all.
    await expect(grid.getByTestId('import-grid-cell-1-1')).toHaveText('Wanderschuhe, hoch')
    // A short row keeps its shape rather than shifting its neighbours left.
    await expect(grid.getByTestId('import-grid-cell-2-2')).toHaveText('')
    await expect(grid.getByTestId('import-grid-row')).toHaveCount(4)

    // Wide content scrolls inside its own box; the page never does (G-9).
    const overflowX = await grid.evaluate((el) => getComputedStyle(el).overflowX)
    expect(overflowX).toBe('auto')
  })

  // E2E-M15-02 (NFR-4.7): the wizard says what it treated as noise. The rule
  // is built and unit-covered at both levels; what was missing is the saying,
  // so the user first met the tasks inside the trip.
  test('E2E-M15-02: the wizard names the noise it handled, before committing', async ({ page }) => {
    await seed(page, { mode: 'local' })
    await page.goto('/import')
    await visiblePage(page).getByTestId('import-paste').locator('textarea').fill(NOISE_CSV)
    await visiblePage(page).getByTestId('import-analyze').click()

    const note = visiblePage(page).getByTestId('import-noise-note')
    await expect(note).toBeVisible()
    // Names the item, because "1 uncertain entry" sends the reader looking.
    await expect(note).toContainText('Regenjacke')

    await visiblePage(page).getByTestId('import-next').click()
    // The confirm counts the tasks the commit is about to write — the last
    // screen before an irreversible write says what it will do.
    await expect(visiblePage(page).getByTestId('import-summary-tasks')).toContainText('1')

    await visiblePage(page).getByTestId('import-commit').click()
    // The positive signal: the task the note promised exists on the row.
    // The commit lands on the archived segment itself (ADR-024's landing),
    // so the row is on screen without choosing a segment first.
    await visiblePage(page).getByTestId('trip-row-2016').click()
    await expect(visiblePage(page).getByTestId('m4-prep-badge-Regenjacke')).toBeVisible()
  })

  // E2E-M15-04b (FR-16.1): the confirm names each trip's target series. The
  // picker is on step 2 and the commit writes `series_id`; step 4 printed
  // trips, items, merges and categories and nothing about where they land.
  test('E2E-M15-04b: the confirm names the series each trip will join', async ({ page }) => {
    await seed(page, { mode: 'local' })
    await createTripViaWizard(page, { name: 'Voriges Jahr', series: 'Sommerferien' })

    await page.goto('/import')
    await visiblePage(page).getByTestId('import-paste').locator('textarea').fill(NOISE_CSV)
    await visiblePage(page).getByTestId('import-analyze').click()

    // Without a series chosen the row says so rather than staying silent:
    // "no series" is a destination too, and the reader is deciding.
    await visiblePage(page).getByTestId('import-next').click()
    await expect(visiblePage(page).getByTestId('import-summary-2016')).toContainText('No series')

    await visiblePage(page).getByTestId('import-back').click()
    await chooseInSelect(page, 'import-series-1', 'Sommerferien')

    await visiblePage(page).getByTestId('import-next').click()
    await expect(visiblePage(page).getByTestId('import-summary-2016')).toContainText('Sommerferien')
  })
})
