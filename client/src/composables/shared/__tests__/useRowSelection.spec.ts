/**
 * The selection M6 and M25 share (FR-30.9, FR-7.8). Pure timer logic under
 * fake timers — the hold's 500 ms and the ghost-click window are the seams a
 * rendered suite cannot drive deterministically.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { barAll, barExit, barSelection } from '@/__tests__/headerSelection'

import { LONG_PRESS_MS } from '../useLongPress'
import { offerSelection, useRowSelection } from '../useRowSelection'

vi.mock('@/composables/shared/useHeaderSelection', async (actual) => ({
  ...(await actual()),
  setHeaderSelection: (await import('@/__tests__/headerSelection')).captureSelection,
}))

const at = (x = 0, y = 0, button = 0) => ({ clientX: x, clientY: y, button }) as PointerEvent

describe('useRowSelection', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('a hold enters the mode with the pressed row chosen', () => {
    const sel = useRowSelection()
    sel.press('a', at())
    vi.advanceTimersByTime(LONG_PRESS_MS)
    expect(sel.selecting.value).toBe(true)
    expect([...sel.selected.value]).toEqual(['a'])
  })

  it('a finger that travelled was scrolling, and selects nothing', () => {
    const sel = useRowSelection()
    sel.press('a', at())
    sel.move(at(0, 40))
    vi.advanceTimersByTime(LONG_PRESS_MS)
    expect(sel.selecting.value).toBe(false)
  })

  it('swallows the ghost click after a hold, then treats taps as toggles', () => {
    const sel = useRowSelection()
    sel.press('a', at())
    vi.advanceTimersByTime(LONG_PRESS_MS)
    // The release's own click — no pointerdown of its own: spent, the row stays chosen.
    expect(sel.click('a', true)).toBe(true)
    expect(sel.selected.value.has('a')).toBe(true)

    sel.press('b', at())
    expect(sel.click('b', true)).toBe(true)
    expect(sel.selected.value.has('b')).toBe(true)
    // An ineligible row takes the tap without joining.
    expect(sel.click('c', false)).toBe(true)
    expect(sel.selected.value.has('c')).toBe(false)
  })

  it('the next press ends the ghost-click guard, however soon it follows', () => {
    const sel = useRowSelection()
    sel.contextMenu('a')
    sel.press('a', at())
    expect(sel.click('a', true)).toBe(true)
    expect(sel.selected.value.has('a')).toBe(false)
  })

  it('a right-click selects once — its own press never fires the hold a second time', () => {
    const sel = useRowSelection()
    // Chromium's order: the right button's pointerdown, then contextmenu.
    sel.press('a', at(0, 0, 2))
    sel.contextMenu('a')
    // The next tap is a toggle, not swallowed as a ghost click …
    sel.press('b', at())
    expect(sel.click('b', true)).toBe(true)
    // … and no hold fires late to wipe it back to the right-clicked row alone.
    vi.advanceTimersByTime(LONG_PRESS_MS)
    expect([...sel.selected.value].sort()).toEqual(['a', 'b'])
  })

  it('a primary press armed before a right-click is disarmed by it', () => {
    const sel = useRowSelection()
    sel.press('a', at())
    sel.contextMenu('b')
    vi.advanceTimersByTime(LONG_PRESS_MS)
    expect([...sel.selected.value]).toEqual(['b'])
  })

  it('outside the mode a tap is the screen’s own', () => {
    expect(useRowSelection().click('a', true)).toBe(false)
  })

  it('“Alle N” takes every key, and the same act clears them', () => {
    const sel = useRowSelection()
    sel.start()
    sel.toggleAll(['a', 'b'])
    expect(sel.selected.value.size).toBe(2)
    sel.toggleAll(['a', 'b'])
    expect(sel.selected.value.size).toBe(0)
  })

  it('„Alle" judges by the rows on screen, not by how many are chosen (M9: a filter hides some)', () => {
    const sel = useRowSelection()
    sel.start()
    // Two chosen, one of them since filtered out of view: the screen's two
    // rows are not all chosen, so „Alle" takes them rather than clearing.
    sel.toggleAll(['a', 'hidden'])
    sel.toggleAll(['a', 'b'])
    expect([...sel.selected.value].sort()).toEqual(['a', 'b'])
  })

  it('leaving the mode forgets the choice', () => {
    const sel = useRowSelection()
    sel.contextMenu('a')
    sel.end()
    expect(sel.selecting.value).toBe(false)
    expect(sel.selected.value.size).toBe(0)
  })
})

describe('offerSelection', () => {
  function offered(keys: string[]) {
    const shown = ref(keys)
    const sel = useRowSelection()
    const selectIcon = offerSelection(sel, { testid: 'mX', keys: () => shown.value })
    return { shown, sel, selectIcon }
  }

  it('offers the icon while there is something to select, and gives the bar back outside the mode', () => {
    const { shown, sel, selectIcon } = offered(['a'])
    expect(selectIcon('mX-select', 'Auswählen').map((action) => action.id)).toEqual(['mX-select'])
    expect(barSelection()).toBeNull()
    shown.value = []
    expect(selectIcon('mX-select', 'Auswählen')).toEqual([])
    // An open selection keeps its way out even with nothing left to choose.
    sel.start()
    expect(selectIcon('mX-select', 'Auswählen')).toHaveLength(1)
  })

  it('the icon enters and leaves the mode', () => {
    const { sel, selectIcon } = offered(['a'])
    selectIcon('mX-select', 'Auswählen')[0]!.onClick()
    expect(sel.selecting.value).toBe(true)
    sel.toggle('a')
    selectIcon('mX-select', 'Auswählen')[0]!.onClick()
    expect(sel.selecting.value).toBe(false)
    expect(sel.selected.value.size).toBe(0)
  })

  it('counts only the chosen keys still among the offered ones', () => {
    const { shown, sel } = offered(['a', 'b', 'c'])
    sel.start()
    sel.toggle('a')
    sel.toggle('b')
    expect(barSelection()).toMatchObject({ count: 2, total: 3, testid: 'mX' })
    // A row taken out from under the selection — bought, restored, filtered away.
    shown.value = ['a', 'c']
    expect(barSelection()).toMatchObject({ count: 1, total: 2 })
  })

  it('„Alle" takes the offered keys and ✕ ends the mode', async () => {
    const { sel } = offered(['a', 'b'])
    sel.start()
    await barAll()
    expect(barSelection()).toMatchObject({ count: 2, total: 2 })
    await barExit()
    expect(sel.selecting.value).toBe(false)
    expect(barSelection()).toBeNull()
  })
})
