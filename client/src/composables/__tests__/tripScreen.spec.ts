// @vitest-environment jsdom
/**
 * `useTripScreen` — what a screen showing one trip does before it renders
 * (U-10).
 *
 * The rule it carries is one line long and was written in exactly one screen:
 * M4 subscribed and drained on mount, and every sibling trip screen relied on
 * having been reached through it. E2E-G9-18 is the case that proves the
 * consequence on a running app; this unit pins the three promises the
 * composable makes to the screens.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

import { useTripScreen } from '../useTripScreen'
import { tripScreenStub } from './tripScreenStub'
import { useTripStore } from '@/stores/tripStore'
import { TABLE } from '@/types/tables'

const TRIP_ID = 'trip-1'

/**
 * Mount the composable in a real component, because half of what it promises
 * is tied to `onMounted`. The `ensure` it hands back is the screen's own
 * handle on the load — M4's ordering runs off it.
 */
function mountScreen(source: ReturnType<typeof tripScreenStub>) {
  let api!: ReturnType<typeof useTripScreen>
  const wrapper = mount(
    defineComponent({
      setup() {
        api = useTripScreen(TRIP_ID, source)
        return () => h('div')
      },
    }),
  )
  return { wrapper, api: () => api }
}

beforeEach(() => setActivePinia(createPinia()))

describe('useTripScreen', () => {
  it('subscribes to the trip and pulls its partition on mount', async () => {
    const source = tripScreenStub()

    mountScreen(source)
    await nextTick()

    expect(source.subscribeTrip).toHaveBeenCalledWith(TRIP_ID)
    expect(source.drainTrip).toHaveBeenCalledWith(TRIP_ID)
  })

  /*
   * The clause the latch exists for: M4 awaits `ensure()` in an `onMounted`
   * of its own, so without the shared in-flight promise the partition would
   * be pulled twice on every open of the busiest screen in the app. Reading
   * the call count is what makes that falsifiable — both a latch and a second
   * pull leave M4 rendering the same rows.
   */
  it('joins the load it started on mount rather than beginning a second one', async () => {
    const source = tripScreenStub()

    const { api } = mountScreen(source)
    await api().ensure()
    await api().ensure()

    expect(source.drainTrip).toHaveBeenCalledTimes(1)
    expect(source.subscribeTrip).toHaveBeenCalledTimes(1)
  })

  /*
   * ADR-033: the screens with an empty state read this, and the answer must
   * be the device's, not the store's. An empty trip and an unpulled one hold
   * the same zero rows, so the two states are only distinguishable here.
   */
  it('reports the partition as absent until the device holds it', async () => {
    const source = tripScreenStub()

    const { api } = mountScreen(source)
    expect(api().loaded.value).toBe(false)

    source.loadedTrips.add(TRIP_ID)
    await nextTick()
    expect(api().loaded.value).toBe(true)
  })

  it('reads the trip itself from the store, where the master pull puts it', async () => {
    const source = tripScreenStub()
    const { api } = mountScreen(source)
    expect(api().trip.value).toBeUndefined()

    useTripStore().applyChange({
      seq: 1,
      table: TABLE.trips,
      id: TRIP_ID,
      deleted: false,
      row: { name: 'Bergell' },
    })
    await nextTick()

    expect(api().trip.value?.name).toBe('Bergell')
  })
})
