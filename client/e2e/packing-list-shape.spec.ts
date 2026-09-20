import {
  addInComposer,
  test,
  expect,
  createTripViaWizard,
  openTripView,
  createTemplate,
  createTripFollowingGroup,
  addPosition,
  openQuickAdd,
  visiblePage as visible,
  useReducedMotion,
} from './fixtures'
import type { Locator, Page } from '@playwright/test'
import { PATH } from './routes'
import {
  M4_TRIP,
  SCROLL_ROWS,
  chooseInRowMenu,
  lightTraveler,
  openCluster,
  openRowMenu,
  packListOffset,
  packRow,
  quickAddRows,
  scrollPackList,
} from './helpers/m4'
import { backToInventory, createItem } from './helpers/m9'

/**
 * M4 — the shape of the screen: what the head, the line and the rows do with
 * the space they have (UI-Test-Spec §4). Split out of `packing-list.spec.ts`
 * on 2026-09-20.
 *
 * Every case here is a claim about rendered pixels, asserted as rendered
 * pixels: a stylesheet cannot say whether the head gave its space back, and a
 * route table cannot say how far a name sits from its checkbox.
 */

/**
 * The head that never yielded (FR-21.17) and the column that had no measure
 * for a row (FR-21.18, superseded by FR-21.26) — the two halves of the M4
 * read-through of 2026-09-07 that are about the screen's shape rather than
 * its numbers.
 *
 * Both are claims about rendered pixels, so both are asserted as rendered
 * pixels: a stylesheet cannot say whether the head actually gave its space
 * back, and a route table cannot say how far a name sits from its checkbox.
 *
 * Motion is reduced for the same reason E2E-M4-45 reduces it: the head and
 * the line under it both travel, and a height read mid-transition is not a
 * height the screen holds. The app has its own instant path, so this is not
 * a test switching off the thing it watches.
 */
