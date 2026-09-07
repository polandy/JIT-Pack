import {
  test,
  expect,
  visiblePage,
  createTripViaWizard,
  openQuickAdd,
  openTripView,
} from './fixtures'
import type { Locator } from '@playwright/test'
import { PATH } from './routes'

/**
 * Typography (UI-Test-Spec §3, G-13; Addendum FR-21.5/FR-21.6).
 *
 * The stylesheet unit test (src/theme/__tests__/typography.spec.ts) reads
 * the file; these two assert the only things a source read cannot see —
 * that the cascade actually reaches the elements, and that the browser
 * fetched the faces from this origin and no other.
 *
 * `document.fonts.ready` is the deterministic seam: it settles when font
 * loading for the current layout has finished, so nothing here waits on a
 * clock.
 */

const HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com']

/** The families the browser resolved for an element, lower-cased. */
async function resolvedFamily(el: Locator) {
  return el.evaluate((node) => getComputedStyle(node).fontFamily.toLowerCase())
}

// E2E-G13-01 (G-13/FR-21.5): both faces reach the screen — the UI face
// through --ion-font-family, the display face through the role classes.
// Until this PR the client declared no font-family at all and rendered in
// whatever Ionic's platform stack resolved to.
test('E2E-G13-01: the UI face carries the body and the display face the page title @local @g13', async ({
  page,
  seedMode,
}) => {
  await seedMode({ mode: 'local' })
  await page.goto('/')
  await expect(page.getByTestId('dashboard-greeting')).toBeVisible()

  // `.button-native` (an <a> here, since the CTA is a router link), not
  // the ion-button host: that is the node Ionic styles from
  // --ion-font-family, so it proves the variable is bound rather than the
  // family merely inheriting down from body.
  expect(
    await resolvedFamily(page.getByTestId('dashboard-plan-trip').locator('.button-native')),
  ).toContain('hanken grotesk')
  expect(await resolvedFamily(page.getByTestId('dashboard-greeting'))).toContain('fraunces')

  // Resolving the family is not the same as having the bytes: a missing
  // asset leaves the computed style intact and paints the fallback.
  const loaded = await page.evaluate(async () => {
    await document.fonts.ready
    return [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family)
  })
  expect(loaded).toContain('Hanken Grotesk')
  expect(loaded).toContain('Fraunces')
})

// E2E-G13-02 (FR-21.6): self-hosted, not fetched from Google. Local Mode
// may have no network at all, and NFR-4.3 rules out a third-party request
// on every boot — so the regression to guard is the prototype's
// stylesheet link finding its way back into the app.
test('E2E-G13-02: no font is fetched from a third-party host @local @g13', async ({
  page,
  seedMode,
}) => {
  const offSite: string[] = []
  page.on('request', (req) => {
    const host = new URL(req.url()).hostname
    if (HOSTS.includes(host)) offSite.push(req.url())
  })

  await seedMode({ mode: 'local' })
  await page.goto('/')
  await expect(page.getByTestId('dashboard-greeting')).toBeVisible()
  await page.evaluate(() => document.fonts.ready)

  expect(offSite).toEqual([])

  // …and what it did fetch came from this origin.
  const fontRequests = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map((e) => e.name)
      .filter((n) => n.endsWith('.woff2')),
  )
  expect(fontRequests.length).toBeGreaterThan(0)
  for (const url of fontRequests) {
    expect(new URL(url).origin).toBe(new URL(page.url()).origin)
  }
})

// E2E-G13-03 (G-13/FR-21.5): the scale reaches the screen, and icons are
// sized from their own table rather than from the type scale.
test('E2E-G13-03: an icon is sized as a glyph box, not as text @local @g13', async ({
  page,
  seedMode,
}) => {
  await seedMode({ mode: 'local' })
  await page.goto(PATH.trips)
  await page.waitForFunction(() => document.fonts.ready.then(() => true))

  const size = (el: Locator) => el.evaluate((n) => parseFloat(getComputedStyle(n).fontSize))

  // An empty-state illustration and body copy are both `font-size`, and
  // that is exactly why they need separate tables: one is a glyph box, the
  // other is type. Sharing a scale would have tied the illustration to
  // whatever body copy does next.
  const icon = page.locator('.empty-icon').first()
  await expect(icon).toBeVisible()
  expect(await size(icon)).toBe(64)
  expect(await size(page.locator('body'))).toBeLessThan(20)
})

// E2E-G13-04 (G-13/FR-21.11): the head above a block renders as the display
// role. The promise this case carried before was the opposite one — that the
// same head rendered as small tracked capitals — and it is reversed rather
// than repaired, because the eyebrow stopped being the head's role.
test('E2E-G13-04: a section head renders as the display role @local @g13', async ({
  page,
  seedMode,
}) => {
  await seedMode({ mode: 'local' })
  await page.goto(PATH.settings)
  await page.waitForFunction(() => document.fonts.ready.then(() => true))

  // Scoped to the page that is actually painted, not to the document: a
  // route that does not repaint leaves the previous screen's markup in the
  // outlet, and every assertion below would read it happily.
  const head = visiblePage(page).getByTestId('settings-section-profile')
  await expect(head).toBeVisible()

  const style = await head.evaluate((n) => {
    const cs = getComputedStyle(n)
    return {
      transform: cs.textTransform,
      size: parseFloat(cs.fontSize),
      family: cs.fontFamily.toLowerCase(),
    }
  })

  // Asserting the *rendered* properties rather than the class list is the
  // point: a class that is applied but overridden looks identical in the
  // markup, and this head sits inside a screen with its own stylesheet.
  expect(style.transform).toBe('none')
  expect(style.family).toContain('fraunces')
  expect(style.size).toBeGreaterThan(16)
})

// E2E-G13-05 (G-13/FR-21.11): the count is the head's number, not its voice.
// Five heads used to join the two inside the translated string, which set the
// figure in the display face and left it nothing to align with.
test('E2E-G13-05: a section count renders beside the head, in the UI face @local @g13', async ({
  page,
  seedMode,
}) => {
  await seedMode({ mode: 'local' })
  await createTripViaWizard(page, { name: 'Samedan 2026', travelers: ['Andy'] })
  await openQuickAdd(page)
  await page.getByTestId('quick-add-input').locator('input').fill('Schlafsack')
  await page.getByTestId('quick-add-confirm').click()
  await expect(page.getByTestId('m4-row-Schlafsack')).toBeVisible()
  await openTripView(page, 'luggage')

  const head = visiblePage(page).getByTestId('m11-unassigned-title')
  await expect(head).toBeVisible()
  const count = head.locator('.jp-section-count')
  await expect(count).toHaveText('1')

  const style = await count.evaluate((n) => {
    const cs = getComputedStyle(n)
    return {
      family: cs.fontFamily.toLowerCase(),
      size: parseFloat(cs.fontSize),
      figures: cs.fontVariantNumeric,
    }
  })
  const headSize = await head.evaluate((n) => parseFloat(getComputedStyle(n).fontSize))

  expect(style.family).toContain('hanken grotesk')
  expect(style.size).toBeLessThan(headSize)
  // A counter that is not tabular shifts the head's baseline as it counts.
  expect(style.figures).toContain('tabular-nums')
})
