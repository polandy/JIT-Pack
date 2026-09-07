import { test, expect, createTripViaWizard, openQuickAdd } from './fixtures'
import type { Locator, Page } from '@playwright/test'
import { PATH } from './routes'

/**
 * Surfaces (UI-Test-Spec §3, G-14; Addendum FR-21.8).
 *
 * The unit suite reads the token tables; these assert what a browser
 * actually painted, because the defect this closes was invisible to every
 * other kind of check. `.group-card` declared `background: var(--ct-mantle)`
 * — a perfectly valid token, sourced from the palette, passing the colour
 * invariant — which happened to be the exact colour of the page behind it.
 * Only a rendered pixel can tell you that a card and its page are the same
 * shade; a stylesheet reads as correct either way.
 */

const MOBILE = { width: 390, height: 844 }

/** A computed property of an element, as the browser resolved it. */
function computed(el: Locator, prop: string) {
  return el.evaluate((node, p) => getComputedStyle(node).getPropertyValue(p).trim(), prop)
}

/**
 * A colour resolved to bytes, whatever notation it was written in.
 *
 * Same reason as in colour-anchors.spec.ts: `color-mix()` computes to
 * `color(srgb …)` and a plain token to `rgb(…)`, so two identical paints
 * compare unequal as strings.
 */
function toBytes(page: Page, value: string): Promise<number[]> {
  return page.evaluate((v) => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = v
    ctx.fillRect(0, 0, 1, 1)
    return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3)
  }, value)
}

/**
 * A packing list with one row in it, and the group card that row created.
 *
 * The card only exists once a group does, so an empty trip renders none —
 * which is how the Tag case first failed, on a page that was perfectly
 * correct.
 */
async function cardWithOneRow(page: Page, trip: string) {
  await createTripViaWizard(page, { name: trip, travelers: ['Andy'] })
  await openQuickAdd(page)
  await page.getByTestId('quick-add-input').locator('input').fill('Zelt')
  await page.getByTestId('quick-add-confirm').click()
  await expect(page.getByTestId('m4-row-Zelt')).toBeVisible()

  const card = page.locator('.group-card').first()
  await expect(card).toBeVisible()
  return card
}

// E2E-G14-01 (G-14/FR-21.8): a card is a plane above the page, not a
// hairline drawn on it.
test('E2E-G14-01: the packing card is painted a different plane than its page @local @g14', async ({
  page,
  seedMode,
}) => {
  await seedMode({ mode: 'local' })
  await page.setViewportSize(MOBILE)
  const card = await cardWithOneRow(page, 'Flächentest')

  const cardPaint = await toBytes(page, await computed(card, 'background-color'))
  const pagePaint = await toBytes(
    page,
    await computed(page.locator('ion-content.pack-content'), '--background'),
  )

  // The whole defect in one assertion. Before this the two were both
  // --ct-mantle and this compared equal.
  expect(cardPaint, 'the card is painted the same colour as its page').not.toEqual(pagePaint)

  // And it is genuinely raised, not merely a different colour: the card
  // carries the elevation token rather than a shadow of its own.
  expect(await computed(card, 'box-shadow')).not.toBe('none')
  expect(await computed(card, 'border-radius')).toBe('18px')

  // The card must be raised above the *page*, not above a slab of its own
  // colour. Ionic paints `ion-list` from `--ion-item-background`, which is
  // the card plane — so the list holding these cards had a card-coloured
  // background of its own and every shadow fell onto it. Nothing else here
  // notices: the card/page comparison above stayed green throughout.
  //
  // It also exercises `ion-list:has(.jp-card)` in both engines, which is
  // the whole mechanism and the one part of this PR that depends on `:has()`
  // resolving the same way in Chromium and WebKit.
  const listPaint = await toBytes(
    page,
    await computed(page.locator('ion-list').first(), 'background-color'),
  )
  expect(listPaint, 'the list behind the cards paints the card plane').not.toEqual(cardPaint)
})

