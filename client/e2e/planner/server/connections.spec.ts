import type { Route } from '@playwright/test'

import { test, expect, createTripViaWizard } from '../../fixtures'
import {
  openConnectionStep,
  openDayPlan,
  openLinkStep,
  pasteLink,
  timelineLines,
} from '../../helpers/m29'
import { uniq } from '../../serverMode'
import { SBB_SHORT_LINK, SBB_TRIP_LINK } from '../../../src/planner/domain/__tests__/sbbFixture'

import { loginAs } from '../../server/fixtures'

/**
 * FR-29.18: the SBB app shares a short link, which only its page resolves —
 * and only the server can read another site's page. As in
 * `link-preview.spec.ts`, the page read's answer is planted (a test page
 * would be on loopback, which the server's fetch refuses); everything around
 * it is real: the sheet asking for the short link's page, finding the trip
 * link among its links and reading the legs out of it.
 */

test.describe('Connections from a short link (FR-29.18) @server @planner', () => {
  test.slow()

  /**
   * E2E-M29-09: a pasted SBB short link is followed through the server's read
   * of its page, and the connection its trip link carries is read and written.
   */
  test('E2E-M29-09: a short link is followed through its page to its legs', async ({ browser }) => {
    const ctx = await browser.newContext()
    const alice = await loginAs(ctx, 'alice')
    await createTripViaWizard(alice, {
      name: `Engadin ${uniq()}`,
      startDate: '2026-10-09',
      endDate: '2026-10-11',
    })
    const asked: string[] = []
    await alice.route('**/api/v1/trips/*/link-preview', async (route: Route) => {
      asked.push((route.request().postDataJSON() as { url: string }).url)
      await route.fulfill({
        json: {
          title: 'SBB Mobile',
          description: '',
          image_url: '',
          links: ['https://itunes.apple.com/app/sbb-mobile/id294855237', SBB_TRIP_LINK],
        },
      })
    })

    await openDayPlan(alice)
    const sheet = await openConnectionStep(alice)
    await openLinkStep(sheet)
    await pasteLink(sheet, SBB_SHORT_LINK)
    await expect(sheet.getByTestId('day-entry-read-state')).toHaveText('✓ 5 legs read.')
    expect(asked).toEqual([SBB_SHORT_LINK])
    await sheet.getByTestId('connection-take').click()
    await sheet.getByTestId('day-entry-save').click()
    await expect(alice.getByTestId('day-entry-save')).toHaveCount(0)

    const line = timelineLines(alice).filter({ hasText: 'To Bern, Cäcilienstrasse' })
    await expect(line).toContainText('arr. 15:46')
    await line.locator('[data-testid^="m29-legs-toggle-"]').click()
    // The short link is what was pasted, and what opens the app.
    await expect(line.getByTestId('connection-open-link')).toHaveAttribute('href', SBB_SHORT_LINK)
    await ctx.close()
  })
})
