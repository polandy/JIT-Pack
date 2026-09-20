import {
  addInComposer,
  test,
  expect,
  createTripViaWizard,
  chooseInSelect,
  createMasterItem,
  openQuickAdd,
  tripAction,
  expectTripActionOffered,
  visiblePage as visible,
} from './fixtures'
import { FOR_WHOM_M5, openTripTodos } from './helpers/m4'

/**
 * M5 — item detail (UI-Test-Spec §4), rebuilt 2026-08-14 as a sheet over
 * the packing list.
 *
 * The cases are about the shape of the screen rather than its fields: it
 * opens *over* the list, it is driven by the route so a deep link and a
 * reload behave like a tap, and what it is opened for — packing, prep,
 * notes — is on the first level while the rest is folded away.
 */
const TRIP = { name: 'Samedan Sommer', endDate: '2026-12-31' }

/** `--jp-app-bar-h` (surfaces.css): the frame's bar, which the panel starts below. */
const APP_BAR_H = 56

/**
 * `path` is a URL fragment interpolated into a `RegExp`; unescaped, a future
 * path containing `?`, `.` or another metacharacter silently changes what
 * the assertion matches instead of failing loudly.
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

test.describe('M5 item detail @local @m5', () => {
  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  // E2E-M5-09 (UI-Spec M5): the sheet opens over M4 and the list stays.
  test('E2E-M5-09: opening a row shows the detail over the list, not instead of it', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 400, height: 880 })
    const path = await createTripViaWizard(page, TRIP)
    await openQuickAdd(page)
    await addInComposer(page, 'Zelt')

    await page.getByTestId('m4-row-Zelt').getByRole('heading').click()

    await expect(page.getByTestId('m5-sheet')).toBeVisible()
    await expect(page.getByTestId('m5-name')).toHaveText('Zelt')
    // The list is still there behind it — that is the point of a sheet.
    await expect(page.getByTestId('m4-header')).toBeVisible()
    // ADR-064: the desktop pane is not built at this width — not built
    // rather than not shown. The sheet and the pane render the same
    // component, so both at once is two of every control in the detail;
    // a `v-else-if` used to make that impossible structurally and the
    // teleport's own `v-if` now has to say it. Asserted here rather than
    // left to the strict-mode violation it happens to cause, which names
    // a locator rather than the rule.
    await expect(page.getByTestId('m5-panel')).toHaveCount(0)

    await page.getByTestId('m5-close').click()
    await expect(page.getByTestId('m5-sheet')).toHaveCount(0)
    await expect(page).toHaveURL(new RegExp(`${escapeRegExp(path)}$`))
  })

  // E2E-M5-10 (G-4): the route is the state, so a cold boot straight onto
  // an item opens the sheet with the list behind it and no history.
  test('E2E-M5-10: a deep link opens the detail with the list behind it', async ({ page }) => {
    await page.setViewportSize({ width: 400, height: 880 })
    const path = await createTripViaWizard(page, TRIP)
    await openQuickAdd(page)
    await addInComposer(page, 'Zelt')
    await page.getByTestId('m4-row-Zelt').getByRole('heading').click()
    const itemUrl = page.url()

    await expect(page.getByTestId('sync-indicator')).toHaveAttribute('data-state', 'local')
    await page.goto(itemUrl)

    await expect(page.getByTestId('m5-sheet')).toBeVisible()
    await expect(page.getByTestId('m5-name')).toHaveText('Zelt')

    // On a phone the sheet's own ✕ is the way out: its backdrop covers the
    // app bar, so `‹ back` is deliberately unreachable while it is up. The
    // route rule behind back is unit-tested in backTarget.spec.ts, where it
    // governs the desktop panel and the browser's own back button.
    await page.getByTestId('m5-close').click()
    // The URL alone proves nothing — a route change that does not repaint
    // keeps every URL assertion green (working agreement). The sheet must be
    // gone *and* the packing list must be the rendered page behind it.
    await expect(page.getByTestId('m5-sheet')).toHaveCount(0)
    await expect(visible(page).getByTestId('m4-header')).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`${escapeRegExp(path)}$`))
  })

  // E2E-M5-11 (UI-Spec M5 rework): first level is packing, preparation and
  // notes; every attribute is folded behind Details.
  test('E2E-M5-11: the first level carries packing, prep and notes — the rest is folded', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 400, height: 880 })
    await createTripViaWizard(page, TRIP)
    await openQuickAdd(page)
    await addInComposer(page, 'Zelt')
    await page.getByTestId('m4-row-Zelt').getByRole('heading').click()

    await expect(page.getByTestId('m5-pack')).toBeVisible()
    // UX pass 2026-08-25 (UX-10): the pack box names itself the way prep and
    // notes do — before this label it was an unlabelled box holding only a
    // checkbox and the state chip.
    await expect(page.getByTestId('m5-pack-label')).toHaveText('Packing')
    await expect(page.getByTestId('m5-todo-input')).toBeVisible()
    await expect(page.getByTestId('m5-note-input')).toBeVisible()
    // FR-25.15: the sheet confirms local capture. Silent on a sheet nobody
    // has edited (owner, 2026-09-20) — a standing ✓ confirms nothing, and it
    // made every assertion about this indicator unfalsifiable, this one
    // included: it was green before the sheet had written a thing.
    await expect(page.getByTestId('m5-sheet').getByTestId('save-indicator')).toHaveCount(0)
    await page.getByTestId('m5-pack').getByTestId('row-check').click()
    await expect(page.getByTestId('m5-sheet').getByTestId('save-indicator')).toHaveAttribute(
      'title',
      'Saved',
    )
    // …and it is what stands *instead of* a save button, so the absence is
    // asserted beside the thing that replaced it rather than on its own.
    await expect(
      page.getByTestId('m5-sheet').getByRole('button', { name: /save|commit/i }),
    ).toHaveCount(0)
    // Folded: absent, not merely out of sight.
    await expect(page.getByTestId('m5-mode')).toHaveCount(0)

    await page.getByTestId('m5-details').click()
    await expect(page.getByTestId('m5-mode')).toBeVisible()
    await expect(page.getByTestId('m5-container')).toBeVisible()
    // G-8, FR-25.28: with nobody to split the item between, the for-whom strip
    // is absent rather than a control that can only say one thing, and the
    // glance chip is what is left to say it. The chip is the positive signal
    // the absence is read against.
    await expect(page.getByTestId('m5-glance')).toContainText(/Gemeinsam|Shared/)
    await expect(page.getByTestId(`for-whom-strip-${FOR_WHOM_M5}`)).toHaveCount(0)
  })

  // E2E-M5-12 (G-9, ADR-046): above the breakpoint the same content is a
  // side panel beside the list rather than a sheet over it — and it opens
  // *on* the list the user was looking at, not on a second mount of it.
  test('E2E-M5-12: on a desktop width the detail is a side panel', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await createTripViaWizard(page, TRIP)
    await openQuickAdd(page)
    await addInComposer(page, 'Zelt')
    const listBefore = await visible(page).elementHandle()
    await visible(page).getByTestId('m4-row-Zelt').getByRole('heading').click()

    // Not scoped to the page: since 2026-09-17 the panel is the frame's
    // second pane, teleported out of the screen so it can reach the
    // window's edge. A page-scoped locator would never find it.
    await expect(page.getByTestId('m5-panel')).toBeVisible()
    await expect(visible(page).getByTestId('m4-header')).toBeVisible()
    // The page showing the panel is the very element that showed the list:
    // with the item as a path parameter, Ionic mounted a second M4 on every
    // open, and the two stood unhidden side by side for as long as the new
    // one's children took to become ready — a few frames on an idle machine,
    // over five seconds on a loaded WebKit runner, where this case failed
    // three times in a day on the scoped `m4-header` resolving to two. The
    // identity check is the deterministic form of that assertion: a second
    // mount is a different element however quickly it settles.
    const listAfter = await visible(page).elementHandle()
    expect(await listBefore!.evaluate((before, after) => before === after, listAfter)).toBe(true)
    // Deliberately *not* scoped: an IonModal is teleported out of the page,
    // so a scoped count would be 0 whether one opened or not.
    await expect(page.getByTestId('m5-modal')).toHaveCount(0)

    // G-9: the two panes do not overlap, and the panel is at the window's
    // edge. Read as boxes, because that is the promise — the previous
    // version of this case read the resolved `top` instead, and a panel
    // covering two thirds of the list satisfied it for four weeks.
    const panelBox = await page.getByTestId('m5-panel').boundingBox()
    const listBox = await visible(page).getByTestId('m4-header').boundingBox()
    const viewport = page.viewportSize()
    if (!panelBox || !listBox || !viewport) throw new Error('no box to measure')
    // Flush with the window, not with the content column: the panel is a
    // sibling of the column in the frame, so it is bounded by the window.
    expect(Math.round(panelBox.x + panelBox.width)).toBe(viewport.width)
    // And the list is beside it rather than under it — the whole point.
    expect(listBox.x + listBox.width).toBeLessThanOrEqual(panelBox.x)
    // It starts below the app bar and spans the rest of the window.
    expect(panelBox.y).toBe(APP_BAR_H)
    expect(Math.round(panelBox.y + panelBox.height)).toBe(viewport.height)
  })

  // E2E-M5-27 (ADR-064): the pane lives in the frame now, so the thing that
  // hides a screen cannot hide it. Ionic keeps a page mounted and merely
  // marks it `.ion-page-hidden`, and the pane is no longer inside that
  // element — if it did not unmount itself, it would stand over the next
  // screen. Provoked with the trip's own view switcher, which is the
  // shortest way off M4 that keeps the trip.
  test('E2E-M5-27: leaving M4 with the pane open takes the pane with it', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await createTripViaWizard(page, TRIP)
    await openQuickAdd(page)
    await addInComposer(page, 'Zelt')
    await visible(page).getByTestId('m4-row-Zelt').getByRole('heading').click()
    await expect(page.getByTestId('m5-panel')).toBeVisible()

    // Not page-scoped either: the switcher is rendered by the frame's
    // PageHead (G-9, ADR-050), so it is outside `.ion-page` too.
    await page.getByTestId('trip-view-shopping').click()

    // The positive signal that we actually left: the shopping view is the
    // rendered page. Without it an assertion that the pane is gone would
    // also pass if the navigation had simply not happened.
    await expect(visible(page).getByTestId('m6-page')).toBeVisible()
    // `toHaveCount(0)` and not `not.toBeVisible()`: the failure this guards
    // is an element that is still in the DOM and still painted.
    await expect(page.getByTestId('m5-panel')).toHaveCount(0)
  })

  // E2E-M5-28 (G-4, ADR-064): a cold boot straight onto an item at desktop
  // width. E2E-M5-10 covers the same route at phone width, where the sheet
  // is teleported by Ionic; this is the pane's own path, and it is the one
  // that needs `<Teleport defer>` — the screen and its pane mount on the
  // same tick, and without `defer` the host does not exist yet.
  test('E2E-M5-28: a deep link at desktop width opens the pane, not a sheet', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await createTripViaWizard(page, TRIP)
    await openQuickAdd(page)
    await addInComposer(page, 'Zelt')
    await visible(page).getByTestId('m4-row-Zelt').getByRole('heading').click()
    const itemUrl = page.url()

    await expect(page.getByTestId('sync-indicator')).toHaveAttribute('data-state', 'local')
    await page.goto(itemUrl)

    await expect(page.getByTestId('m5-panel')).toBeVisible()
    await expect(page.getByTestId('m5-name')).toHaveText('Zelt')
    // The pane reached the frame, not just the DOM: teleported into the
    // screen's own subtree it would render at the column's edge instead.
    const panelBox = await page.getByTestId('m5-panel').boundingBox()
    const viewport = page.viewportSize()
    if (!panelBox || !viewport) throw new Error('no box to measure')
    expect(Math.round(panelBox.x + panelBox.width)).toBe(viewport.width)
    await expect(page.getByTestId('m5-modal')).toHaveCount(0)
  })

  // E2E-M5-13 (ADR-011 §overlay): the *browser's* back with the sheet open
  // closes the sheet — like the chevron — instead of popping through the
  // replace-based history straight past M4 to the trip list. Found by the
  // owner clicking back on an item detail (2026-08-16).
  test('E2E-M5-13: browser back with the sheet open closes it, not the trip', async ({ page }) => {
    await page.setViewportSize({ width: 400, height: 880 })
    const path = await createTripViaWizard(page, TRIP)

    // The owner's history, built in-SPA — a `page.goto` here would start
    // a second document, and back across documents reboots the app
    // instead of reaching the router: list → trip → sheet.
    await page.getByTestId('header-back').click()
    await page.getByTestId('trips-filter-planned').click()
    await page.getByTestId(`trip-row-${TRIP.name}`).click()
    await openQuickAdd(page)
    await addInComposer(page, 'Zelt')
    await page.getByTestId('m4-row-Zelt').getByRole('heading').click()
    await expect(page.getByTestId('m5-sheet')).toBeVisible()
    // Settled, not arrived: back during the sheet's enter animation would
    // race Ionic's transition queue (the M7 lesson, one layer down).
    await expect(page.locator('ion-modal.show-modal')).toHaveCount(1)
    await page.waitForFunction(() =>
      document.getAnimations().every((a) => {
        if (a.playState !== 'running') return true
        // `AnimationEffect` declares no target; only `KeyframeEffect` has one,
        // and a spinner's endless rotation must not hold the wait open.
        const effect = a.effect
        const target = effect instanceof KeyframeEffect ? effect.target : null
        return target instanceof Element && target.closest('ion-spinner') !== null
      }),
    )

    await page.goBack()

    // The sheet is gone, and the *packing list* is what remains — a bug
    // here lands on /tabs/trips, two screens back.
    await expect(page.getByTestId('m5-sheet')).toHaveCount(0)
    await expect(page).toHaveURL(new RegExp(`${escapeRegExp(path)}$`))
    await expect(page.getByTestId('m4-row-Zelt')).toBeVisible()
  })

  // E2E-M5-14 (G-14/FR-21.8): the save indicator sits on the ✕'s centre
  // line. Owner-flagged on a rendered phone (2026-08-16): the ✓ was 26 px
  // against the ✕'s 34 px and both were hung from the same top edge, which
  // put their centres 4 px apart and made the header read as crooked.
  // Geometry rather than a stylesheet claim, because only the rendered box
  // shows the offset (invariant 9b's point).
  //
  // **The shared diameter is deliberately no longer asserted** (owner,
  // 2026-09-20). It was the other half of why the indicator read as a
  // second button: a filled circle at exactly the ✕'s size, beside a ✕ that
  // is one. The lamp that replaced it is 9 px, and this case had the old
  // equality written into it — a test can pin a defect as firmly as a
  // promise. What survives is the alignment, which is what was actually
  // wrong in 2026-08-16: the lamp keeps a cell as tall as the ✕ so the two
  // centres still coincide, and that is the clause below.
  test('E2E-M5-14: the save indicator sits on the ✕’s centre line', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await createTripViaWizard(page, TRIP)
    await openQuickAdd(page)
    await addInComposer(page, 'Wanderstöcke')
    await page.getByTestId('m4-row-Wanderstöcke').getByRole('heading').click()
    await expect(page.getByTestId('m5-sheet')).toBeVisible()
    // The lamp is silent until the sheet writes, so there is something to
    // measure only after an edit — which is also the one way this case can
    // fail for the right reason.
    await page.getByTestId('m5-pack').getByTestId('row-check').click()
    // Present before they are measured, so a missing control fails as a
    // missing control rather than as a null dereference inside the page.
    await expect(page.getByTestId('m5-sheet').getByTestId('save-indicator')).toBeVisible()
    await expect(page.getByTestId('m5-close')).toBeVisible()

    // Both boxes are read in *one* frame, inside the page. Two separate
    // `boundingBox()` calls land in different frames of the sheet's enter
    // animation and report a 5 px offset on an aligned header — a false red
    // this case produced before it was written this way. Under one shared
    // transform the difference between the two is exact whenever it is read.
    //
    // The lamp is measured as the painted dot, not as the cell that centres
    // it: the cell's own centre agrees with the ✕ by construction, which is
    // the construction under test.
    const [save, close] = await page.getByTestId('m5-sheet').evaluate((sheet) => {
      const box = (sel: string) => {
        const r = sheet.querySelector(sel)!.getBoundingClientRect()
        return { width: r.width, height: r.height, centerY: r.y + r.height / 2 }
      }
      return [box('[data-testid="save-indicator"] .bulb'), box('[data-testid="m5-close"]')]
    })

    expect(save.centerY).toBeCloseTo(close.centerY, 1)
    // And it is no longer the ✕'s twin: a status lamp that matches a button
    // in size and shape is read as a second button, which is what sent this
    // case back to the owner. The margin is wide, because the claim is
    // "visibly smaller" and not a pixel count.
    expect(save.width).toBeLessThan(close.width / 2)
  })
  // E2E-M5-17 (FR-9.1): the two trip-feedback flags are controls behind
  // *Details ▾*, and only while the trip runs. Until 2026-08-20 the sheet
  // printed them as a note, which left *unused* — the flag M14's assistant
  // is mostly about — unwritable anywhere in the app.
  test('E2E-M5-17: an item can be marked unused, but only once the trip runs', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await createTripViaWizard(page, TRIP)
    await openQuickAdd(page)
    await addInComposer(page, 'Regenhose')
    await page.keyboard.press('Escape')
    await page.getByTestId('m4-row-Regenhose').getByRole('heading').click()
    await page.getByTestId('m5-details').click()

    // A judgement about a trip that has not happened yet means nothing.
    await expect(page.getByTestId('m5-flag-unused')).toHaveCount(0)

    await page.getByTestId('m5-close').click()
    await expect(page.getByTestId('m5-sheet')).toHaveCount(0)
    await tripAction(page, 'start')
    // The archive action appearing is the settled signal for the status write.
    await expectTripActionOffered(page, 'archive')

    await page.getByTestId('m4-row-Regenhose').getByRole('heading').click()
    await page.getByTestId('m5-details').click()
    await page.getByTestId('m5-flag-unused').click()

    // The glance chip renders off the stored row, so it is the flag itself
    // being read back and not the toggle's own state.
    await expect(page.getByTestId('m5-glance')).toContainText('Unused')
  })

  // E2E-M5-05 (FR-7.1/7.2): a note and a preparation todo are the same
  // record — a task-type comment (`is_task = 1`) — rendered by two
  // sections of the same sheet. The promotion is therefore not a field
  // changing on a row but a row *changing collection*, and the assertion
  // that carries the case is that it left one section as it entered the
  // other. A case that only looked for the todo would pass just as well
  // against a build that rendered the row in both places at once.
  //
  // The third reader is M4: the row's prep badge counts the same todos, so
  // closing the sheet is what proves the promotion is a trip-level fact
  // rather than something the sheet remembers about itself.
  test('E2E-M5-05: a note promoted to a task leaves the notes and joins the preparation', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await createTripViaWizard(page, TRIP)
    await openQuickAdd(page)
    await addInComposer(page, 'Kamera')
    await page.keyboard.press('Escape')

    // Nothing to prepare yet — the positive signal the badge is derived. The
    // trip has no task at all, so its section states none (FR-7.6).
    await expect(visible(page).getByTestId('m4-trip-todos-status')).toHaveCount(0)

    await page.getByTestId('m4-row-Kamera').getByRole('heading').click()
    await page.getByTestId('m5-note-input').locator('input').fill('Akku laden')
    await page.getByTestId('m5-note-add').click()

    await expect(page.getByTestId('m5-note-Akku laden')).toBeVisible()
    await expect(page.getByTestId('m5-todo-Akku laden')).toHaveCount(0)

    await page.getByTestId('m5-note-flag-Akku laden').click()

    // Both halves: gone from the notes, and open in the preparation.
    await expect(page.getByTestId('m5-note-Akku laden')).toHaveCount(0)
    await expect(page.getByTestId('m5-todo-Akku laden')).toBeVisible()

    await page.getByTestId('m5-close').click()
    await expect(page.getByTestId('m5-sheet')).toHaveCount(0)

    // FR-7.6: the promoted note is now a task of the trip, listed in the one
    // section under the chip of the row it prepares, and counted with the
    // rest — as well as badged on the row itself.
    await expect(visible(page).getByTestId('m4-trip-todos-status')).toHaveText('0 of 1 done')
    const tasks = await openTripTodos(page)
    await expect(tasks.getByTestId('trip-todo-Akku laden')).toBeVisible()
    await expect(tasks.getByTestId('task-item-Kamera')).toBeVisible()
    await expect(visible(page).getByTestId('m4-prep-badge-Kamera')).toContainText('1')
  })

  // E2E-M5-31 (FR-7.3, UI-Spec M5): the preparation is ticked at the end of
  // its line, which is where M4 ticks the same task (E2E-M4-138) and where
  // every packing control sits. One act read two ways on two screens is two
  // idioms for one thing, and this is the screen the task is usually written
  // on — so the sheet is where the habit is formed.
  //
  // Measured rather than read off the markup: the line is a flex row, so the
  // order in the template and the order on the glass are two claims
  // (invariant 9b).
  test('E2E-M5-31: a preparation is ticked at the end of its line, not in front of it', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await createTripViaWizard(page, TRIP)
    await openQuickAdd(page)
    await addInComposer(page, 'Kamera')
    await page.keyboard.press('Escape')

    await page.getByTestId('m4-row-Kamera').getByRole('heading').click()
    await page.getByTestId('m5-todo-input').locator('input').fill('Akku laden')
    await page.getByTestId('m5-todo-add').click()
    await expect(page.getByTestId('m5-todo-Akku laden')).toBeVisible()

    const line = await page.getByTestId('m5-sheet').evaluate((sheet) => {
      const tick = sheet.querySelector('[data-testid="m5-todo-Akku laden"]')!
      const row = tick.parentElement!.getBoundingClientRect()
      const words = tick.parentElement!.querySelector('.todo-body')!.getBoundingClientRect()
      const box = tick.getBoundingClientRect()
      return { pastTheWords: box.left - words.right, fromLineEnd: row.right - box.right }
    })

    expect(line.pastTheWords).toBeGreaterThan(0)
    // Flush with the line's end: the words take the slack, the tick keeps its
    // box. A tolerance rather than zero, because the checkbox's own box is
    // what is measured and not the ink in it.
    expect(line.fromLineEnd).toBeLessThan(4)
  })

  // E2E-M5-23 (FR-20.1/20.4): the companion offer. FR-20.4's *required*
  // companions join by themselves and are covered by E2E-M4-40's cascade;
  // this is the other mode, where the app may only ask — and the sheet is
  // the one place in the app that asks, since M3's hint is the wizard's.
  //
  // The section is a live derivation of what is on the list, not a hint
  // stored on the row, and each half of the case says so: an unrelated
  // master item is *not* offered, which is the positive signal against a
  // section that simply lists everything; and after the tap the section is
  // gone, because the row it offered is now on the list.
  test('E2E-M5-23: the sheet offers the companion that is missing, and stops once it is there', async ({
    page,
  }) => {
    // Builds its world through M10 and M4 (spec §2.4) rather than by
    // injection, which is several screens' worth of navigation.
    test.slow()
    await page.setViewportSize({ width: 390, height: 844 })

    await createMasterItem(page, 'Kamera')
    await createMasterItem(page, 'Ersatzakku')
    // The editor is open on the Ersatzakku: it depends on the Kamera —
    // and only as a *suggestion*, which is this case's whole subject.
    await visible(page).getByTestId('m10-add-dependency').click()
    await visible(page).getByTestId('m10-dependency-main-Kamera').click()
    await expect(visible(page).getByTestId('m10-add-dependency')).toBeVisible()
    await chooseInSelect(page, 'm10-dependency-mode-Kamera', 'Suggested')
    // A third item, related to nothing: the section has to leave it out.
    await createMasterItem(page, 'Stirnlampe')

    await createTripViaWizard(page, { name: 'Companions', travelers: ['Andy'] })
    await openQuickAdd(page)
    await page.getByTestId('quick-add-input').locator('input').fill('Kamera')
    // The *suggestion*, not the free text: a row that carries no master
    // item has no dependencies, so the section would have nothing to show.
    await page.getByTestId('quick-add-suggestion').filter({ hasText: 'Kamera' }).first().click()
    await expect(page.getByTestId('m4-row-Kamera')).toBeVisible()
    // FR-20.4: a suggestion never joins without being asked for.
    await expect(page.getByTestId('m4-row-Ersatzakku')).toHaveCount(0)
    await page.keyboard.press('Escape')

    await page.getByTestId('m4-row-Kamera').getByRole('heading').click()
    await expect(page.getByTestId('m5-companions')).toBeVisible()
    await expect(page.getByTestId('m5-companion-Ersatzakku')).toBeVisible()
    await expect(page.getByTestId('m5-companion-Stirnlampe')).toHaveCount(0)

    await page.getByTestId('m5-companion-Ersatzakku').click()
    await page.getByTestId('m5-close').click()
    await expect(visible(page).getByTestId('m4-row-Ersatzakku')).toBeVisible()

    // FR-20.3: the offer is derived from the list, so it is spent.
    await page.getByTestId('m4-row-Kamera').getByRole('heading').click()
    await expect(page.getByTestId('m5-sheet')).toBeVisible()
    await expect(page.getByTestId('m5-companions')).toHaveCount(0)
  })

  /*
   * E2E-G8-01 (G-8/FR-17.3): the delegation picker is the clause of G-8
   * nothing asserted.
   *
   * Its two siblings were already read on their own screens — Share is
   * E2E-M2-06 and the notification section E2E-M17-08 — and *Zugewiesen an*
   * is the third collaborative control, absent rather than disabled where
   * there is nobody to hand a row to. It is asserted from inside an open
   * Details section that demonstrably rendered its other rows, because a
   * sheet that failed to open satisfies the absence on its own.
   *
   * The pattern's remaining clause, "no mode banner shown", is not asserted
   * and is named here rather than counted: Local Mode paints no banner at
   * any width, so nothing distinguishes the promise from an empty page.
   */
  test('E2E-G8-01: a device with no members offers no delegation picker', async ({ page }) => {
    await createTripViaWizard(page, { ...TRIP, travelers: ['Andy', 'Sia'] })
    await openQuickAdd(page)
    await addInComposer(page, 'Zelt')
    await page.getByTestId('m4-row-Zelt').getByRole('heading').click()
    await page.getByTestId('m5-details').click()

    // The section is open and populated — the positive signal the absence
    // below is read against.
    await expect(page.getByTestId('m5-mode')).toBeVisible()
    await expect(page.getByTestId(`for-whom-strip-${FOR_WHOM_M5}`)).toBeVisible()

    await expect(page.getByTestId('m5-assignee')).toHaveCount(0)
  })

  /*
   * E2E-G4-01 (G-4/FR-6.3): where a notification lands.
   *
   * `notifications/format.ts` builds `/trips/{t}?item={i}&comment={c}` and
   * a unit covers that string; what no test had done is *open* one. The
   * landing is mode-independent — the sheet reads the query, not a session
   * — so it is driven here rather than on the `server` project, where the
   * spec had placed it because the notification that produces the link is
   * server-only. The delivery half is E2E-FLOW-02's.
   *
   * The flash is asserted through the class the production code sets, and
   * it is genuinely conditional: the sheet watches the thread and fires
   * only once the referenced comment has arrived, so a link naming a
   * comment that is not there leaves every message unflashed.
   */
  test('E2E-G4-01: a notification link opens the item and flashes the comment it names', async ({
    page,
  }) => {
    await createTripViaWizard(page, TRIP)
    await openQuickAdd(page)
    await addInComposer(page, 'Zelt')
    await page.getByTestId('m4-row-Zelt').getByRole('heading').click()

    await page.getByTestId('m5-note-input').locator('input').fill('Beim Nachbarn geliehen')
    await page.getByTestId('m5-note-add').click()
    const comment = page.locator('[data-testid^="m5-note-"][id^="comment-"]').first()
    await expect(comment).toBeVisible()
    const commentId = (await comment.getAttribute('id'))!.replace('comment-', '')
    // The link a notification carries is the sheet's own URL plus the
    // comment; built through the URL rather than by string, so the case
    // does not restate which of the two is the query's first key.
    const link = new URL(page.url())
    link.searchParams.set('comment', commentId)

    // A cold arrival, as a tapped notification is.
    await page.goto(link.toString())
    await expect(page.getByTestId('m5-sheet')).toBeVisible()
    await expect(page.getByTestId('m5-name')).toHaveText('Zelt')
    // The settled record, not the 2.4 s animation: the sheet reports which
    // comment the link landed on once it has found and scrolled to it.
    await expect(page.getByTestId('m5-sheet')).toHaveAttribute('data-flashed-comment', commentId)
  })

  /*
   * E2E-M5-25 (FR-21.25): the sheet is as tall as what it holds.
   *
   * It stood at a fixed 88 % of the viewport whatever was on it, so an item
   * with no prep, no notes and its details folded away spent two thirds of
   * the screen on nothing — while the list it covered was what the two
   * thirds could have shown. Both halves are asserted, because a sheet that
   * simply became short would pass the first: it is short *for this item*
   * and grows when the item is given more to say.
   */
  test('E2E-M5-25: the sheet takes the height of its content, not of the screen', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 400, height: 880 })
    await createTripViaWizard(page, TRIP)
    await openQuickAdd(page)
    await addInComposer(page, 'Zelt')
    await page.getByTestId('m4-row-Zelt').getByRole('heading').click()

    // The presented state, not a wait: Ionic's enter animation is a duration
    // nobody controls, and a box measured during it is not a height.
    await expect(page.getByTestId('m5-modal')).toHaveAttribute('data-presented', 'true')
    // The *modal*, not the box inside it: with a fixed `--height` the box is
    // still only as tall as its content, and the empty third is the modal
    // around it — so a case measuring the box would have passed against the
    // very build this one is about (proved by mutation, 2026-09-08).
    const box = page.getByTestId('m5-modal').locator('.modal-wrapper').first()
    const folded = (await box.boundingBox())!.height
    expect(folded).toBeLessThan(880 * 0.8)

    // And it is the content that decides: everything Details folds away is
    // the rest of the sheet, and unfolding it makes the sheet taller.
    await page.getByTestId('m5-details').click()
    await expect(page.getByTestId('m5-details')).toHaveClass(/open/)
    await expect.poll(async () => (await box.boundingBox())!.height).toBeGreaterThan(folded)
  })
})
