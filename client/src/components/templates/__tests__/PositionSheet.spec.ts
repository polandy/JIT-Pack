// @vitest-environment jsdom
/**
 * M8 — the position sheet's glance-chip row (§3.25).
 *
 * U-7b: the buy chip is the same rule in five templates, and only
 * GroupPeekSheet's rendering of it had a case. This one is PositionSheet's.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

import PositionSheet from '../PositionSheet.vue'
import { useMasterStore } from '@/stores/masterStore'
import { ITEM_MODE_BUY_BEFORE, ITEM_MODE_PACK, type ItemMode } from '@/types/domain'

const orchestratorFake = {
  syncStatus: { state: { value: 'synced' } },
  capturePending: { value: false },
}

function seed(defaultMode: ItemMode) {
  const master = useMasterStore()
  master.applyChange({
    seq: 0,
    table: 'templates',
    id: 'tpl',
    deleted: false,
    row: { owner_id: 'me', name: 'Ferien', kind: 'template' },
  })
  master.applyChange({
    seq: 0,
    table: 'items',
    id: 'i1',
    deleted: false,
    row: { name: 'Sonnencreme' },
  })
  master.applyChange({
    seq: 0,
    table: 'template_items',
    id: 'p1',
    deleted: false,
    row: {
      template_id: 'tpl',
      item_id: 'i1',
      quantity: 1,
      assignment: 'trip_global',
      dedup: 'max',
      default_mode: defaultMode,
      late_packer: 0,
    },
  })
}

function mountSheet() {
  return mount(PositionSheet, {
    props: { templateId: 'tpl', positionId: 'p1' },
    global: { provide: { orchestrator: orchestratorFake } },
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('M8 position sheet — the mode chip', () => {
  it('names the mode of a position that is bought, not packed', () => {
    seed(ITEM_MODE_BUY_BEFORE)
    expect(mountSheet().find('.chip.buy').exists()).toBe(true)
  })

  it('leaves a packed position without one — 🧳 is the unsaid default (FR-25.4a)', () => {
    seed(ITEM_MODE_PACK)
    const wrapper = mountSheet()
    // The sheet still renders its chip row, so the absence above is the
    // rule and not an unmounted component.
    expect(wrapper.text()).toContain('Sonnencreme')
    expect(wrapper.find('.chip.buy').exists()).toBe(false)
  })
})
