import {
  test,
  expect,
  createTripViaWizard,
  createTemplate,
  createTripFollowingGroup,
  addPosition,
  visiblePage as visible,
  useReducedMotion,
} from './fixtures'
import type { Locator } from '@playwright/test'
import { PATH } from './routes'
import {
  M4_TRIP,
  SCROLL_ROWS,
  openTripTodos,
  packListOffset,
  packRow,
  quickAddRows,
  scrollPackList,
} from './helpers/m4'
import { writesLanded } from './helpers/page'

/**
 * M4 — the list while M5's sheet is over it, and what stays rendered behind
 * it (UI-Test-Spec §4). A neighbour of `packing-list.spec.ts`.
 *
 * Motion is reduced for the whole file: the header line folds over a
 * max-height transition that also changes the height of the scrolled content,
 * so while it animates the screen spends a few hundred milliseconds in a
 * layout nothing can measure. These cases are about where the list comes back
 * to, not about how the line travels, and the app honours the preference —
 * this is its own instant path, not a test switching off what it watches.
 */

/*
 * E2E-M4-45 runs with motion reduced, and that is a choice rather than a
 * convenience: the header line folds over a max-height transition that also
 * changes the height of the scrolled content, so with it animating the
 * screen spends a few hundred milliseconds in a layout nothing can measure.
 * The case is about where the list comes back to, not about how the line
 * travels, and the app honours the preference (see the reduced-motion block
 * in PackingListPage) — so this is the app's own instant path, not a test
 * that turns off the thing it should be watching.
 */