test.describe('M4 — the shape of the screen @local @m4', () => {
  useReducedMotion(test)

  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  /**
   * A yielded head is not exactly zero pixels tall: the collapse animates a
   * grid track to `0fr`, and the browser rounds that to a fraction. Below a
   * pixel is the assertion; the standing head is measured against 40.
   */
  const YIELDED_PX = 2
  const STANDING_PX = 40

  /**
   * Well past the offset below which the head stands whatever the scroll
   * direction was. A case that asserts the head's *return* has to be clear
   * of it, or it would pass on a build that never read a direction at all.
   */
  const CLEAR_OF_THE_TOP = 200

  /**
   * The head's height once it has *settled*, polled rather than read once.
   *
   * The collapse travels over a transition, and a single `evaluate` reads
   * whatever frame it lands on — which is how the first version of this case
   * passed here and failed on CI with 28 px and 53 px, both mid-flight. The
   * wait is on the rendered end state, never on a clock; this is the same
   * seam `toHaveCSS` gives E2E-M4-45 for the header line.
   */
  const headHeight = (page: Page) =>
    expect.poll(() =>
      page.getByTestId('page-head').evaluate((el) => el.getBoundingClientRect().height),
    )

  /**
   * A wheel over the list, which is how a reader moves it — and since
   * FR-21.17's gesture rule the only way that moves the head at all. Driving
   * the offset through the scroller's API would leave every assertion below
   * green against the rule's removal.
   */
  const scrollToEnd = async (page: Page) => {
    const { slack } = await packListOffset(page)
    await scrollPackList(page, slack + 200)
    // Against the slack as it stands, not as it was: yielding the head hands
    // its height to the viewport and shortens the range by the same amount.
    await expect
      .poll(async () => {
        const at = await packListOffset(page)
        return at.top === at.slack
      })
      .toBe(true)
  }

  /*
   * E2E-M4-70 (FR-21.17): the page head goes down with the header line, and
   * comes back with it.
   *
   * The third step is the one that carries the defect this case was written
   * for. Collapsing the head hands its height to the scroll viewport, which
   * shortens the scrollable range by the same amount; the browser clamps
   * `scrollTop` down to fit, and that clamp arrives at the scroll handler
   * looking exactly like an upward scroll. Measured before the fix, on a
   * 1280×900 window, the head opened and shut on a single flick near the
   * end of the list. Asserting at the very bottom is therefore not
   * thoroughness — it is the only place the bug lives.
   */
  test('E2E-M4-70: the page head yields to the list, and holds at the bottom', async ({ page }) => {
    test.slow()
    await page.setViewportSize({ width: 390, height: 640 })
    await createTripViaWizard(page, M4_TRIP)
    await quickAddRows(page, SCROLL_ROWS)

    const head = page.getByTestId('page-head')
    const line = visible(page).getByTestId('m4-header')
    // The positive signal the rest of the case is measured against: the head
    // is standing, and it is standing at a height worth reclaiming.
    await expect(head).not.toHaveClass(/collapsed/)
    await headHeight(page).toBeGreaterThan(STANDING_PX)

    // Straight to the end, in one gesture, with the head still standing —
    // which is the only arrangement in which the clamp can bite. Reaching
    // the bottom from an *already* collapsed head changes no height, so it
    // proves nothing: that sequence stayed green against the unguarded
    // build, and this one does not.
    await scrollToEnd(page)
    await expect(head).toHaveClass(/collapsed/)
    await expect(line).toHaveClass(/collapsed/)
    await headHeight(page).toBeLessThan(YIELDED_PX)

    // Any upward gesture brings both back — the other half of the owner's
    // 2026-08-19 rule, and what makes the collapse a yield rather than a
    // one-way disappearance. Upward by a little, so the list stays clear of
    // the top: at the top the head stands whatever the direction was.
    const back = await scrollPackList(page, -120)
    expect(back).toBeGreaterThan(CLEAR_OF_THE_TOP)
    await expect(head).not.toHaveClass(/collapsed/)
    await expect(line).not.toHaveClass(/collapsed/)
    await headHeight(page).toBeGreaterThan(STANDING_PX)

    // And the ordinary case, mid-list, where nothing is clamping.
    await scrollPackList(page, 200)
    await expect(head).toHaveClass(/collapsed/)
    await expect(line).toHaveClass(/collapsed/)
    await headHeight(page).toBeLessThan(YIELDED_PX)
  })

  /*
   * E2E-M4-135 (FR-21.17): a scroll nobody made leaves the head where it is.
   *
   * The browser produces one whenever it has to bring a control into view —
   * a keyboard focus, and every click a driver aims at a row that is off
   * screen. Read as a gesture, an upward one of those brought the head back
   * and pushed every row down by its height, which is a tap landing on the
   * row below the one it was aimed at. It cost E2E-M5-19 a WebKit shard on
   * 2026-09-20: the seat had the pointer down on it and never saw a click,
   * because the list moved between the two. Measured here at 390×640, and on
   * the failing build at 1280×600: a 60 px scroll, 162 px of row.
   *
   * The geometry is taken in one `evaluate`, either side of the scroll it is
   * about: two `boundingBox()` calls would compare two different moments.
   */
  test('E2E-M4-135: a scroll nobody made does not move the head, or the rows under it', async ({
    page,
  }) => {
    test.slow()
    await page.setViewportSize({ width: 390, height: 640 })
    await createTripViaWizard(page, M4_TRIP)
    await quickAddRows(page, SCROLL_ROWS)

    const line = visible(page).getByTestId('m4-header')
    // Yielded by a reader's own flick, which is the only thing that may, and
    // carried to the end, where rows have gone off the top: those are the
    // ones the browser has to scroll back *up* to, and up is the direction
    // that used to recall the head.
    await scrollToEnd(page)
    await expect(line).toHaveClass(/collapsed/)

    const moved = await visible(page).evaluate(async (pageEl) => {
      const host = pageEl.querySelector('ion-content.pack-content') as HTMLIonContentElement
      const el = await host.getScrollElement()
      const trip = pageEl.querySelector('.trip-line') as HTMLElement
      let flips = 0
      new MutationObserver(() => (flips += 1)).observe(trip, {
        attributes: true,
        attributeFilter: ['class'],
      })

      // A row the browser has to scroll *up* to, and far: the topmost one
      // that has gone off the screen. `block: 'nearest'` moves the list by
      // exactly the distance to it, and a few pixels would be filtered as
      // the rubber band's own jitter and prove nothing.
      const above = [...pageEl.querySelectorAll('[data-testid^="m4-row-"]')].filter(
        (row) => row.getBoundingClientRect().top < el.getBoundingClientRect().top,
      )
      const target = above[0] as HTMLElement | undefined
      if (target === undefined) return null

      const rowBefore = target.getBoundingClientRect().top
      const topBefore = el.scrollTop
      target.scrollIntoView({ block: 'nearest' })

      // Settled, not merely started: the head's own flip would arrive a
      // frame or two after the scroll it answers, and a reading taken
      // before it would report the very absence this case is asserting.
      const frames = () =>
        new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      for (let round = 0; round < 4; round += 1) {
        await frames()
        const running = trip.getAnimations()
        if (running.length === 0) break
        await Promise.all(running.map((a) => a.finished))
      }

      return {
        flips,
        scrolled: el.scrollTop - topBefore,
        rowMoved: target.getBoundingClientRect().top - rowBefore,
      }
    })

    expect(moved).not.toBeNull()
    // It really did scroll, upward, and by more than the jitter the rule
    // filters out — without all three the rest is vacuous.
    expect(moved!.scrolled).toBeLessThan(-CLEAR_OF_THE_TOP)
    // The head did not answer it, and the row moved by the scroll and by
    // nothing else. Either assertion alone would pass on half the defect.
    expect(moved!.flips).toBe(0)
    expect(moved!.rowMoved).toBe(-moved!.scrolled)
    await expect(line).toHaveClass(/collapsed/)
  })

  /*
   * E2E-M4-71 (FR-21.26): on a window wide enough to have a choice, the
   * content column is one width, and every screen the reader steps to keeps
   * it.
   *
   * The rule it replaces was the opposite one: FR-21.18 gave M4 a narrower
   * column than the screens around it, and this case asserted that they
   * *differed*. What that produced is the defect underneath FR-21.26 — the
   * trip's four views are one tap apart (ADR-051), so the page moved and
   * changed width every time the reader used them.
   *
   * Two assertions, because either alone is passable by a broken build. The
   * equality alone would hold on a build with no cap at all, where every
   * screen is the window; the cap alone would hold on the build this case
   * was written against. So the column has to be narrower than the room it
   * is given *and* the same on each screen.
   */
  test('E2E-M4-71: one content measure, and the screens the reader steps to keep it', async ({
    page,
  }) => {
    const VIEWPORT = 1280
    await page.setViewportSize({ width: VIEWPORT, height: 900 })
    await createTripViaWizard(page, M4_TRIP)
    await quickAddRows(page, ['Zelt'])

    const columnWidth = () =>
      page.locator('.app-content').evaluate((el) => el.getBoundingClientRect().width)
    const rowWidth = () =>
      visible(page)
        .getByTestId('m4-row-Zelt')
        .evaluate((el) => el.getBoundingClientRect().width)
    // The pop is finished, not merely started. Asserted here rather than
    // left to the ADR-012 fixture, because that one runs after the case and
    // reports a leak this case is in a position to prevent: the first
    // version of it stacked two pushes and popped one, and only CI's copy of
    // the guard said so.
    const oneLivePage = () => expect.poll(() => visible(page).count()).toBe(1)

    const column = await columnWidth()
    // Narrower than the window, so the cap is doing something at all. The
    // rail takes a bite out of the window, which is why this is not a
    // comparison against the viewport width exactly.
    expect(column).toBeLessThan(VIEWPORT / 2 + 100)
    // The row is inside the column it is capped by — the positive signal
    // that the cap reached the rows rather than only the frame around them.
    expect(await rowWidth()).toBeLessThanOrEqual(column)

    // Each step is pushed and popped before the next one, rather than
    // stacked: two pages deep leaves the outlet showing both, and the suite
    // fails the case that leaked them (ADR-012). It is also the truer
    // reading of the rule — what has to hold is that going *and coming
    // back* keeps the width, on each of the two kinds of destination.

    // A sibling view of the same trip, reached the way the reader reaches
    // it — through the frame, which is what made the two measures untenable.
    // The helper knows which shape the view is in (ADR-051 amendment 1); what
    // this case is measuring is the column it lands in, not the tap.
    await openTripView(page, 'luggage')
    await expect(visible(page).getByTestId('m11-unassigned-title')).toBeVisible()
    expect(await columnWidth()).toBe(column)
    await page.getByTestId('header-back').click()
    await expect(visible(page).getByTestId('m4-row-Zelt')).toBeVisible()
    await oneLivePage()
    await expect.poll(columnWidth).toBe(column)

    // And a screen off the trip entirely, reached through the app's own
    // navigation rather than a reload.
    await page.getByTestId('header-settings').click()
    await expect(visible(page).getByTestId('settings-language')).toBeVisible()
    expect(await columnWidth()).toBe(column)
    await page.getByTestId('header-back').click()
    await expect(visible(page).getByTestId('m4-row-Zelt')).toBeVisible()
    await oneLivePage()
    await expect.poll(columnWidth).toBe(column)
  })
  /*
   * E2E-M4-72 (FR-21.19): the lead column is one thing wide, on every kind
   * of row.
   *
   * The kind that broke it is a *lone* per-person instance: one traveler
   * checked, so `packingView` renders no cluster and folds the person into
   * the label instead (`Wanderstöcke · Andy`). The row drew the face **and**
   * the mark slot, and started its name 32 px right of every sibling in the
   * same group — 481 px against 449 px, measured at 1280 px on the sample
   * data. Both the unit case and E2E-M4-56 claimed this rule in general and
   * tested it only against rows with no traveler.
   */
  test('E2E-M4-72: a per-person row starts its name where every other row does', async ({
    page,
  }) => {
    test.slow()
    await createTripViaWizard(page, M4_TRIP)
    await quickAddRows(page, ['Velohelme'])

    // The per-person path, with exactly one person lit — which is what
    // produces a flat row rather than a cluster.
    await openQuickAdd(page)
    await lightTraveler(page, 'quick-add', 'Andy')
    await addInComposer(page, 'Wanderstöcke')

    const list = visible(page)
    const perPerson = list.getByTestId('m4-row-Wanderstöcke')
    const plain = list.getByTestId('m4-row-Velohelme')

    // It really is the lone-instance shape, and it really does still name the
    // person — without which the equality below would be satisfied by a row
    // that had simply lost its traveler.
    await expect(list.getByTestId('m4-cluster-Wanderstöcke')).toHaveCount(0)
    await expect(perPerson).toContainText('Andy')

    const perPersonName = (await perPerson.locator('h3').first().boundingBox())!
    const plainName = (await plain.locator('h3').first().boundingBox())!
    expect(perPersonName.x).toBe(plainName.x)

    // The rule under it, so a future row that aligns by accident does not
    // pass: the column itself is one width.
    const perPersonLead = (await perPerson.locator('.row-lead').boundingBox())!
    const plainLead = (await plain.locator('.row-lead').boundingBox())!
    expect(perPersonLead.width).toBe(plainLead.width)
  })

  /*
   * E2E-M4-73 (FR-21.20): a cluster head is a line of the list; its people
   * are the ones stepping in.
   *
   * The indent and its rule used to sit on the whole cluster, head included,
   * so the item's name sat 8 px right of every other item name and only 6 px
   * left of its own travelers — 457 against 449 and 463, measured at 1280 px.
   * A head that close to its children reads as one of them. Both halves are
   * asserted: an equality alone would pass on a build that had also flattened
   * the children, and the step alone on one that had left the head inset.
   */
  test('E2E-M4-73: a cluster head lines up with the item rows, its people step in', async ({
    page,
  }) => {
    test.slow()
    await createTripViaWizard(page, M4_TRIP)
    await quickAddRows(page, ['Velohelme'])

    await openQuickAdd(page)
    for (const who of ['Andy', 'Sia']) await lightTraveler(page, 'quick-add', who)
    await addInComposer(page, 'Regenjacke')

    const list = visible(page)
    const nameX = async (locator: Locator, selector: string) =>
      (await locator.locator(selector).first().boundingBox())!.x

    // FR-25.23: the children only exist once the cluster is open, and this
    // case is about where their names land.
    await openCluster(page, 'Regenjacke')

    const plainRow = await nameX(list.getByTestId('m4-row-Velohelme'), 'h3')
    const head = await nameX(list.getByTestId('m4-cluster-Regenjacke'), '.cluster-name')
    const child = await nameX(list.getByTestId('m4-child-Regenjacke-Andy'), 'h3')

    // It is a cluster, with people under it — without which the two
    // assertions below would be about rows that do not exist.
    await expect(list.getByTestId('m4-child-Regenjacke-Sia')).toBeVisible()

    // The head is one of the list's lines…
    expect(head).toBe(plainRow)
    // …and the people under it are indented from it, not level with it.
    expect(child).toBeGreaterThan(head)
  })

  /*
   * E2E-M4-74 (FR-21.22): the bar that reveals the packed rows is a button.
   *
   * It was drawn with a dashed outline and no fill — this app's mark for a
   * place where something is *not yet*, worn by the empty picker slot and the
   * quick-add invitation. On a control that reveals rows which exist and are
   * counted in its own label, that mark reads as a drop zone or a
   * placeholder. Both halves are asserted: the edge it no longer wears, and
   * the state it now tells a reader who cannot see the caret.
   */
  test('E2E-M4-74: the reveal bar wears a button’s edge and says which way it goes', async ({
    page,
  }) => {
    await createTripViaWizard(page, M4_TRIP)
    await quickAddRows(page, ['Zelt', 'Velohelme'])

    // A packed row is what puts the bar on the screen (FR-25.2).
    await visible(page).getByTestId('m4-row-Zelt').getByTestId('row-check').click()
    const bar = visible(page).getByTestId('m4-done-bar')
    await expect(bar).toHaveText('Show 1 packed')

    await expect(bar).toHaveCSS('border-style', 'solid')
    await expect(bar).toHaveAttribute('aria-expanded', 'false')

    // And it does the one thing it says: the row it counted comes back.
    await bar.click()
    await expect(bar).toHaveAttribute('aria-expanded', 'true')
    await expect(visible(page).getByTestId('m4-row-Zelt')).toBeVisible()
  })

  /*
   * E2E-M4-75 (FR-21.23): the screen where the progress is *made* says how
   * far along the trip is the way every other screen says it — a ring, the
   * share in words and a track. It had said it as a bare fraction.
   *
   * All three are asserted against the same pack, because the point of the
   * figure is that they cannot disagree: the ring and the track are drawn
   * from one percentage, and the sentence counts the units under it
   * (FR-25.22).
   */
  test('E2E-M4-75: the header line answers the trip as a ring, a sentence and a track', async ({
    page,
  }) => {
    await createTripViaWizard(page, M4_TRIP)
    await quickAddRows(page, ['Zelt', 'Schlafsack', 'Kocher', 'Stirnlampe'])

    const ring = visible(page).getByTestId('progress-ring')
    await expect(ring).toHaveAttribute('aria-label', '0%')
    await expect(visible(page).getByTestId('m4-progress')).toContainText('0/4')
    const track = visible(page).getByTestId('m4-header').locator('.track i')
    await expect(track).toHaveCSS('width', '0px')

    await packRow(page, 'Zelt')

    await expect(ring).toHaveAttribute('aria-label', '25%')
    await expect(visible(page).getByTestId('m4-progress')).toContainText('1/4')
    // A quarter of the track's own width, whatever the viewport made that —
    // as a ratio of two rendered boxes rather than a pixel string. Both are
    // fractional on WebKit (19.0625 of 76.25), and `clientWidth` rounds one
    // of them, so the string comparison was a rounding claim.
    const share = await track.evaluate(
      (el) => el.getBoundingClientRect().width / el.parentElement!.getBoundingClientRect().width,
    )
    expect(share).toBeCloseTo(0.25, 2)
  })

  /*
   * E2E-M4-76 (FR-21.24): one door to the composer, not two.
   *
   * The collapsed pill sat above the list and the FAB hovered over it, both
   * opening the same form. The case pins the absence *and* the door that is
   * left — an absence alone would stay green on a screen that lost both.
   */
  test('E2E-M4-76: the list offers the quick-add once, through the FAB', async ({ page }) => {
    await createTripViaWizard(page, M4_TRIP)

    await expect(visible(page).getByTestId('quick-add-open')).toHaveCount(0)
    await expect(visible(page).getByTestId('quick-add-input')).toHaveCount(0)

    await openQuickAdd(page)
    await expect(visible(page).getByTestId('quick-add-input')).toBeVisible()
  })

  /*
   * E2E-M4-77 (FR-24.2): a generated row is filed under the item's tag.
   *
   * M4 groups by category by default, and every row a Vorlage produced
   * landed in the leftover bucket: generation read a `category_name` on the
   * master item that nothing ever wrote. The case builds the one path that
   * proves it — tag an item in M9, put it in a group, follow the group into
   * a trip — and asserts the heading. The untagged row beside it is the
   * positive signal that the bucket still exists and the case is reading a
   * real grouping rather than one heading for everything.
   */
  test('E2E-M4-77: a row generated from a group carries the item’s tag as its heading', async ({
    page,
  }) => {
    test.slow()
    await page.goto(PATH.items)
    await createItem(page, 'Badehose', { tags: ['Sommer'] })
    await backToInventory(page)
    await page.goto(PATH.templates)
    await createTemplate(page, 'group', 'Strand')
    await addPosition(page, 'Badehose')
    await addPosition(page, 'Schlüssel')
    await page.keyboard.press('Escape')

    await createTripFollowingGroup(page, 'Strandprobe', 'Strand')

    // Rows are siblings of their heading, not children of it, so membership
    // is read off the heading's tally: one row under the tag, one in the
    // leftover bucket. Before the fix there was no `Sommer` heading at all
    // and the bucket said 0/2 — which is what makes 0/1 here falsifiable.
    await expect(visible(page).getByTestId('m4-group-Sommer')).toContainText('0/1')
    await expect(visible(page).getByTestId('m4-group-none')).toContainText('0/1')
    await expect(visible(page).getByTestId('m4-row-Badehose')).toBeVisible()
    await expect(visible(page).getByTestId('m4-row-Schlüssel')).toBeVisible()
  })

  /*
   * E2E-M4-85 (FR-25.11l): picking a Status value overrides the Erledigte
   * switch for exactly the rows it names.
   *
   * The unit test proves the bucketing arithmetic; what only the rendered
   * panel can prove is the override — that Erledigte can stay off while the
   * one picked bucket still renders, which is the whole reason the FR exists:
   * otherwise the panel would report a nonzero "Gepackt" count and show
   * nothing for it, the exact contradiction FR-25.11e forbids elsewhere.
   */
  test('E2E-M4-85: the Status facet overrides Erledigte for the picked bucket', async ({
    page,
  }) => {
    await createTripViaWizard(page, M4_TRIP)
    await quickAddRows(page, ['Zelt', 'Lampe', 'Kocher'])

    await packRow(page, 'Zelt')
    await openRowMenu(page, 'Lampe')
    await chooseInRowMenu(page, /do not pack this/i)

    // Both done rows are behind the reveal bar by default; Kocher is open.
    await expect(page.getByTestId('m4-row-Kocher')).toBeVisible()
    await expect(page.getByTestId('m4-row-Zelt')).toHaveCount(0)
    await expect(page.getByTestId('m4-row-Lampe')).toHaveCount(0)

    await page.getByTestId('m4-filter').click()
    await page.getByTestId('facet-status-packed').click()
    await page.getByTestId('filter-close').click()

    // Erledigte is still off, yet the packed row alone is shown.
    await expect(page.getByTestId('m4-row-Zelt')).toBeVisible()
    await expect(page.getByTestId('m4-row-Lampe')).toHaveCount(0)
    await expect(page.getByTestId('m4-row-Kocher')).toHaveCount(0)
    await expect(page.getByTestId('m4-filter-bar')).toContainText(/Status/i)

    await page.getByTestId('m4-filter').click()
    await page.getByTestId('facet-status-packed').click()
    await page.getByTestId('facet-status-skipped').click()
    await page.getByTestId('filter-close').click()

    await expect(page.getByTestId('m4-row-Lampe')).toBeVisible()
    await expect(page.getByTestId('m4-row-Zelt')).toHaveCount(0)
    await expect(page.getByTestId('m4-row-Kocher')).toHaveCount(0)
  })

  /*
   * E2E-M4-93 (FR-25.27): a row that is packed on departure day sinks below
   * the rows that can be dealt with now.
   *
   * The order is read before the flag as well as after it, because an
   * assertion on a list that was already in that order says nothing: the
   * flag has to be what moved the row.
   */
  test('E2E-M4-93: flagging a row as late-packer drops it to the end of its group', async ({
    page,
  }) => {
    await createTripViaWizard(page, M4_TRIP)
    await quickAddRows(page, ['Schlüssel', 'Zelt', 'Lampe'])

    const order = () =>
      visible(page)
        .locator('[data-testid^="m4-row-"]')
        .evaluateAll((rows) => rows.map((el) => (el as HTMLElement).dataset['testid']))

    expect(await order()).toEqual(['m4-row-Schlüssel', 'm4-row-Zelt', 'm4-row-Lampe'])

    await openRowMenu(page, 'Schlüssel')
    await chooseInRowMenu(page, /late packer on/i)
    await expect(
      visible(page).getByTestId('m4-row-Schlüssel').getByTestId('row-late'),
    ).toBeVisible()

    expect(await order()).toEqual(['m4-row-Zelt', 'm4-row-Lampe', 'm4-row-Schlüssel'])

    // And it stays above what needs nothing at all: three tiers, not two.
    await packRow(page, 'Zelt')
    // The undo snackbar sits over the reveal bar, and a click that lands on
    // it while it leaves never opens the section — E2E-M4-68's trap, dismissed
    // the same way rather than waited out.
    // Every one: since FR-25.31 more than one act on the way here raises one.
    await page
      .locator('ion-toast.pack-toast')
      .evaluateAll((els) => els.forEach((el) => void (el as HTMLIonToastElement).dismiss()))
    await expect(page.locator('ion-toast.pack-toast')).toHaveCount(0)
    await page.getByTestId('m4-done-bar').click()
    // The packed row on screen is the settled state the one-shot read needs.
    await expect(visible(page).getByTestId('m4-row-Zelt')).toBeVisible()
    expect(await order()).toEqual(['m4-row-Lampe', 'm4-row-Schlüssel', 'm4-row-Zelt'])
  })

  /*
   * E2E-M4-94 (FR-25.27): the late-packer rows can be put away, and never
   * silently — the bar is what keeps an emptied list from reading as done.
   */
  test('E2E-M4-94: the late-packer switch hides those rows and says so', async ({ page }) => {
    await createTripViaWizard(page, M4_TRIP)
    await quickAddRows(page, ['Schlüssel', 'Zelt'])

    await openRowMenu(page, 'Schlüssel')
    await chooseInRowMenu(page, /late packer on/i)
    await expect(
      visible(page).getByTestId('m4-row-Schlüssel').getByTestId('row-late'),
    ).toBeVisible()

    await page.getByTestId('m4-filter').click()
    await expect(page.getByTestId('filter-sheet')).toBeVisible()
    // The switch starts on: this is the one class of rows the screen does
    // not put away by itself.
    const lateSwitch = page.getByTestId('filter-switch-late')
    expect(await lateSwitch.evaluate((el) => (el as HTMLInputElement).checked)).toBe(true)
    await lateSwitch.click()
    await page.getByTestId('filter-close').click()

    await expect(page.getByTestId('m4-row-Schlüssel')).toHaveCount(0)
    await expect(page.getByTestId('m4-row-Zelt')).toBeVisible()
    const bar = visible(page).getByTestId('m4-late-bar')
    await expect(bar).toContainText('1')

    // FR-25.32: a search finds the hidden row and the bar has nothing left
    // to offer; clearing the term puts both back.
    await page.getByTestId('m4-search').click()
    await page.getByTestId('m4-search-input').fill('Schlüssel')
    await expect(visible(page).getByTestId('m4-row-Schlüssel')).toBeVisible()
    await expect(bar).toHaveCount(0)
    await page.getByTestId('m4-search-input').fill('')
    await expect(page.getByTestId('m4-row-Schlüssel')).toHaveCount(0)
    await expect(bar).toContainText('1')

    // Packing everything else must not turn the remainder into "alles
    // gepackt": the reset offer is the signal that the screen knows it is
    // still hiding something.
    await packRow(page, 'Zelt')
    await expect(visible(page).getByTestId('m4-reset')).toBeVisible()

    // And the bars run in the order their rows do (owner, 2026-09-18): rows
    // that still ask for something stand above rows that ask for nothing.
    expect(
      await visible(page)
        .locator('[data-testid="m4-late-bar"], [data-testid="m4-done-bar"]')
        .evaluateAll((bars) => bars.map((el) => (el as HTMLElement).dataset['testid'])),
    ).toEqual(['m4-late-bar', 'm4-done-bar'])

    // The undo snackbar from packing Zelt sits over the bars, and a click
    // that lands while it leaves never toggles the section — the trap of
    // E2E-M4-93 and E2E-M4-68, dismissed the same way rather than waited out.
    // Every one: since FR-25.31 more than one act on the way here raises one.
    await page
      .locator('ion-toast.pack-toast')
      .evaluateAll((els) => els.forEach((el) => void (el as HTMLIonToastElement).dismiss()))
    await expect(page.locator('ion-toast.pack-toast')).toHaveCount(0)
    await bar.click()
    await expect(page.getByTestId('m4-row-Schlüssel')).toBeVisible()
  })
})
