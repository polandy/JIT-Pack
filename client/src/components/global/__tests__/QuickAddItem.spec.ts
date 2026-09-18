// @vitest-environment jsdom
/**
 * FR-25.28 — the quick-add's for-whom strip.
 *
 * The composer is shared with M8 (§3.25 consistency directive), and a
 * template has no travelers to distribute over, so the strip is opt-in per
 * caller. What is pinned here is the four things it is: absent unless there is
 * a membership to make (G-8), carried on the `add` event rather than acted on
 * here — the composer knows nothing about rows —, reset when the run ends,
 * because *gemeinsam* is the default, and silent about what the browse-sheet
 * adds, which answers *for whom* per line.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

import QuickAddItem from '../QuickAddItem.vue'
import InventoryBrowseSheet from '../InventoryBrowseSheet.vue'
import { useMasterStore } from '@/stores/masterStore'
import type { MasterItem, Traveler } from '@/types/domain'

const NAME = 'Sonnenhut'

/** Enough of a master item for the composer, which only forwards it. */
const NINA: Traveler = { id: 'trav-nina', trip_id: 't1', name: 'Nina', linked_user_id: null }
const MILA: Traveler = { id: 'trav-mila', trip_id: 't1', name: 'Mila', linked_user_id: null }
const LEO: Traveler = { id: 'trav-leo', trip_id: 't1', name: 'Leo', linked_user_id: null }
/** Roster order — what the emitted set has to follow, whatever order it was tapped in. */
const ROSTER = { travelerCount: 3, travelers: [NINA, MILA, LEO] }

function travelerIdsOf(emitted: unknown[] | undefined): string[] {
  const item = emitted?.[0] as { travelerIds: string[] } | undefined
  if (!item) throw new Error('nothing was added')
  return item.travelerIds
}

const ITEM = { id: 'i1', name: NAME, weight_grams: null, value_cents: null } as MasterItem

function open(props: Record<string, unknown> = {}, global?: Record<string, unknown>) {
  const wrapper = mount(QuickAddItem, { props, ...(global ? { global } : {}) })
  return wrapper
}

async function expand(wrapper: ReturnType<typeof open>) {
  await wrapper.find('[data-testid="quick-add-open"]').trigger('click')
}

async function type(wrapper: ReturnType<typeof open>, name: string) {
  await wrapper.findComponent({ name: 'IonInput' }).vm.$emit('update:modelValue', name)
}

async function confirm(wrapper: ReturnType<typeof open>) {
  await wrapper.find('[data-testid="quick-add-confirm"]').trigger('click')
}

