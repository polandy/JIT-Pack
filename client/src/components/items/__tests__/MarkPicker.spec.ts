/**
 * FR-28.2/28.3 — the one picker M10 and M8 both open.
 *
 * The ranking and the compound splitting are pinned in
 * domain/__tests__/itemMarks.spec.ts; what this file pins is the surface:
 * that the suggestion is an offer rather than a pre-fill, that removal is its
 * own action rather than an empty tile, and that finding nothing is said out
 * loud instead of rendered as a gap.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

import MarkPicker from '../MarkPicker.vue'
import { MARK_SUGGESTION_LIMIT } from '@/domain/itemMarks'

function open(props: Record<string, unknown> = {}) {
  return mount(MarkPicker, {
    props: { isOpen: true, name: '', current: null, ...props },
    global: { stubs: { IonModal: { template: '<div><slot /></div>' } } },
  })
}

const tiles = (w: ReturnType<typeof open>, testid: string) =>
  w.findAll(`[data-testid="${testid}"]`).map((n) => n.text())

describe('MarkPicker', () => {
  it('offers what the name suggests, and offers it — nothing is pre-selected (FR-28.3)', () => {
    const w = open({ name: 'Tarnzelt' })
    expect(tiles(w, 'mark-suggestion')).toContain('⛺')
    expect(tiles(w, 'mark-suggestion').length).toBeLessThanOrEqual(MARK_SUGGESTION_LIMIT)
    expect(w.emitted('pick')).toBeUndefined()
  })

  it('emits the mark the moment one is tapped', async () => {
    const w = open({ name: 'Tarnzelt' })
    await w.findAll('[data-testid="mark-suggestion"]')[0]!.trigger('click')
    expect(w.emitted('pick')).toEqual([['⛺']])
  })

  it('says out loud that a name yielded nothing, rather than showing a gap (FR-28.3)', () => {
    const w = open({ name: 'Zwischenringe' })
    expect(tiles(w, 'mark-suggestion')).toEqual([])
    expect(w.find('[data-testid="mark-no-suggestion"]').exists()).toBe(true)
  })

  it('searches keywords, not Unicode names — „regen" reaches the raincoat (FR-28.2)', async () => {
    const w = open()
    await w.get('[data-testid="mark-search"]').setValue('regen')
    expect(tiles(w, 'mark-tile')).toContain('🧥')
  })

  it('names an empty search result instead of rendering an empty grid (FR-28.3)', async () => {
    const w = open()
    await w.get('[data-testid="mark-search"]').setValue('xyzzy')
    expect(tiles(w, 'mark-tile')).toEqual([])
    expect(w.find('[data-testid="mark-no-result"]').exists()).toBe(true)
  })

  it('browses a facet without typing (FR-28.2)', async () => {
    const w = open()
    const before = tiles(w, 'mark-tile').length
    await w.get('[data-testid="mark-facet-camping"]').trigger('click')
    const after = tiles(w, 'mark-tile')
    expect(after.length).toBeGreaterThan(0)
    expect(after.length).toBeLessThan(before)
    expect(after).toContain('⛺')
  })

  it('words removal as removal, and offers it only when there is something to remove (FR-28.2)', async () => {
    expect(open({ current: null }).find('[data-testid="mark-remove"]').exists()).toBe(false)

    const w = open({ current: '⛺' })
    await w.get('[data-testid="mark-remove"]').trigger('click')
    expect(w.emitted('pick')).toEqual([[null]])
  })
})
