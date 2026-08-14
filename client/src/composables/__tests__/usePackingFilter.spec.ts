/**
 * FR-25.18 — what M4 remembers, for how long, and per what.
 *
 * The two lifetimes are the whole point of the requirement, so both are
 * asserted directly: the filter is session state (a fresh session starts
 * unfiltered, because a forgotten filter hides rows) while the grouping
 * is durable (it arranges rows, so nothing can hide behind it).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import { setStoredGroupBy, usePackingFilter } from '../usePackingFilter'

beforeEach(() => {
  sessionStorage.clear()
  localStorage.clear()
})

/** Vue flushes watchers on the microtask queue; persistence lands after it. */
async function settle() {
  await nextTick()
}

describe('usePackingFilter (FR-25.18)', () => {
  it('remembers the filter across a remount within the session', async () => {
    const first = usePackingFilter('trip-1')
    first.toggleValue('person', 'tr-sia')
    first.showDone.value = true
    await settle()

    const second = usePackingFilter('trip-1')
    expect(second.facets.value.person).toEqual(['tr-sia'])
    expect(second.showDone.value).toBe(true)
  })

  it('scopes the filter per trip — a Person filter on one trip means nothing on another', async () => {
    const first = usePackingFilter('trip-1')
    first.toggleValue('person', 'tr-sia')
    await settle()

    expect(usePackingFilter('trip-2').facets.value.person).toEqual([])
  })

  it('starts a fresh session unfiltered, so no forgotten filter hides rows', async () => {
    const first = usePackingFilter('trip-1')
    first.toggleValue('category', 'Kleidung')
    first.showOthers.value = true
    await settle()

    // A new session is an empty sessionStorage with localStorage intact.
    sessionStorage.clear()

    const next = usePackingFilter('trip-1')
    expect(next.facets.value.category).toEqual([])
    expect(next.showOthers.value).toBe(false)
  })

  it('keeps the grouping durably — it arranges rows rather than hiding them', async () => {
    const first = usePackingFilter('trip-1')
    first.groupBy.value = 'person'
    await settle()

    sessionStorage.clear()

    expect(usePackingFilter('trip-1').groupBy.value).toBe('person')
  })

  it('starts unfiltered rather than refusing to render on a corrupt entry', () => {
    sessionStorage.setItem('jitpack.m4filter.trip-1', '{not json')

    expect(usePackingFilter('trip-1').facets.value).toEqual({
      person: [],
      category: [],
      mode: [],
      container: [],
      flag: [],
    })
  })

  it('ignores a stored grouping that is no longer a grouping', () => {
    localStorage.setItem('jitpack.m4group.trip-1', 'phase-of-moon')

    expect(usePackingFilter('trip-1').groupBy.value).toBe('category')
  })

  it('filters even where storage is refused — it simply forgets', async () => {
    const refuse = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })

    const filter = usePackingFilter('trip-1')
    filter.toggleValue('mode', 'buy_before')
    await settle()

    expect(filter.facets.value.mode).toEqual(['buy_before'])
    refuse.mockRestore()
  })

  it('toggles a value off again, so the sheet has one kind of edit', () => {
    const filter = usePackingFilter('trip-1')
    filter.toggleValue('mode', 'pack')
    filter.toggleValue('mode', 'pack')

    expect(filter.facets.value.mode).toEqual([])
  })

  it('reset clears every facet and both reveal switches', () => {
    const filter = usePackingFilter('trip-1')
    filter.toggleValue('mode', 'pack')
    filter.toggleValue('person', 'tr-sia')
    filter.showDone.value = true
    filter.showOthers.value = true

    filter.reset()

    expect(filter.facets.value.mode).toEqual([])
    expect(filter.facets.value.person).toEqual([])
    expect(filter.showDone.value).toBe(false)
    expect(filter.showOthers.value).toBe(false)
  })

  it('clears one facet without touching the others', () => {
    const filter = usePackingFilter('trip-1')
    filter.toggleValue('mode', 'pack')
    filter.toggleValue('person', 'tr-sia')

    filter.clearFacet('mode')

    expect(filter.facets.value.mode).toEqual([])
    expect(filter.facets.value.person).toEqual(['tr-sia'])
  })

  it('never stores the search term — a restored term would filter invisibly', async () => {
    const filter = usePackingFilter('trip-1')
    filter.toggleValue('mode', 'pack')
    await settle()

    expect(sessionStorage.getItem('jitpack.m4filter.trip-1')).not.toContain('search')
  })
})

/**
 * M12 sends the reader to M4 grouped by the dimension whose slice was
 * tapped. It used to do that through a second grouping state on the trip
 * store, which the M4 rebuild stopped reading — the tap navigated and the
 * grouping silently stayed put. One state, and the screen that leaves has
 * to write the one the screen that arrives reads.
 */
describe('setStoredGroupBy (FR-25.18)', () => {
  it('is the grouping the next mount reads', () => {
    setStoredGroupBy('trip-1', 'person')

    expect(usePackingFilter('trip-1').groupBy.value).toBe('person')
  })

  it('scopes it per trip, like every other part of the view state', () => {
    setStoredGroupBy('trip-1', 'container')

    expect(usePackingFilter('trip-2').groupBy.value).toBe('category')
  })
})
