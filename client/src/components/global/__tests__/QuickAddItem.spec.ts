// @vitest-environment jsdom
/**
 * FR-25.8 — the quick-add's *Pro Person* mode.
 *
 * The composer is shared with M8 (§3.25 consistency directive), and a
 * template has no travelers to distribute over, so the mode is opt-in per
 * caller. What is pinned here is the three things the mode is: absent unless
 * offered (G-8), carried on the `add` event rather than acted on here — the
 * composer knows nothing about rows — and reset when the run ends, because
 * *Gesamt* is the default the FR keeps for the common case.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

import QuickAddItem from '../QuickAddItem.vue'
import InventoryBrowseSheet from '../InventoryBrowseSheet.vue'
import { useMasterStore } from '@/stores/masterStore'
import type { MasterItem } from '@/types/domain'

const NAME = 'Sonnenhut'

/** Enough of a master item for the composer, which only forwards it. */
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

describe('QuickAddItem — FR-25.8 per-person mode', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('offers no mode switch where there is nobody to distribute over (G-8)', async () => {
    const wrapper = open()
    await expand(wrapper)

    expect(wrapper.find('[data-testid="quick-add-mode-per-person"]').exists()).toBe(false)
  })

  it('adds gemeinsam by default, and per person only after the mode is chosen', async () => {
    const wrapper = open({ travelerCount: 2 })
    await expand(wrapper)

    await type(wrapper, NAME)
    await confirm(wrapper)

    await wrapper.find('[data-testid="quick-add-mode-per-person"]').trigger('click')
    await type(wrapper, NAME)
    await confirm(wrapper)

    const added = wrapper.emitted('add') ?? []
    expect(added).toHaveLength(2)
    expect((added[0]![0] as { perPerson: boolean }).perPerson).toBe(false)
    expect((added[1]![0] as { perPerson: boolean }).perPerson).toBe(true)
  })

  it('forgets the mode when the composer closes, so a run does not outlive itself', async () => {
    const wrapper = open({ travelerCount: 2 })
    await expand(wrapper)
    await wrapper.find('[data-testid="quick-add-mode-per-person"]').trigger('click')

    await wrapper.find('[data-testid="quick-add-close"]').trigger('click')
    await expand(wrapper)
    await type(wrapper, NAME)
    await confirm(wrapper)

    const added = wrapper.emitted('add') ?? []
    expect((added[0]![0] as { perPerson: boolean }).perPerson).toBe(false)
  })

  /**
   * FR-25.13f's two verbs go through the same deferral as a plain per-person
   * add: whichever verb was tapped, the editor that follows is the caller's
   * modal, and one presented while the sheet is still up renders behind it.
   */
  it('holds a decided browse add back until the sheet is gone, decision intact', async () => {
    useMasterStore().applyChange({
      seq: 0,
      table: 'items',
      id: ITEM.id,
      deleted: false,
      row: { name: ITEM.name },
    })
    // The sheet is an Ionic modal, which renders no slot content under jsdom;
    // stubbing it keeps the browse-sheet — and its dismiss — reachable.
    const wrapper = open(
      { travelerCount: 2 },
      { stubs: { SheetModal: { name: 'SheetModal', template: '<div><slot /></div>' } } },
    )
    await expand(wrapper)
    await wrapper.find('[data-testid="quick-add-mode-per-person"]').trigger('click')
    await wrapper.find('[data-testid="quick-add-browse-open"]').trigger('click')

    await wrapper.findComponent(InventoryBrowseSheet).vm.$emit('add-packed', ITEM)
    expect(wrapper.emitted('add')).toBeUndefined()

    await wrapper.findComponent({ name: 'SheetModal' }).vm.$emit('dismiss')

    const added = wrapper.emitted('add') ?? []
    expect(added).toHaveLength(1)
    expect((added[0]![0] as { perPerson: boolean }).perPerson).toBe(true)
    expect(added[0]![1]).toBe('packed')
  })

  /**
   * FR-25.13g: the third verb takes the other route on purpose. It carries no
   * mode and waits for no dismissal, because nothing opens after it — that is
   * what keeps a run of „für alle" taps inside the sheet.
   */
  it('passes „für alle" straight out with the item’s fields, sheet still open', async () => {
    useMasterStore().applyChange({
      seq: 0,
      table: 'items',
      id: ITEM.id,
      deleted: false,
      row: { name: ITEM.name },
    })
    const wrapper = open(
      { travelerCount: 2 },
      { stubs: { SheetModal: { name: 'SheetModal', template: '<div><slot /></div>' } } },
    )
    await expand(wrapper)
    await wrapper.find('[data-testid="quick-add-mode-per-person"]').trigger('click')
    await wrapper.find('[data-testid="quick-add-browse-open"]').trigger('click')

    await wrapper
      .findComponent(InventoryBrowseSheet)
      .vm.$emit('add-for-all', { ...ITEM, weight_grams: 180 })

    expect(wrapper.emitted('addForAll')?.[0]?.[0]).toMatchObject({
      name: ITEM.name,
      sourceItemId: ITEM.id,
      weightGrams: 180,
    })
    // Not the plain add, and not held back by the FR-25.8 mode either.
    expect(wrapper.emitted('add')).toBeUndefined()
  })

  /**
   * FR-25.13h: the same shape as „für alle" one test up, for the same
   * reason — the sheet's per-traveler pick (avatar button or long-press
   * menu) answers *who* without an editor, so it takes the un-deferred route
   * `onBrowseAddForAll` already does rather than the FR-25.8 mode's.
   */
  it('passes a single-traveler assignment straight out with the item’s fields and the traveler id', async () => {
    useMasterStore().applyChange({
      seq: 0,
      table: 'items',
      id: ITEM.id,
      deleted: false,
      row: { name: ITEM.name },
    })
    const wrapper = open(
      { travelerCount: 2 },
      { stubs: { SheetModal: { name: 'SheetModal', template: '<div><slot /></div>' } } },
    )
    await expand(wrapper)
    await wrapper.find('[data-testid="quick-add-mode-per-person"]').trigger('click')
    await wrapper.find('[data-testid="quick-add-browse-open"]').trigger('click')

    await wrapper
      .findComponent(InventoryBrowseSheet)
      .vm.$emit('assign-to-traveler', { ...ITEM, weight_grams: 180 }, 'trav-nina')

    const emitted = wrapper.emitted('assignForTraveler')?.[0]
    expect(emitted?.[0]).toMatchObject({
      name: ITEM.name,
      sourceItemId: ITEM.id,
      weightGrams: 180,
    })
    expect(emitted?.[1]).toBe('trav-nina')
    // Not the plain add, not „für alle", and not held back by the mode.
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