// E2E-G14-03 (G-14/FR-21.8): a card gives the *group* an edge, not its
// entries — the rows inside still need a seam between them.
test('E2E-G14-03: rows inside a card keep a seam, and the last one does not @local @g14', async ({
  page,
  seedMode,
}) => {
  await seedMode({ mode: 'local' })
  await page.setViewportSize(MOBILE)
  for (const name of ['Erste Reise', 'Zweite Reise', 'Dritte Reise']) {
    await createTripViaWizard(page, { name, travelers: ['Andy'] })
    await page.goto(PATH.trips)
  }
  await page.getByTestId('trips-filter-planned').click({ force: true })

  const rows = page.locator('.trip-card ion-item-sliding ion-item')
  await expect(rows).toHaveCount(3)

  /**
   * The seam as the browser actually drew it, off `.item-inner` inside
   * `ion-item`'s shadow root.
   *
   * Not `--inner-border-width` on the host: the first version of this
   * case read that, and it passed against `lines="none"` — the very bug
   * it was written for. Ionic drives the line from an attribute selector
   * in its own stylesheet, so the custom property is simply unset on a
   * row nobody styled, and "unset" is not "0".
   */
  const seam = (i: number) =>
    rows
      .nth(i)
      .locator('.item-inner')
      .evaluate((n) => parseFloat(getComputedStyle(n).borderBottomWidth))

  // Turning Ionic's lines off made three trips run together with nothing
  // between them — the card's own edge is the group's boundary and says
  // nothing about where one entry ends.
  expect(await seam(0), 'no seam between two trips in one card').toBeGreaterThan(0)
  expect(await seam(1)).toBeGreaterThan(0)

  // The last row's seam *is* the card's bottom edge, so drawing it too
  // puts a line a hair above the border it duplicates.
  expect(await seam(2), 'the last row draws a line onto the card edge').toBe(0)
})

// E2E-G14-02 (G-14/FR-21.8): elevation is cast in the flavour's ink. In
// Tag the shadow is thrown in the darkest neutral, not in crust — which
// there is a light grey and would cast no shadow at all.
test('E2E-G14-02: the card still casts a shadow in Tag @local @g14', async ({ page, seedMode }) => {
  await seedMode({ mode: 'local', theme: 'day' })
  await page.setViewportSize(MOBILE)
  const card = await cardWithOneRow(page, 'Helltest')

  // Prove the flavour switched before asserting anything about it.
  await expect(page.locator('html')).toHaveClass(/jitpack-day/)

  const shadow = await computed(card, 'box-shadow')
  const drop = /rgba?\(([^)]+)\)(?!.*inset)/.exec(shadow.split('inset').pop() ?? '')
  expect(drop, `no drop shadow in ${shadow}`).not.toBeNull()
  const channels = drop?.[1]
  expect(channels, `no colour channels in ${shadow}`).toBeDefined()
  const ink = channels!
    .split(',')
    .slice(0, 3)
    .reduce((sum, n) => sum + Number(n.trim()), 0)

  const cardBytes = await toBytes(page, await computed(card, 'background-color'))
  expect(
    cardBytes.reduce((a, b) => a + b),
    'the Tag card is not a light surface',
  ).toBeGreaterThan(600)

  // The assertion that matters, and the one this case did not make at
  // first. "Darker than the card" is satisfied by Tag's crust — 676 to
  // the card's 725 — so reusing Nacht's ink passed a test written to
  // catch exactly that. What a shadow has to be is darker than every
  // *surface* in the flavour, sunken plane included; anything lighter is
  // a plane, and planes do not cast shadows.
  const sunken = await toBytes(
    page,
    await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--jp-surface-sunken').trim(),
    ),
  )
  expect(ink, 'the shadow is cast in a colour the palette uses as a surface').toBeLessThan(
    sunken.reduce((a, b) => a + b),
  )
})

// E2E-G14-04 (G-14/FR-21.12): every sheet leaves the same way. Eight sheets
// drew the control themselves, in two designs split four against four — the
// same button, two appearances, and nothing recording which was meant. The
// assertion compares two sheets that used to be on opposite sides of that
// split, because a single sheet's rendering would have been green either way.
test('E2E-G14-04: two sheets present the same way out @local @g14', async ({ page, seedMode }) => {
  await seedMode({ mode: 'local' })
  await page.setViewportSize(MOBILE)

  await page.goto(PATH.trips)
  await page.getByTestId('sync-indicator').click()
  const fromSync = await closeControl(page, 'sync-detail-close')
  await page.getByTestId('sync-detail-close').click()

  await createTripViaWizard(page, { name: 'Samedan 2026', travelers: ['Andy'] })
  await openQuickAdd(page)
  await page.getByTestId('quick-add-input').locator('input').fill('Schlafsack')
  await page.getByTestId('quick-add-confirm').click()
  await page.getByTestId('m4-row-Schlafsack').click()
  const fromItem = await closeControl(page, 'm5-close')

  expect(fromSync).toEqual(fromItem)
  // …and it is a filled circle, not the ghost half of them had: the fill is
  // a plane rather than the page it sits on.
  expect(fromSync.background).not.toBe('rgba(0, 0, 0, 0)')
})

/** The rendered geometry and fill of a sheet's way out. */
async function closeControl(page: Page, testid: string) {
  const el = page.getByTestId(testid)
  await expect(el).toBeVisible()
  return el.evaluate((n) => {
    const cs = getComputedStyle(n)
    const box = n.getBoundingClientRect()
    return {
      width: Math.round(box.width),
      height: Math.round(box.height),
      radius: cs.borderRadius,
      background: cs.backgroundColor,
      border: cs.borderTopWidth,
    }
  })
}
