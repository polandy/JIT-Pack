import { test, expect } from './fixtures'
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
test('G-13: the UI face carries the body and the display face the page title @local @g13', async ({
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
test('G-13: no font is fetched from a third-party host @local @g13', async ({ page, seedMode }) => {
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
