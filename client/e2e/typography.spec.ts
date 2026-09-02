import { test, expect, visiblePage } from './fixtures'
import type { Locator } from '@playwright/test'

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
  await page.goto('/tabs/trips')
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

// E2E-G13-04 (G-13/FR-21.5): the section label renders as the role, on a
// screen that had written it out by hand.
test('E2E-G13-04: a section label renders as the eyebrow role @local @g13', async ({
  page,
  seedMode,
}) => {
  await seedMode({ mode: 'local' })
  await page.goto('/tabs/settings')
  await page.waitForFunction(() => document.fonts.ready.then(() => true))

  // Scoped to the page that is actually painted, not to the document: a
  // route that does not repaint leaves the previous screen's markup in the
  // outlet, and every assertion below would read it happily.
  const label = visiblePage(page).locator('.section-title').first()
  await expect(label).toBeVisible()

  const style = await label.evaluate((n) => {
    const cs = getComputedStyle(n)
    return {
      transform: cs.textTransform,
      size: parseFloat(cs.fontSize),
      family: cs.fontFamily.toLowerCase(),
      tracking: cs.letterSpacing,
    }
  })

  // The visible half of this PR. Eleven screens carried the label by hand
  // and disagreed about it: nine as a 16px semibold sentence, two as the
  // uppercase label the prototype specifies. Asserting the *rendered*
  // properties rather than the class list is the point — a class that is
  // applied but overridden looks identical in the markup.
  expect(style.transform).toBe('uppercase')
  expect(style.size).toBe(12)
  expect(style.family).toContain('hanken grotesk')
  expect(style.tracking).not.toBe('normal')
})
