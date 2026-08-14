import { test, expect, createTripViaWizard } from './fixtures'
import type { Locator, Page } from '@playwright/test'

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
 * which is how the Latte case first failed, on a page that was perfectly
 * correct.
 */
async function cardWithOneRow(page: Page, trip: string) {
  await createTripViaWizard(page, { name: trip, travelers: ['Andy'] })
  await page.getByTestId('m4-fab').click()
  await page.getByTestId('quick-add-input').locator('input').fill('Zelt')
  await page.getByTestId('quick-add-confirm').click()
  await expect(page.getByTestId('m4-row-Zelt')).toBeVisible()

  const card = page.locator('.group-card').first()
  await expect(card).toBeVisible()
  return card
}

// E2E-G14-01 (G-14/FR-21.8): a card is a plane above the page, not a
// hairline drawn on it.
test('G-14: the packing card is painted a different plane than its page @local @g14', async ({
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
})

// E2E-G14-02 (G-14/FR-21.8): elevation is cast in the flavour's ink. In
// Latte the shadow is thrown in the darkest neutral, not in crust — which
// there is a light grey and would cast no shadow at all.
test('G-14: the card still casts a shadow in Latte @local @g14', async ({ page, seedMode }) => {
  await seedMode({ mode: 'local', theme: 'latte' })
  await page.setViewportSize(MOBILE)
  const card = await cardWithOneRow(page, 'Helltest')

  // Prove the flavour switched before asserting anything about it.
  await expect(page.locator('html')).toHaveClass(/jitpack-latte/)

  const shadow = await computed(card, 'box-shadow')
  const drop = /rgba?\(([^)]+)\)(?!.*inset)/.exec(shadow.split('inset').pop() ?? '')
  expect(drop, `no drop shadow in ${shadow}`).not.toBeNull()
  const ink = drop![1]
    .split(',')
    .slice(0, 3)
    .reduce((sum, n) => sum + Number(n.trim()), 0)

  const cardBytes = await toBytes(page, await computed(card, 'background-color'))
  expect(
    cardBytes.reduce((a, b) => a + b),
    'the Latte card is not a light surface',
  ).toBeGreaterThan(600)

  // The assertion that matters, and the one this case did not make at
  // first. "Darker than the card" is satisfied by Latte's crust — 676 to
  // the card's 725 — so reusing Mocha's ink passed a test written to
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
