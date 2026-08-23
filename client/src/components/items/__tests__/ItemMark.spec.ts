// @vitest-environment jsdom
/**
 * FR-28.4/28.5 — the fallback ladder lives here and nowhere else.
 *
 * The three surfaces answer different questions, so they fall back
 * differently; the point of the component is that no screen re-decides that,
 * and that no screen forgets the mark is presentational.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

import ItemMark from '../ItemMark.vue'
import type { MasterItem } from '@/types/domain'

function item(over: Partial<MasterItem> = {}): MasterItem {
  return {
    id: 'i-1',
    name: 'Zahnbürste',
    icon: null,
    image_hash: null,
    weight_grams: null,
    value_cents: null,
    ...over,
  }
}

/** ItemThumbnail resolves its URL through the orchestrator; nothing else here does. */
const global = {
  provide: { orchestrator: { itemImageUrl: async () => 'blob:photo' } },
}

beforeEach(() => setActivePinia(createPinia()))

describe('ItemMark', () => {
  it('renders the mark as presentational — never as the row’s accessible name (FR-28.5)', () => {
    const w = mount(ItemMark, {
      props: { mark: '🪥', surface: 'packing' },
      global,
    })
    const slot = w.get('[data-testid="item-mark-slot"]')
    expect(slot.get('[data-testid="item-mark"]').text()).toBe('🪥')
    // Hidden from assistive technology: the row's accessible name is the
    // item's name, and the mark never carries meaning on its own.
    expect(slot.attributes('aria-hidden')).toBe('true')
  })

  it('lets the photo win wherever one exists (FR-28.4, FR-22.1)', () => {
    const w = mount(ItemMark, {
      props: {
        mark: '🪥',
        surface: 'inventory',
        photoItem: item({ image_hash: 'abc' }),
        initial: 'K',
      },
      global,
    })
    expect(w.findComponent({ name: 'ItemThumbnail' }).exists()).toBe(true)
    expect(w.find('[data-testid="item-mark"]').exists()).toBe(false)
    expect(w.find('[data-testid="item-mark-initial"]').exists()).toBe(false)
  })

  it('falls back to the primary tag’s initial on the inventory, where the column is identification (FR-28.4)', () => {
    const w = mount(ItemMark, {
      props: { mark: null, surface: 'inventory', photoItem: item(), initial: 'K' },
      global,
    })
    expect(w.get('[data-testid="item-mark-initial"]').text()).toBe('K')
  })

  it('never falls back to a letter while packing — an empty slot holds the box instead (FR-28.4)', () => {
    const w = mount(ItemMark, { props: { mark: null, surface: 'packing', size: 22 }, global })
    expect(w.find('[data-testid="item-mark-initial"]').exists()).toBe(false)
    const slot = w.get('[data-testid="item-mark-slot"]')
    expect(slot.text()).toBe('')
    // Width *and* height: a box with no height is not a held column, it is an
    // invisible element — which is how the e2e case first failed.
    expect(slot.attributes('style')).toContain('width: 22px')
    expect(slot.attributes('style')).toContain('height: 22px')
  })

  it('renders nothing at all on a plain surface without a mark — no slot, never a letter (FR-28.8)', () => {
    const w = mount(ItemMark, { props: { mark: null, surface: 'plain', initial: 'K' }, global })
    expect(w.find('[data-testid="item-mark-slot"]').exists()).toBe(false)
    expect(w.find('[data-testid="item-mark-initial"]').exists()).toBe(false)
  })

  it('takes its glyph box from the mark size it is given, not from the text around it (G-13)', () => {
    const w = mount(ItemMark, { props: { mark: '⛺', surface: 'plain', size: 28 } })
    expect(w.get('[data-testid="item-mark-slot"]').attributes('style')).toContain(
      '--jp-mark-size: 28px',
    )
  })
})