describe('QuickAddItem — FR-25.28 for-whom strip', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('offers no strip where there is nobody to distribute over (G-8)', async () => {
    const wrapper = open({ travelerCount: 1, travelers: [NINA] })
    await expand(wrapper)

    expect(wrapper.find('[data-testid="quick-add-for-whom"]').exists()).toBe(false)
    await type(wrapper, NAME)
    await confirm(wrapper)
    expect(travelerIdsOf(wrapper.emitted('add')?.[0])).toEqual([])
  })

  it('adds gemeinsam by default, and for the lit travelers in roster order after', async () => {
    const wrapper = open(ROSTER)
    await expand(wrapper)

    await type(wrapper, NAME)
    await confirm(wrapper)

    // Tapped against roster order on purpose.
    await wrapper.find('[data-testid="for-whom-quick-add-Leo"]').trigger('click')
    await wrapper.find('[data-testid="for-whom-quick-add-Nina"]').trigger('click')
    await type(wrapper, NAME)
    await confirm(wrapper)

    const added = wrapper.emitted('add') ?? []
    expect(added).toHaveLength(2)
    expect(travelerIdsOf(added[0])).toEqual([])
    expect(travelerIdsOf(added[1])).toEqual([NINA.id, LEO.id])
  })

  it('keeps the choice across an add, because per-person rows come in runs', async () => {
    const wrapper = open(ROSTER)
    await expand(wrapper)
    await wrapper.find('[data-testid="for-whom-quick-add-Mila"]').trigger('click')

    await type(wrapper, NAME)
    await confirm(wrapper)
    await type(wrapper, 'Badehose')
    await confirm(wrapper)

    const added = wrapper.emitted('add') ?? []
    expect(travelerIdsOf(added[1])).toEqual([MILA.id])
  })

  it('takes a traveler back off on a second tap, and everybody off with Gemeinsam', async () => {
    const wrapper = open(ROSTER)
    await expand(wrapper)

    await wrapper.find('[data-testid="for-whom-all-quick-add"]').trigger('click')
    await wrapper.find('[data-testid="for-whom-quick-add-Mila"]').trigger('click')
    await type(wrapper, NAME)
    await confirm(wrapper)

    await wrapper.find('[data-testid="for-whom-shared-quick-add"]').trigger('click')
    await type(wrapper, NAME)
    await confirm(wrapper)

    const added = wrapper.emitted('add') ?? []
    expect(travelerIdsOf(added[0])).toEqual([NINA.id, LEO.id])
    expect(travelerIdsOf(added[1])).toEqual([])
  })

  it('forgets the choice when the composer closes, so a run does not outlive itself', async () => {
    const wrapper = open(ROSTER)
    await expand(wrapper)
    await wrapper.find('[data-testid="for-whom-quick-add-Nina"]').trigger('click')

    await wrapper.find('[data-testid="quick-add-close"]').trigger('click')
    await expand(wrapper)
    await type(wrapper, NAME)
    await confirm(wrapper)

    expect(travelerIdsOf(wrapper.emitted('add')?.[0])).toEqual([])
  })

  /**
   * One door per surface: the sheet's lines answer *for whom* with their own
   * 👥 and avatars (FR-25.13g/h). A decided add therefore leaves at once — no
   * deferral, since no editor follows any more — and carries no travelers even
   * while the strip under the sheet has some lit.
   */
  it('sends a decided browse add straight out, deaf to the strip, decision intact', async () => {
    useMasterStore().applyChange({
      seq: 0,
      table: 'items',
      id: ITEM.id,
      deleted: false,
      row: { name: ITEM.name },
    })
    // The sheet is an Ionic modal, which renders no slot content under jsdom;
    // stubbing it keeps the browse-sheet reachable.
    const wrapper = open(ROSTER, {
      stubs: { SheetModal: { name: 'SheetModal', template: '<div><slot /></div>' } },
    })
    await expand(wrapper)
    await wrapper.find('[data-testid="for-whom-quick-add-Nina"]').trigger('click')
    await wrapper.find('[data-testid="quick-add-browse-open"]').trigger('click')

    await wrapper.findComponent(InventoryBrowseSheet).vm.$emit('add-packed', ITEM)

    const added = wrapper.emitted('add') ?? []
    expect(added).toHaveLength(1)
    expect(travelerIdsOf(added[0])).toEqual([])
    expect(added[0]![1]).toBe('packed')
  })

  /**
   * FR-25.13g: the third verb is its own emit, because the sheet's lines carry
   * their own undo — and it stays inside the sheet, which is what keeps a run
   * of „für alle" taps going.
   */
  it('passes „für alle" straight out with the item’s fields, sheet still open', async () => {
    useMasterStore().applyChange({
      seq: 0,
      table: 'items',
      id: ITEM.id,
      deleted: false,
      row: { name: ITEM.name },
    })
    const wrapper = open(ROSTER, {
      stubs: { SheetModal: { name: 'SheetModal', template: '<div><slot /></div>' } },
    })
    await expand(wrapper)
    await wrapper.find('[data-testid="quick-add-browse-open"]').trigger('click')

    await wrapper
      .findComponent(InventoryBrowseSheet)
      .vm.$emit('add-for-all', { ...ITEM, weight_grams: 180 })

    expect(wrapper.emitted('addForAll')?.[0]?.[0]).toMatchObject({
      name: ITEM.name,
      sourceItemId: ITEM.id,
      weightGrams: 180,
    })
    // Not the plain add.
    expect(wrapper.emitted('add')).toBeUndefined()
  })

  /**
   * FR-25.13h: the same shape as „für alle" one test up, for the same
   * reason — the sheet's per-traveler pick (avatar buttons or long-press
   * menu) answers *who* in the line, so it is relayed the way
   * `onBrowseAddForAll` is. The
   * sheet always sends the whole set (multi-select), so this relay passes an
   * array straight through rather than a single id.
   */
  it('passes a traveler-set assignment straight out with the item’s fields and the ids', async () => {
    useMasterStore().applyChange({
      seq: 0,
      table: 'items',
      id: ITEM.id,
      deleted: false,
      row: { name: ITEM.name },
    })
    const wrapper = open(ROSTER, {
      stubs: { SheetModal: { name: 'SheetModal', template: '<div><slot /></div>' } },
    })
    await expand(wrapper)
    await wrapper.find('[data-testid="quick-add-browse-open"]').trigger('click')

    await wrapper
      .findComponent(InventoryBrowseSheet)
      .vm.$emit('assign-to-travelers', { ...ITEM, weight_grams: 180 }, ['trav-nina', 'trav-mila'])

    const emitted = wrapper.emitted('assignForTravelers')?.[0]
    expect(emitted?.[0]).toMatchObject({
      name: ITEM.name,
      sourceItemId: ITEM.id,
      weightGrams: 180,
    })
    expect(emitted?.[1]).toEqual(['trav-nina', 'trav-mila'])
    // Not the plain add and not „für alle".
    expect(wrapper.emitted('add')).toBeUndefined()
    expect(wrapper.emitted('addForAll')).toBeUndefined()
  })
})

describe('QuickAddItem — one door per screen (FR-21.24)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('shows its own trigger where the screen has no other way in', () => {
    expect(open().find('[data-testid="quick-add-open"]').exists()).toBe(true)
  })

  it('renders no trigger for a caller that owns one already (M4’s FAB)', () => {
    const wrapper = open({ showTrigger: false })

    expect(wrapper.find('[data-testid="quick-add-open"]').exists()).toBe(false)
    // And renders nothing else either: the form and the trigger were an
    // if/else pair, so withholding the trigger left the form standing open
    // above the list, which is what the closed state exists to prevent.
    expect(wrapper.find('[data-testid="quick-add-input"]').exists()).toBe(false)
  })

  it('still opens when the caller asks, which is the only way left', async () => {
    const wrapper = open({ showTrigger: false })

    await (wrapper.vm as unknown as { open: () => Promise<void> }).open()
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="quick-add-input"]').exists()).toBe(true)
  })
})
