/**
 * U-10 — a screen that shows one trip loads that trip's partition (G-4).
 *
 * Asserted over the *source*, the way `iconButtonLabels.spec.ts` asserts its
 * rule, because the alternative is one mount spec per screen for a line that
 * is identical in all of them — and because the defect this exists for is an
 * *omission*. Seven screens rendered the trip store without ever asking for
 * its rows; each of them was individually green, and the only thing that
 * could have caught it was the list of all of them.
 *
 * The unit is the required `tripId` prop: a view that cannot be rendered
 * without a trip id is a view that shows one trip.
 */
import { globSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, it, expect } from 'vitest'

/**
 * Screens whose required `tripId` names a trip they do **not** read the trip
 * partition for. Each has to say why, and a stale entry fails below: a file
 * listed here that has since adopted the composable is a carve-out nobody
 * removed.
 */
const NOT_TRIP_PARTITION: Record<string, string> = {
  'src/views/trips/TripMembersPage.vue':
    'the roster is `trip_members`, which is master data — it arrives with the master pull',
}

const views = globSync('src/views/**/*.vue', { cwd: process.cwd() })
  .map((path) => ({
    path: path.replace(/\\/g, '/'),
    source: readFileSync(resolve(process.cwd(), path), 'utf8'),
  }))
  .filter(({ source }) => /defineProps<\{\s*tripId:\s*string/.test(source))

describe('every screen that shows one trip', () => {
  it('is a screen this rule was measured against', () => {
    // A census, so the two clauses below cannot both pass by matching nothing.
    expect(views.length).toBeGreaterThanOrEqual(9)
  })

  it('loads the trip partition itself, or says why it does not', () => {
    const missing = views
      .filter(({ path }) => !(path in NOT_TRIP_PARTITION))
      .filter(({ source }) => !source.includes('useTripScreen(props.tripId'))
      .map(({ path }) => path)

    expect(missing).toEqual([])
  })

  it('carries no carve-out that has since been adopted', () => {
    const stale = views
      .filter(({ path }) => path in NOT_TRIP_PARTITION)
      .filter(({ source }) => source.includes('useTripScreen(props.tripId'))
      .map(({ path }) => path)

    expect(stale).toEqual([])
    // And a carve-out naming a file that no longer exists is equally stale.
    const paths = new Set(views.map(({ path }) => path))
    expect(Object.keys(NOT_TRIP_PARTITION).filter((path) => !paths.has(path))).toEqual([])
  })
})