test.describe('M4 packing list — the list under the sheet @local @m4', () => {
  useReducedMotion(test)

  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  // E2E-M4-45 (ADR-012's overlay revision, ADR-046): opening an item is a
  // state of the list's own page — `?item=` on the same route — so the list
  // never leaves the screen and never leaves its offset — an item as a path
  // parameter would mount a second list at the top on every open. The
  // assertion is on the rendered scroll position, never on the URL.
  test('E2E-M4-45: closing the item sheet returns M4 to where it was scrolled', async ({
    page,
  }) => {
    // Sixteen rows built through the quick-add (spec §2.4) is real work.
    test.slow()
    // A phone, and enough rows that the list is genuinely taller than it.
    await page.setViewportSize({ width: 390, height: 640 })
    await createTripViaWizard(page, M4_TRIP)
    await quickAddRows(page, SCROLL_ROWS)

    const offset = async () => (await packListOffset(page)).top

    // One deliberate scroll to a mid-list offset, by the wheel a reader
    // turns: since FR-21.17's gesture rule the head stands still for a
    // scroll nobody made, so moving the offset through ion-content's API
    // would leave the line open and assert nothing. A mid-list offset
    // because that is what "where it was" means here; at the very end the
    // clamp that a collapse provokes can read as an upward scroll and
    // re-open the line, and E2E-M4-70 holds that wobble down.
    const SCROLLED_TO = await scrollPackList(page, 200)

    // Settled, not merely started: the header line folds over a max-height
    // transition, and an offset read while it is still travelling is not an
    // offset the list can hold. The rendered end state is the seam — the
    // wait is on what is painted, never on a clock.
    const header = visible(page).getByTestId('m4-header')
    await expect(header).toHaveClass(/collapsed/)
    await expect(header).toHaveCSS('max-height', '0px')
    expect(await offset()).toBe(SCROLLED_TO)

    // A row wholly inside the *content's* box, so opening it moves nothing by
    // itself: Playwright scrolls whatever it is told to click into view, and
    // a row sitting under the app bar is on the page without being on screen
    // — asking for that one scrolled the list back to the top on WebKit.
    const rowId = await visible(page).evaluate((pageEl) => {
      const box = pageEl.querySelector('ion-content.pack-content')!.getBoundingClientRect()
      const row = [...pageEl.querySelectorAll('[data-testid^="m4-row-"]')].find((el) => {
        const rect = el.getBoundingClientRect()
        return rect.top >= box.top && rect.bottom <= box.bottom
      })
      return row?.getAttribute('data-testid') ?? ''
    })
    expect(rowId).not.toBe('')

    await page.locator(`[data-testid="${rowId}"]`).getByRole('heading').click()
    await expect(page.getByTestId('m5-sheet')).toBeVisible()
    await page.getByTestId('m5-close').click()
    await expect(page.getByTestId('m5-sheet')).toHaveCount(0)

    // Read once the sheet is gone: the offset is a settled state of a page
    // that was never replaced, so there is nothing to wait for — a remount
    // (the mutation this case is proved against) is at the top by the time
    // the sheet has closed.
    expect(await offset()).toBe(SCROLLED_TO)
    // …and the header line came back folded with it, which is the other
    // half of "where it was": it holds 84 px of the scrolled content, so a
    // list restored under an open line shows different rows at the same
    // number.
    await expect(visible(page).getByTestId('m4-header')).toHaveClass(/collapsed/)
  })

  /*
   * E2E-G6-01 (G-6): the hold, which is the half of the stepper no test had
   * ever performed.
   *
   * That qty=1 renders a checkbox and qty>1 a stepper is asserted by
   * E2E-M4-56, and that a tap counts without opening M5 by E2E-G6-02. What
   * neither reaches is the shortcut the pattern exists for: holding + packs
   * the lot, holding − takes it all back. Both are `emit`s the row has to
   * be wired to, and a row wired to neither passes every other stepper case.
   *
   * The hold is a press whose *outcome* is waited on — the count is read
   * until it changes, with the button still down — rather than a sleep of
   * the component's own duration.
   */
  test('E2E-G6-01: holding + packs every unit and holding − takes them all back', async ({
    page,
  }) => {
    test.slow()
    // A quantity can only come from a template position (spec §2.4).
    await page.goto(PATH.templates)
    await createTemplate(page, 'group', 'Camping')
    await addPosition(page, 'Heringe')
    await page.keyboard.press('Escape')
    await visible(page).locator('ion-item h2').filter({ hasText: 'Heringe' }).first().click()
    await expect(page.getByTestId('m8-position-sheet')).toBeVisible()
    await page.getByTestId('m8-qty-inc').click()
    await page.getByTestId('m8-qty-inc').click()
    await page.getByTestId('m8-position-close').click()
    await expect(page.getByTestId('m8-position-sheet')).toHaveCount(0)

    await createTripFollowingGroup(page, 'Haltetest', 'Camping')

    const row = visible(page).getByTestId('m4-row-Heringe')
    const count = row.locator('.stepper-count')
    await expect(count).toHaveText('0/3')

    // A tap first, so the hold below is demonstrably doing something a tap
    // does not — one is +1, the other is all of them.
    await row.getByTestId('row-plus').click()
    await expect(count).toHaveText('1/3')

    const hold = async (testid: string, until: string, reads: Locator) => {
      // `hover` first, so the press lands on the button through Playwright's
      // own hit-target check — `mouse.down` at a computed point does not
      // check. And the *outcome* is what the press is held for: no sleep of
      // the component's own duration anywhere.
      await row.getByTestId(testid).hover()
      await page.mouse.down()
      await expect(reads).toContainText(until)
      await page.mouse.up()
    }

    // Holding + packs the lot — and a fully packed row leaves the list
    // (FR-25.2), so the outcome is read on the trip's own counter and on the
    // reveal that now has something to reveal.
    await hold('row-plus', '3/3', visible(page).getByTestId('m4-progress'))
    await expect(visible(page).getByTestId('m4-done-bar')).toBeVisible()
    await visible(page).getByTestId('m4-done-bar').click()
    await expect(count).toHaveText('3/3')

    // And holding − takes all three back in one gesture.
    await hold('row-minus', '0/3', count)
    await expect(visible(page).getByTestId('m4-progress')).toContainText('0/3')
  })

  /*
   * E2E-G12-03 (G-12): the app-bar cluster survives the collapsing header.
   *
   * This is the reason the cluster lives in the bar rather than on the trip
   * line: the line folds to nothing as soon as the list is scrolled, and a
   * search that folded with it would be reachable only from the top of a
   * list you are searching *because* it is long. E2E-M4-45 collapses the
   * same header and asserts what the list does with its offset; nothing had
   * ever reached for the bar afterwards.
   *
   * Tappable is asserted through the *outcome* — the list narrows, the
   * panel opens — because a button that is present and inert would satisfy
   * a visibility check.
   */
  test('E2E-G12-03: search and filter still act once the header has collapsed', async ({
    page,
  }) => {
    // Sixteen rows through the quick-add, as E2E-M4-45 pays for the same
    // scroll (spec §2.4).
    test.slow()
    await page.setViewportSize({ width: 390, height: 640 })
    await createTripViaWizard(page, M4_TRIP)
    await quickAddRows(page, SCROLL_ROWS)

    // By the wheel, not by the scroller's API: since FR-21.17's gesture rule
    // only a reader's own scroll takes the header down, and this case is
    // about what the bar can still do once it has gone.
    await scrollPackList(page, 200)

    // Settled, not merely started: the line folds over a transition, and the
    // rendered end state is the seam this case waits on.
    const header = visible(page).getByTestId('m4-header')
    await expect(header).toHaveClass(/collapsed/)
    await expect(header).toHaveCSS('max-height', '0px')

    await page.getByTestId('m4-search').click()
    await page.getByTestId('m4-search-input').fill('Sache 1')
    // It searched: the row that does not match is gone, the one that does
    // is on screen. Asserting the field alone would pass against a search
    // whose input never reached the list.
    await expect(visible(page).getByTestId('m4-row-Sache 1')).toBeVisible()
    await expect(visible(page).getByTestId('m4-row-Sache 2')).toHaveCount(0)

    // Still open, deliberately: both halves of the cluster have to be
    // reachable from the same collapsed state.
    await page.getByTestId('m4-filter').click()
    await expect(page.getByTestId('filter-sheet')).toBeVisible()
  })

  /*
   * E2E-G12-04 (G-12, ADR-050): what the header line carries, and how many
   * lines it is.
   *
   * The spec sentence promises "a single line" unconditionally and names the
   * filter chip row as absent by default. Read against the screen, the second
   * half is narrower than that: the chip row is always there, because
   * FR-25.11a/b make it the place the grouping is stated (E2E-M4-15). The
   * first half holds under ADR-050 — without the trip's name and its three
   * destinations the line states figures alone at every width. The clause
   * asserted here is the search field, which is absent until it is opened.
   */
  test('E2E-G12-04: the header line carries the figure and nothing else at either width', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 860 })
    await createTripViaWizard(page, M4_TRIP)
    await quickAddRows(page, ['Zelt'])

    const header = visible(page).getByTestId('m4-header')
    const stats = header.locator('.trip-stats')

    // Default state: no search field. It is the one thing the header gains
    // rather than always carries.
    await expect(page.getByTestId('m4-search-input')).toHaveCount(0)

    // The line is the figure plus its padding and nothing more — under
    // FR-21.23 the figure is itself two lines and a track, so "one row" is not
    // the measurement; "nothing stacked beside it" is. Measured, not read off
    // the stylesheet: a second block would show as height here whatever the
    // flex direction says.
    const phoneLine = (await header.boundingBox())!
    const phoneStats = (await stats.boundingBox())!
    expect(phoneLine.height).toBeLessThan(phoneStats.height * 2)
    await expect(stats).toContainText('0/1')

    await page.setViewportSize({ width: 1280, height: 900 })
    const wideLine = (await header.boundingBox())!
    const wideStats = (await stats.boundingBox())!
    expect(wideLine.height).toBeLessThan(wideStats.height * 2)

    // Still no search field at either width; opening it is what produces one.
    await expect(page.getByTestId('m4-search-input')).toHaveCount(0)
    await page.getByTestId('m4-search').click()
    await expect(page.getByTestId('m4-search-input')).toBeVisible()
  })

  // E2E-M4-56 (UX-9): the names of a checkbox row and a stepper row start at
  // the same x, and the two controls end at the same x — without that, a
  // stepper row starts its name 86 px right of a checkbox row. The control
  // sits at the row's other edge, so the lead column holds the names
  // straight and the container edge holds the controls; both halves are
  // asserted, because either one alone would pass on a row that had lost
  // the other. The lead column's *third* shape — a lone per-person instance
  // — is E2E-M4-72: this pair is a checkbox row against a stepper row, and
  // neither of them has a traveler. Built through M8 per spec §2.4, because
  // a quantity can only come from a position; measured on rendered boxes,
  // not on the stylesheet.
  test('E2E-M4-56: a checkbox row and a stepper row start the name at the same x', async ({
    page,
  }) => {
    test.slow()
    await page.goto(PATH.templates)
    await createTemplate(page, 'group', 'Camping')
    await addPosition(page, 'Heringe')
    await addPosition(page, 'Lampe')
    await page.keyboard.press('Escape')
    await visible(page).locator('ion-item h2').filter({ hasText: 'Heringe' }).first().click()
    await expect(page.getByTestId('m8-position-sheet')).toBeVisible()
    await page.getByTestId('m8-qty-inc').click()
    await page.getByTestId('m8-qty-inc').click()
    await page.getByTestId('m8-position-close').click()
    await expect(page.getByTestId('m8-position-sheet')).toHaveCount(0)

    await createTripFollowingGroup(page, 'Spaltenprobe', 'Camping')

    const stepperRow = page.getByTestId('m4-row-Heringe')
    const checkboxRow = page.getByTestId('m4-row-Lampe')
    // The variants really are on screen — without this, a world where both
    // rows render the same control would pass the equality vacuously.
    await expect(stepperRow.getByTestId('row-minus')).toBeVisible()
    await expect(checkboxRow.getByTestId('row-check').locator('ion-checkbox')).toBeVisible()

    const stepperName = await stepperRow.locator('h3').first().boundingBox()
    const checkboxName = await checkboxRow.locator('h3').first().boundingBox()
    expect(stepperName!.x).toBe(checkboxName!.x)

    // The rule behind it: the lead column is one width for every row, and
    // it is the mark slot rather than the control that holds it open.
    const stepperLead = await stepperRow.locator('.row-lead').boundingBox()
    const checkboxLead = await checkboxRow.locator('.row-lead').boundingBox()
    expect(stepperLead!.width).toBe(checkboxLead!.width)

    // The other edge: whatever the control is, the thing you tap ends where
    // the row does. A stepper is wider than a checkbox, so this is only true
    // if the column is right-aligned rather than merely present.
    const stepperControl = await stepperRow.locator('.row-control').boundingBox()
    const checkboxControl = await checkboxRow.locator('.row-control').boundingBox()
    expect(stepperControl!.width).toBeGreaterThan(checkboxControl!.width)
    expect(stepperControl!.x + stepperControl!.width).toBe(
      checkboxControl!.x + checkboxControl!.width,
    )
  })

  // E2E-M4-68 (FR-25.2): a done row keeps its place in the list and loses its
  // place in the queue — it falls behind the rows that still ask for
  // something. Asserted on the *rendered* order, because the domain unit can
  // only say what the view model holds.
  test('E2E-M4-68: a packed row sinks to the end of its group when revealed', async ({ page }) => {
    await createTripViaWizard(page, M4_TRIP)
    await quickAddRows(page, ['Zelt', 'Schlafsack', 'Stirnlampe'])

    // Packing takes the row off the working list (FR-25.2's default), which
    // is the evidence the pack landed before anything is revealed.
    await packRow(page, 'Schlafsack')

    // The undo snackbar sits over the reveal bar once the list reaches the
    // bottom of a 720 px window, and Playwright's way around an overlay is to
    // scroll — which yields the heads, moving the bar out from under the
    // click. Dismissed rather than waited out, as in visual.spec.
    // Every one: since FR-25.31 more than one act on the way here raises one.
    await page
      .locator('ion-toast.pack-toast')
      .evaluateAll((els) => els.forEach((el) => void (el as HTMLIonToastElement).dismiss()))
    await expect(page.locator('ion-toast.pack-toast')).toHaveCount(0)
    await page.getByTestId('m4-done-bar').click()
    const names = visible(page).locator('.group-card h3')
    await expect(names).toHaveText([/Zelt/, /Stirnlampe/, /Schlafsack/])

    // The middle row is where it was: sinking one row must not reorder the
    // others, and a list of three where only the last moved is the proof.
    await expect(names.nth(1)).toHaveText(/Stirnlampe/)
  })

  /*
   * E2E-M4-69 (FR-25.22): the reveal bar and the filter sheet's *Erledigte*
   * switch label the same set, so they must carry the same number — not
   * done rows among the ones the filter lets through on one, and the whole
   * trip's packed *units* on the other. Under FR-25.32 the bar is gone while
   * a term is typed, so the pairing is read without one; the search is then
   * what shows the switch counting the *matches* (1) rather than the trip
   * (2).
   */
  test('E2E-M4-69: the reveal bar and the Erledigte switch carry one number', async ({ page }) => {
    await createTripViaWizard(page, M4_TRIP)
    await quickAddRows(page, ['Zelt', 'Schlafsack'])
    await packRow(page, 'Zelt')
    await packRow(page, 'Schlafsack')

    const bar = visible(page).getByTestId('m4-done-bar')
    await expect(bar).toContainText('2')

    await page.getByTestId('m4-filter').click()
    await expect(page.getByTestId('filter-sheet')).toBeVisible()
    const doneSwitch = page.getByTestId('filter-switch-done').locator('..')
    await expect(doneSwitch).toContainText('2')
    await page.getByTestId('filter-close').click()

    await page.getByTestId('m4-search').click()
    await page.getByTestId('m4-search-input').fill('Zelt')
    // The searched row is on screen: the positive signal that the narrowing
    // landed before the switch is read.
    await expect(visible(page).getByTestId('m4-row-Zelt')).toBeVisible()

    await page.getByTestId('m4-filter').click()
    await expect(page.getByTestId('filter-sheet')).toBeVisible()
    await expect(doneSwitch).toContainText('1')
    await expect(doneSwitch).not.toContainText('2')
  })

  /*
   * E2E-M4-127: the Erledigte switch stays on when it is tapped. The tick
   * appeared and went again at once, so a packed row could only be brought
   * back through the reveal bar. Every earlier case read the switch's count
   * and none ever operated it.
   */
  test('E2E-M4-127: the Erledigte switch keeps its tick and reveals the packed rows', async ({
    page,
  }) => {
    await createTripViaWizard(page, M4_TRIP)
    await quickAddRows(page, ['Zelt', 'Schlafsack'])
    await packRow(page, 'Zelt')
    await expect(page.getByTestId('m4-row-Zelt')).toHaveCount(0)

    await page.getByTestId('m4-filter').click()
    await expect(page.getByTestId('filter-sheet')).toBeVisible()
    const doneSwitch = page.getByTestId('filter-switch-done')
    // The words, not the box: that is where a thumb lands.
    await doneSwitch.locator('..').getByText('Packed', { exact: false }).first().click()
    await expect(doneSwitch).toHaveJSProperty('checked', true)

    await page.getByTestId('filter-close').click()
    await expect(visible(page).getByTestId('m4-row-Zelt')).toBeVisible()
  })

  /*
   * E2E-M4-128 (FR-25.32): a search finds a packed row without the Erledigte
   * switch being turned first, and the row goes away again with the term —
   * the search lifts the switch, it does not flip it.
   */
  test('E2E-M4-128: searching finds a packed row while Erledigte is off', async ({ page }) => {
    await createTripViaWizard(page, M4_TRIP)
    await quickAddRows(page, ['Zelt', 'Schlafsack'])
    await packRow(page, 'Zelt')
    await expect(page.getByTestId('m4-row-Zelt')).toHaveCount(0)

    await page.getByTestId('m4-search').click()
    await page.getByTestId('m4-search-input').fill('Zelt')
    await expect(visible(page).getByTestId('m4-row-Zelt')).toBeVisible()
    await expect(page.getByTestId('m4-row-Schlafsack')).toHaveCount(0)
    // The packed row is on screen, so there is nothing left to offer.
    await expect(visible(page).getByTestId('m4-done-bar')).toHaveCount(0)

    await page.getByTestId('m4-search-input').fill('')
    await expect(page.getByTestId('m4-row-Zelt')).toHaveCount(0)
    await expect(visible(page).getByTestId('m4-row-Schlafsack')).toBeVisible()
    await expect(visible(page).getByTestId('m4-done-bar')).toBeVisible()
  })

  /*
   * E2E-M4-129 (FR-21.17): a list that overflows its screen by less than the
   * header line frees when it yields — a search's few hits — keeps the line.
   * Yielding anyway, the shorter range clamps the offset, the line comes
   * back and the list jumps up, on every swipe down. The viewport is
   * sized from the measured overflow so the case sits in that band on any
   * engine, and the positive signal is the offset reaching the end.
   */
  test('E2E-M4-129: a short list does not jump when it is scrolled to its end', async ({
    page,
  }) => {
    // A phone: there the page head yields with the line, which is what makes
    // the yield release more than the line alone.
    await page.setViewportSize({ width: 390, height: 800 })
    await createTripViaWizard(page, M4_TRIP)
    await quickAddRows(page, ['Socke 1', 'Socke 2', 'Socke 3', 'Socke 4', 'Socke 5', 'Socke 6'])
    await page.getByTestId('m4-search').click()
    await page.getByTestId('m4-search-input').fill('Socke')
    await expect(visible(page).getByTestId('m4-row-Socke 6')).toBeVisible()

    const content = visible(page).locator('ion-content.pack-content')
    const scroller = () =>
      content.evaluate(async (host: HTMLIonContentElement) => {
        const el = await host.getScrollElement()
        return { slack: el.scrollHeight - el.clientHeight, client: el.clientHeight }
      })

    // 150 px of overflow: past the yield threshold, short of what it frees.
    const before = await scroller()
    const height = page.viewportSize()!.height + before.slack - 150
    await page.setViewportSize({ width: page.viewportSize()!.width, height })
    await expect.poll(async () => (await scroller()).slack).toBe(150)

    // Watch the line from before the gesture: a flip is what this case counts.
    await content.evaluate((host: HTMLIonContentElement) => {
      const line = host.querySelector('.trip-line') as HTMLElement
      const counter = window as unknown as { __lineFlips: number }
      counter.__lineFlips = 0
      new MutationObserver(() => (counter.__lineFlips += 1)).observe(line, {
        attributes: true,
        attributeFilter: ['class'],
      })
    })

    // One reader's flick to the end. A wheel rather than the scroller's API
    // because since FR-21.17's gesture rule a scroll nobody made leaves the
    // head alone by itself — this case has to ask the question it claims to.
    await scrollPackList(page, before.slack + 200)

    const end = await content.evaluate(async (host: HTMLIonContentElement) => {
      const el = await host.getScrollElement()
      const line = host.querySelector('.trip-line') as HTMLElement
      // A yield is a transition on the line and the browser's clamp arrives
      // while it runs, starting the reverse one: settled is the line having
      // no animation left, after frames for the class change to render.
      const frames = () =>
        new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      for (let round = 0; round < 4; round++) {
        await frames()
        const running = line.getAnimations()
        if (running.length === 0) break
        await Promise.all(running.map((a) => a.finished))
      }
      return {
        top: el.scrollTop,
        slack: el.scrollHeight - el.clientHeight,
        flips: (window as unknown as { __lineFlips: number }).__lineFlips,
      }
    })

    // The line never moved and the offset stayed at the end.
    expect(end.flips).toBe(0)
    expect(end.top).toBe(end.slack)
  })

  /*
   * E2E-M4-57 (G-12, UX-13): the bar keeps the actions used while packing
   * and puts the once-per-trip ones behind the ⋮, where they are read as
   * words — six glyphs plus the gear do not fit a phone's bar. The ⋮ holds
   * packing's own and nothing else: the trip's properties and its lifecycle
   * steps are M2's, where the trip itself is the subject.
   */
  test('E2E-M4-57: the rare packing actions move behind the bar menu, and the trip-wide ones leave it', async ({
    page,
  }) => {
    await createTripViaWizard(page, { name: 'Elba' })
    await expect(visible(page).getByTestId('m4-header')).toBeVisible()

    // What stays: the three tapped while packing.
    await expect(page.getByTestId('m4-search')).toBeVisible()
    await expect(page.getByTestId('m4-filter')).toBeVisible()
    await expect(page.getByTestId('m4-fold-all')).toBeVisible()

    await page.getByTestId('header-overflow').click()

    // Named, not merely present — the whole reason for the menu. Read whole,
    // so the absences below stand against a menu that demonstrably opened.
    const sheet = page.locator('ion-action-sheet')
    await expect(sheet).toBeVisible()
    await expect(sheet).toContainText('Luggage')
    await expect(sheet).toContainText('Analytics')
    await expect(sheet).toContainText('Finish packing')
    await expect(sheet).not.toContainText('Trip properties')
    await expect(sheet).not.toContainText('Start trip')

    // And it acts: the luggage entry lands on the rendered luggage screen.
    await sheet.getByText('Luggage').click()
    await expect(visible(page).getByTestId('m11-fab')).toBeVisible()

    /*
     * By role, not only by test id — and that distinction is the case's
     * sharpest half. While an overlay is up Ionic marks the router outlet
     * `aria-hidden`; an action that navigates from inside the sheet's own
     * handler races the teardown and the flag stays behind, leaving the
     * screen fully painted, fully clickable and absent from the
     * accessibility tree. Every pixel assertion above stays green through
     * that. This one does not.
     */
    await expect(visible(page).getByRole('button', { name: 'New container' })).toBeVisible()
  })
})

