// @vitest-environment jsdom
/**
 * FR-27.16 — what the sheet owns is the selection: a name the trip kept on
 * purpose starts unticked, „Alle" takes it along, and the button hands over
 * exactly what is ticked.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { IonButton } from '@ionic/vue'

import InventoryNamesSheet from '../InventoryNamesSheet.vue'
import type { InventoryRename } from '@/domain/inventoryNames'
import type { TripItem } from '@/types/domain'

function row(id: string, extra: Partial<TripItem> = {}): TripItem {
  return {
    id,
    trip_id: 't1',
    source_item_id: 'item',
    source_template_id: null,
    name: 'x',
    weight_grams: null,
    value_cents: null,
    category_name: null,
    quantity: 1,
    packed_count: 0,
    state: 'open',
    mode: 'pack',
    late_packer: false,
    assigned_traveler_id: null,
    packer_user_id: null,
    packed_by_user_id: null,
    packed_at: null,
    container_id: null,
    packing_now_by: null,
    packing_now_at: null,
    bought_from: null,
    flag_unused: false,
    flag_missing: false,
    updated_hlc: '1',
    ...extra,
  }
}

const KAMERA: InventoryRename = {
  key: 'kamera',
  sourceItemId: 'item-kamera',
  from: 'Kamera',
  to: 'Kamera (Vollformat)',
  rows: [row('r1', { packed_count: 1, state: 'packed' })],
  deliberate: false,
}
const BUCH: InventoryRename = {
  key: 'buch',
  sourceItemId: 'item-buch',
  from: 'Buch: Der Schatten des Windes',
  to: 'Buch / E-Reader',
  rows: [row('r2')],
  deliberate: true,
}

function mountSheet() {
  return mount(InventoryNamesSheet, {
    props: { renames: [BUCH, KAMERA], travelers: [] },
  })
}

describe('InventoryNamesSheet (FR-27.16)', () => {
  it('ticks everything but a name the trip kept on purpose', () => {
    const wrapper = mountSheet()
    expect(wrapper.get('[data-testid="inventory-names-count"]').text()).toBe('1 of 2 selected')
    expect(wrapper.get('[data-testid="inventory-names-apply"]').text()).toBe('Take the name over')
  })

  it('hands over only what is ticked', async () => {
    const wrapper = mountSheet()
    await wrapper.get('[data-testid="inventory-names-apply"]').trigger('click')
    expect(wrapper.emitted('adopt')).toEqual([[[KAMERA]]])
  })

  it('„Alle" takes the deliberate one along, and the button says so', async () => {
    const wrapper = mountSheet()
    await wrapper
      .get('[data-testid="inventory-names-all"]')
      .trigger('ionChange', { detail: { checked: true } })

    expect(wrapper.get('[data-testid="inventory-names-apply"]').text()).toBe('Take all 2 over')
    await wrapper.get('[data-testid="inventory-names-apply"]').trigger('click')
    expect(wrapper.emitted('adopt')).toEqual([[[BUCH, KAMERA]]])
  })

  it('„Alle" on a full selection clears it, and there is nothing to take over', async () => {
    const wrapper = mountSheet()
    const all = wrapper.get('[data-testid="inventory-names-all"]')
    await all.trigger('ionChange', { detail: { checked: true } })
    await all.trigger('ionChange', { detail: { checked: false } })

    expect(wrapper.get('[data-testid="inventory-names-count"]').text()).toBe('0 of 2 selected')
    const apply = wrapper.findComponent<typeof IonButton>('[data-testid="inventory-names-apply"]')
    expect(apply.text()).toBe('Nothing selected')
    expect(apply.props('disabled')).toBe(true)
  })

  it('names what makes a choice recognisable — packed, and kept on purpose', () => {
    const wrapper = mountSheet()
    expect(wrapper.get('[data-testid="inventory-names-row-Kamera (Vollformat)"]').text()).toContain(
      'packed 1/1',
    )
    expect(wrapper.get('[data-testid="inventory-names-row-Buch / E-Reader"]').text()).toContain(
      'named on purpose',
    )
  })
})
