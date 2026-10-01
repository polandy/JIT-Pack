// @vitest-environment jsdom
/**
 * FR-31.15: an excursion's route card — folded while there is something to
 * pack, open once there is not, and a fold or unfold kept per excursion for
 * the phase it was made in.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { ref } from 'vue'

import { routeCardOpen, useRouteFold } from '../routeFold'

describe('routeCardOpen', () => {
  it('starts folded while packing and open once nothing is left', () => {
    expect(routeCardOpen(null, true)).toBe(false)
    expect(routeCardOpen(null, false)).toBe(true)
  })

  it('follows a choice made in the same phase, and not one made in the other', () => {
    expect(routeCardOpen({ open: true, packing: true }, true)).toBe(true)
    expect(routeCardOpen({ open: false, packing: false }, false)).toBe(false)
    // Folded while packing; the list is done now, so the route shows again.
    expect(routeCardOpen({ open: false, packing: true }, false)).toBe(true)
  })
})

describe('useRouteFold', () => {
  beforeEach(() => localStorage.clear())

  it('keeps a choice per excursion, on this device', () => {
    const packing = ref(true)
    const hut = useRouteFold(
      () => 'exc-hut',
      () => packing.value,
    )
    expect(hut.open.value).toBe(false)
    hut.toggle()
    expect(hut.open.value).toBe(true)

    expect(
      useRouteFold(
        () => 'exc-hut',
        () => true,
      ).open.value,
    ).toBe(true)
    expect(
      useRouteFold(
        () => 'exc-boat',
        () => true,
      ).open.value,
    ).toBe(false)

    packing.value = false
    hut.toggle()
    expect(hut.open.value).toBe(false)
    packing.value = true
    // The phase changed back: the choice from the finished list does not count.
    expect(hut.open.value).toBe(false)
  })

  it('reads the next excursion’s own choice when the id changes', () => {
    useRouteFold(
      () => 'exc-boat',
      () => true,
    ).toggle()
    const id = ref('exc-hut')
    const fold = useRouteFold(
      () => id.value,
      () => true,
    )
    expect(fold.open.value).toBe(false)
    id.value = 'exc-boat'
    return Promise.resolve().then(() => expect(fold.open.value).toBe(true))
  })

  it('ignores a stored value it cannot read', () => {
    localStorage.setItem('jp_route_fold_exc-x', '{"open":"yes"}')
    expect(
      useRouteFold(
        () => 'exc-x',
        () => false,
      ).open.value,
    ).toBe(true)
  })
})