test.describe('M4 packing list — the rendered remainder @local @m4', () => {
  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  /**
   * E2E-M4-25, with E2E-M4-08 (FR-7.3/25.2): the preparation lifecycle, end to
   * end on the list.
   *
   * `packingView.spec.ts` covers the arithmetic — a packed row with open prep
   * is not done. This is the rendered half, and it is where the defect the FR
   * was amended for actually showed: open-prep must be derived from the todos
   * at read time, and the prototype's stored count meant that resolving the
   * last todo left the row on the list forever. Resolving the badge away and
   * watching the row leave is the only assertion that catches that.
   */
  test('E2E-M4-08, E2E-M4-25: a packed row with open prep stays on the list until the todo is resolved', async ({
    page,
  }) => {
    const TODO = 'Akku laden'
    await createTripViaWizard(page, M4_TRIP)
    await quickAddRows(page, ['Kamera'])

    await page.getByTestId('m4-row-Kamera').click()
    await expect(page.getByTestId('m5-sheet')).toBeVisible()
    await page.getByTestId('m5-todo-input').locator('input').fill(TODO)
    await page.getByTestId('m5-todo-add').click()
    await expect(page.getByTestId(`m5-todo-${TODO}`)).toBeVisible()
    await page.getByTestId('m5-close').click()
    await expect(page.getByTestId('m5-sheet')).toHaveCount(0)

    // E2E-M4-08: the row carries the badge, counting what is open.
    await expect(visible(page).getByTestId('m4-prep-badge-Kamera')).toContainText('1')

    await visible(page).getByTestId('m4-row-Kamera').getByTestId('row-check').click()

    // Packed, and still on the working list: work remains. The reveal bar is
    // the positive signal for "nothing is done" — its absence is what would
    // otherwise be indistinguishable from a list that failed to update.
    await expect(visible(page).getByTestId('m4-row-Kamera')).toBeVisible()
    await expect(visible(page).getByTestId('m4-done-bar')).toHaveCount(0)

    await visible(page).getByTestId('m4-row-Kamera').click()
    await expect(page.getByTestId('m5-sheet')).toBeVisible()
    await page.getByTestId(`m5-todo-${TODO}`).click()
    await page.getByTestId('m5-close').click()
    await expect(page.getByTestId('m5-sheet')).toHaveCount(0)

    // The last todo resolved: the row is done and leaves.
    await expect(visible(page).getByTestId('m4-row-Kamera')).toHaveCount(0)
    await expect(visible(page).getByTestId('m4-done-bar')).toBeVisible()

    // Revealed, it comes back without a badge — the badge counts *open* prep,
    // so a badge surviving its todo would be the stored-count defect again.
    await visible(page).getByTestId('m4-done-bar').click()
    await expect(visible(page).getByTestId('m4-row-Kamera')).toBeVisible()
    await expect(visible(page).getByTestId('m4-prep-badge-Kamera')).toHaveCount(0)
  })

  /**
   * E2E-M4-106 (FR-7.3, FR-25.2): the same snackbar for M4's preparation
   * section, whose ticked task also leaves the open list. The badge on the row
   * is the positive signal that the reopened task is the row's own again.
   */
  test('E2E-M4-106: a ticked-off prep task is taken back from the snackbar', async ({ page }) => {
    const TODO = 'Akku laden'
    await createTripViaWizard(page, M4_TRIP)
    await quickAddRows(page, ['Kamera'])
    await page.getByTestId('m4-row-Kamera').click()
    await page.getByTestId('m5-todo-input').locator('input').fill(TODO)
    await page.getByTestId('m5-todo-add').click()
    await expect(page.getByTestId(`m5-todo-${TODO}`)).toBeVisible()
    await page.getByTestId('m5-close').click()
    await expect(page.getByTestId('m5-sheet')).toHaveCount(0)

    // FR-7.6: the row's preparation is ticked in the trip's one task section.
    const tasks = await openTripTodos(page)
    await tasks.getByTestId(`trip-todo-${TODO}`).locator('ion-checkbox').click()
    await expect(visible(page).getByTestId('m4-prep-badge-Kamera')).toHaveCount(0)

    const toast = page.locator('ion-toast.pack-toast')
    await expect(toast).toContainText(TODO)
    await toast.getByRole('button', { name: /undo/i }).click()
    await expect(visible(page).getByTestId('m4-prep-badge-Kamera')).toContainText('1')
    await writesLanded(page)
    await page.reload()
    await expect(visible(page).getByTestId('m4-prep-badge-Kamera')).toContainText('1')
  })

  /**
   * E2E-M4-24 (FR-25.17): the packing stamp, and that it never outlives the
   * state it describes.
   *
   * Local Mode has no account, so `packed_by_user_id` is null here and the
   * stamp reads its time alone — the *name* half is the server's answer and is
   * asserted in `server/multi-user.spec.ts` (E2E-FLOW-01), where the server
   * stamps the column itself (invariant 3). What this case owns is the half
   * that has no account in it: the stamp appears with the pack, and un-packing
   * takes it back.
   */
  test('E2E-M4-24: a packed row says when, and un-packing takes the stamp back', async ({
    page,
  }) => {
    await createTripViaWizard(page, M4_TRIP)
    await quickAddRows(page, ['Zelt'])

    await visible(page).getByTestId('m4-row-Zelt').getByTestId('row-check').click()
    await visible(page).getByTestId('m4-done-bar').click()

    const row = visible(page).getByTestId('m4-row-Zelt')
    await expect(row.getByTestId('m4-packed-stamp')).toBeVisible()
    // A time, not merely a rendered element: a stamp with nothing in it would
    // satisfy visibility and say nothing.
    await expect(row.getByTestId('m4-packed-stamp')).toContainText(/\d{1,2}[:.]\d{2}/)

    // The same record on M5, which the UI-Test-Spec calls an M5 case:
    // read-only there, because the server stamps it and no control may pick it
    // (invariant 3).
    await row.getByRole('heading').click()
    await page.getByTestId('m5-details').click()
    await expect(page.getByTestId('m5-stamp')).toContainText(/\d{1,2}[:.]\d{2}/)
    await expect(page.getByTestId('m5-stamp').locator('ion-select, input, button')).toHaveCount(0)
    await page.getByTestId('m5-close').click()
    await expect(page.getByTestId('m5-sheet')).toHaveCount(0)

    await row.getByTestId('row-check').click()

    // Back on the working list, and the stamp is gone with the state it
    // described. The row still being there is the positive half — a stamp that
    // vanished with its row would satisfy the first assertion alone.
    await expect(visible(page).getByTestId('m4-row-Zelt')).toBeVisible()
    await expect(visible(page).getByTestId('m4-packed-stamp')).toHaveCount(0)
  })

  /**
   * E2E-M4-11 (FR-3.2): the shopping entry counts, and says no number when
   * there is nothing to buy.
   *
   * The entry itself is always there — M6 is a screen, not a notification — so
   * the count is the part that carries information, and a `(0)` is worse than
   * no number at all. ADR-050 put it in the word because an action sheet
   * renders no badge; under ADR-051 amendment 3 the pill of a view you are
   * not standing on is a glyph, and there the number is a badge — the name
   * still carries it, so a screen reader hears the same count.
   */
  test('E2E-M4-11: the shopping entry carries a count only once something is to be bought', async ({
    page,
  }) => {
    await createTripViaWizard(page, M4_TRIP)
    await quickAddRows(page, ['Zelt'])

    await expect(page.getByTestId('trip-view-shopping')).toHaveAccessibleName('Shopping')
    await expect(page.getByTestId('trip-view-shopping-count')).toHaveCount(0)

    // Turning the row into a purchase is what puts it on M6 (FR-3.2).
    await visible(page).getByTestId('m4-row-Zelt').click()
    await expect(page.getByTestId('m5-sheet')).toBeVisible()
    // The mode sits behind FR-25.7's disclosure, like every other detail.
    await page.getByTestId('m5-details').click()
    await page.getByTestId('m5-mode').click()
    await page
      .locator('ion-popover ion-select-popover ion-item')
      .filter({ hasText: /buy|Kaufen/i })
      .first()
      .click()
    await page.getByTestId('m5-close').click()
    await expect(page.getByTestId('m5-sheet')).toHaveCount(0)

    await expect(page.getByTestId('trip-view-shopping')).toHaveAccessibleName('Shopping (1)')
    // On M4 the shopping view is a glyph (ADR-051 amendment 3): the number a
    // reader sees is the badge, and the name above is what it is read as.
    await expect(page.getByTestId('trip-view-shopping-count')).toHaveText('1')
  })

  /**
   * E2E-M4-19 (FR-25.11f): the Person facet's absence bucket has a word of its
   * own.
   *
   * Only the wording is here. That the bucket *leads* its facet is asserted in
   * `domain/packingView.spec.ts`, which is where the sort lives; repeating it
   * through the browser would re-run a covered rule at a hundred times the
   * cost. What the unit deliberately does not decide is the word — it labels
   * the values it can and leaves UI copy to the caller — so the caller is
   * where the word has to be checked.
   *
   * The failure it guards is generic: three facets address absence with the
   * same empty value, and one shared label makes the Person facet read as "no
   * category". "Alle" is the other wrong answer the FR names — the bucket means
   * *nobody in particular*, not *everybody*.
   */
  test('E2E-M4-19: the Person facet names its shared bucket, and not the way the others do', async ({
    page,
  }) => {
    await createTripViaWizard(page, M4_TRIP)
    await quickAddRows(page, ['Zelt'])

    await page.getByTestId('m4-filter').click()
    await expect(page.getByTestId('filter-sheet')).toBeVisible()

    const person = page.getByTestId('facet-person-')
    const category = page.getByTestId('facet-category-')
    await expect(person).toBeVisible()
    await expect(category).toBeVisible()

    const shared = ((await person.textContent()) ?? '').trim()
    expect(shared).not.toMatch(/^(alle|all)\b/i)
    // The comparison is the assertion: "a word of its own" is a claim about two
    // labels, and asserting one string alone would pass against a shared one.
    expect(shared).not.toBe(((await category.textContent()) ?? '').trim())
  })
})
