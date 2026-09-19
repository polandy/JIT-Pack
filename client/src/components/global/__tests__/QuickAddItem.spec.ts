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
 *
 * Since FR-24.11 reached the composer, everything it adds is an inventory item:
 * the names typed below exist in the seeded inventory, and what happens to a
 * name that does not is its own block at the end.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

import QuickAddItem from '../QuickAddItem.vue'
import InventoryBrowseSheet from '../InventoryBrowseSheet.vue'
import CreateItemSheet from '@/components/items/CreateItemSheet.vue'
import { ORCHESTRATOR } from '@/composables/useOrchestrator'
import { useMasterStore } from '@/stores/masterStore'
import { TABLE } from '@/types/tables'
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

/** What the composer asked the orchestrator to write — it writes only through the sheet. */
interface Writes {
  created: string[]
  restored: string[]
}
let writes: Writes
/** ADR-033: whether the master partition has arrived; a spec flips it off. */
let masterLoaded: boolean

function putItem(id: string, name: string, retired_at: string | null = null) {
  useMasterStore().applyChange({
    seq: 0,
    table: TABLE.items,
    id,
    deleted: false,
    row: { name, retired_at },
  })
}

const orchestratorFake = {
  masterDataLoaded: () => masterLoaded,
  createMasterItem: (name: string) => {
    writes.created.push(name)
    putItem(`new-${name}`, name)
    return `new-${name}`
  },
  assignTag: () => 'assignment',
  createTag: () => 'tag',
  restoreMasterItem: (id: string) => {
    writes.restored.push(id)
    const item = useMasterStore().getItem(id)
    if (item) putItem(id, item.name)
    return true
  },
}

/** The inventory every spec starts from: the names the for-whom specs type. */
function seedInventory() {
  writes = { created: [], restored: [] }
  masterLoaded = true
  putItem(ITEM.id, NAME)
  putItem('i2', 'Badehose')
}

/** The sheet is an Ionic modal, which renders no slot content under jsdom. */
const SHEET_STUB = { SheetModal: { name: 'SheetModal', template: '<div><slot /></div>' } }

function open(props: Record<string, unknown> = {}, global: Record<string, unknown> = {}) {
  return mount(QuickAddItem, {
    props,
    global: { provide: { [ORCHESTRATOR]: orchestratorFake }, ...global },
  })
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
    seedInventory()
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
    const wrapper = open(ROSTER, { stubs: SHEET_STUB })
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
    const wrapper = open(ROSTER, { stubs: SHEET_STUB })
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
    const wrapper = open(ROSTER, { stubs: SHEET_STUB })
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
    seedInventory()
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

describe('QuickAddItem — the search creates what it did not find (FR-24.11)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    seedInventory()
  })

  function offerTitle(wrapper: ReturnType<typeof open>) {
    return wrapper.find('[data-testid="quick-add-offer-title"]')
  }

  it('adds an exactly named item as that inventory item, by the search’s fold', async () => {
    putItem('i3', 'Gürtel')
    const wrapper = open()
    await expand(wrapper)

    // Neither keyboard spelling of the umlaut is a new item.
    await type(wrapper, 'guertel')
    expect(offerTitle(wrapper).exists()).toBe(false)
    await confirm(wrapper)

    expect(wrapper.emitted('add')?.[0]?.[0]).toMatchObject({ name: 'Gürtel', sourceItemId: 'i3' })
    expect(writes.created).toEqual([])
  })

  it('offers a missing name above partial hits, and confirming opens the sheet without writing', async () => {
    putItem('i4', 'Zeltheringe')
    const wrapper = open({}, { stubs: SHEET_STUB })
    await expand(wrapper)

    await type(wrapper, 'Zelt')
    expect(offerTitle(wrapper).text()).toContain('Zelt')
    expect(wrapper.findAll('[data-testid="quick-add-suggestion"]')).toHaveLength(1)

    await confirm(wrapper)

    expect(wrapper.findComponent(CreateItemSheet).props('isOpen')).toBe(true)
    expect(wrapper.findComponent(CreateItemSheet).props('name')).toBe('Zelt')
    expect(wrapper.emitted('add')).toBeUndefined()
    expect(writes.created).toEqual([])
  })

  it('adds what the sheet created, for whoever the strip names, and stays open', async () => {
    const wrapper = open(ROSTER, { stubs: SHEET_STUB })
    await expand(wrapper)
    await wrapper.find('[data-testid="for-whom-quick-add-Mila"]').trigger('click')
    await type(wrapper, 'Zelt')
    await wrapper.find('[data-testid="quick-add-offer"]').trigger('click')

    await wrapper.find('[data-testid="create-item-confirm"]').trigger('click')
    await flushPromises()

    expect(writes.created).toEqual(['Zelt'])
    const added = wrapper.emitted('add') ?? []
    expect(added).toHaveLength(1)
    expect(added[0]?.[0]).toMatchObject({ name: 'Zelt', sourceItemId: 'new-Zelt' })
    expect(travelerIdsOf(added[0])).toEqual([MILA.id])
    expect(wrapper.findComponent(CreateItemSheet).props('isOpen')).toBe(false)
    expect(wrapper.find('[data-testid="quick-add-input"]').exists()).toBe(true)
  })

  it('restores a retired name and adds it, instead of creating a second one', async () => {
    putItem('i5', 'Stirnlampe', '2026-09-01T00:00:00Z')
    const wrapper = open()
    await expand(wrapper)

    await type(wrapper, 'Stirnlampe')
    expect(offerTitle(wrapper).text()).toContain('Stirnlampe')
    await confirm(wrapper)

    expect(writes.restored).toEqual(['i5'])
    expect(writes.created).toEqual([])
    expect(wrapper.emitted('add')?.[0]?.[0]).toMatchObject({ sourceItemId: 'i5' })
  })

  it('says a name already in the scope is in, and gives the confirm nothing to do', async () => {
    const wrapper = open({ excludeItemIds: [ITEM.id] })
    await expand(wrapper)

    await type(wrapper, NAME)

    expect(wrapper.find('[data-testid="quick-add-already-in"]').text()).toContain(NAME)
    expect(offerTitle(wrapper).exists()).toBe(false)
    const button = wrapper.find('[data-testid="quick-add-confirm"]').element as HTMLButtonElement
    expect(button.disabled).toBe(true)
  })

  it('offers nothing before the inventory has arrived (ADR-033)', async () => {
    masterLoaded = false
    const wrapper = open()
    await expand(wrapper)

    await type(wrapper, 'Zelt')
    await confirm(wrapper)

    expect(offerTitle(wrapper).exists()).toBe(false)
    expect(wrapper.emitted('add')).toBeUndefined()
  })

  it('finds an item by its tag, as M9 does, and says why it is listed (FR-24.7)', async () => {
    const masterStore = useMasterStore()
    masterStore.applyChange({
      seq: 0,
      table: TABLE.tags,
      id: 't-camp',
      deleted: false,
      row: { name: 'Camping', sort_order: 0 },
    })
    masterStore.applyChange({
      seq: 0,
      table: TABLE.itemTags,
      id: 'it-1',
      deleted: false,
      row: { item_id: 'i2', tag_id: 't-camp', position: 0 },
    })
    const wrapper = open()
    await expand(wrapper)

    await type(wrapper, 'camp')

    const rows = wrapper.findAll('[data-testid="quick-add-suggestion"]')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.text()).toContain('Badehose')
    expect(rows[0]!.text()).toContain('Camping')
  })
})
