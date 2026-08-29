// @vitest-environment jsdom
/**
 * FR-25.13d — the inventory browse-sheet: assembling a scope out of the
 * whole inventory, one tap per position.
 *
 * The rules pinned here are the ones the PRD states: the tag axis filters
 * on *any* of an item's tags (the M9 rule, FR-24.2), a carried item is a
 * *state* ("already in") rather than an offer or an error, a row tap adds
 * without closing anything, and free text is an explicit footer line, not
 * a field.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

import InventoryBrowseSheet from '../InventoryBrowseSheet.vue'
import { browseHideCarried } from '@/composables/useBrowseHideCarried'
import { useMasterStore } from '@/stores/masterStore'
import type { BrowseRowSummary } from '@/domain/browseRows'

function tag(id: string, name: string, sortOrder: number) {
  useMasterStore().applyChange({
    seq: 0,
    table: 'tags',
    id,
    deleted: false,
    row: { name, sort_order: sortOrder },
  })
}

function item(id: string, name: string) {
  useMasterStore().applyChange({ seq: 0, table: 'items', id, deleted: false, row: { name } })
}

function assign(id: string, itemId: string, tagId: string, position: number) {
  useMasterStore().applyChange({
    seq: 0,
    table: 'item_tags',
    id,
    deleted: false,
    row: { item_id: itemId, tag_id: tagId, position },
  })
}

/**
 * Kleidung: Badehose (also tagged Sommer), Pullover. Technik: Ladekabel.
 * Sonnenhut carries no tag at all.
 */
function seed() {
  tag('t-kleidung', 'Kleidung', 0)
  tag('t-technik', 'Technik', 1)
  tag('t-sommer', 'Sommer', 2)
  item('i-badehose', 'Badehose')
  item('i-pullover', 'Pullover')
  item('i-ladekabel', 'Ladekabel')
  item('i-sonnenhut', 'Sonnenhut')
  assign('a1', 'i-badehose', 't-kleidung', 0)
  assign('a2', 'i-badehose', 't-sommer', 1)
  assign('a3', 'i-pullover', 't-kleidung', 0)
  assign('a4', 'i-ladekabel', 't-technik', 0)
}

function mountSheet(carriedItemIds: string[] = []) {
  return mount(InventoryBrowseSheet, { props: { carriedItemIds } })
}

function rowNames(wrapper: ReturnType<typeof mountSheet>): string[] {
  return wrapper.findAll('[data-testid="browse-row"]').map((row) => {
    return row.find('[data-testid="browse-row-name"]').text()
  })
}

describe('InventoryBrowseSheet (FR-25.13d)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    seed()
  })

  it('shows the whole inventory grouped by primary tag, untagged last', () => {
    const wrapper = mountSheet()

    const heads = wrapper.findAll('[data-testid="browse-group-head"]').map((h) => h.text())
    expect(heads[0]).toContain('Kleidung')
    expect(heads[1]).toContain('Technik')
    expect(heads).toHaveLength(3) // the untagged bucket closes the list

    expect(rowNames(wrapper)).toEqual(['Badehose', 'Pullover', 'Ladekabel', 'Sonnenhut'])
  })

  it('filters on any of an item’s tags, not only the primary one (FR-24.2)', async () => {
    const wrapper = mountSheet()

    // Sommer is nobody's primary tag, but the Kleidung-filed Badehose
    // carries it — the reach the single category could not give.
    await wrapper.find('[data-testid="browse-tag-Sommer"]').trigger('click')
    expect(rowNames(wrapper)).toEqual(['Badehose'])

    // Back to the whole inventory via the "all" chip.
    await wrapper.find('[data-testid="browse-tag-all"]').trigger('click')
    expect(rowNames(wrapper)).toHaveLength(4)
  })

  it('renders a carried item as a state, not as an offer', () => {
    const wrapper = mountSheet(['i-pullover'])

    // Still listed — hiding it would imply it does not exist — but as
    // "already in" text where the others carry an add control.
    const carried = wrapper.find('[data-testid="browse-row-carried"]')
    expect(carried.text()).toContain('Pullover')
    expect(carried.find('[data-testid="browse-carried-state"]').exists()).toBe(true)
    // The positive signal that carried rows add nothing: only the three
    // free items are tappable rows.
    expect(rowNames(wrapper)).toEqual(['Badehose', 'Ladekabel', 'Sonnenhut'])
  })

  it('emits an add for a row tap and stays open for the run', async () => {
    const wrapper = mountSheet()

    const badehose = wrapper
      .findAll('[data-testid="browse-row"]')
      .find((row) => row.text().includes('Badehose'))!
    await badehose.trigger('click')

    const adds = wrapper.emitted('add')
    expect(adds).toHaveLength(1)
    expect(adds![0]![0]).toMatchObject({ id: 'i-badehose', name: 'Badehose' })
    // A run means the sheet asked for nothing after the tap.
    expect(wrapper.emitted('close')).toBeUndefined()
  })

  it('offers free text only as the explicit footer line', async () => {
    const wrapper = mountSheet()

    // No input anywhere in the sheet — typing has one home, the composer.
    expect(wrapper.find('input').exists()).toBe(false)

    await wrapper.find('[data-testid="browse-free-text"]').trigger('click')
    expect(wrapper.emitted('freeText')).toHaveLength(1)
  })

  it('says so when a tag filter matches nothing', async () => {
    const wrapper = mountSheet()

    // Every Technik item carried: the group keeps its carried row…
    await wrapper.setProps({ carriedItemIds: ['i-ladekabel'] })
    await wrapper.find('[data-testid="browse-tag-Technik"]').trigger('click')
    expect(wrapper.find('[data-testid="browse-row-carried"]').text()).toContain('Ladekabel')
    expect(wrapper.find('[data-testid="browse-no-match"]').exists()).toBe(false)

    // …while a tag with no items at all states the absence instead of
    // rendering an empty void.
    const store = useMasterStore()
    store.applyChange({
      seq: 1,
      table: 'tags',
      id: 't-winter',
      deleted: false,
      row: { name: 'Winter', sort_order: 3 },
    })
    await wrapper.vm.$nextTick()
    await wrapper.find('[data-testid="browse-tag-Winter"]').trigger('click')
    expect(wrapper.find('[data-testid="browse-no-match"]').exists()).toBe(true)
  })
})

/**
 * FR-25.13e — the switch that puts the carried rows away.
 *
 * The rules pinned here are the ones that make the reversal of FR-25.13d's
 * "a carried item stays listed" affordable: it is opt-in and remembered per
 * device, the count is scoped to what the tag axis shows, what the *run*
 * adds is never hidden (the snapshot rule), and every state this can empty
 * says which kind of empty it is and offers the way back.
 */
describe('InventoryBrowseSheet — hiding what is already in (FR-25.13e)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    // The preference is a shared module ref: without this, one test's switch
    // is the next test's default.
    browseHideCarried().reload()
    seed()
  })

  function toggle(wrapper: ReturnType<typeof mountSheet>) {
    return wrapper.find('[data-testid="browse-hide-toggle"]').trigger('click')
  }

  /**
   * The carried rows the sheet renders. Asserting on these rather than on the
   * tappable ones is what distinguishes *hidden* from *listed as "already in"*
   * — the free-row list looks identical either way.
   */
  function carriedNames(wrapper: ReturnType<typeof mountSheet>): string[] {
    return wrapper.findAll('[data-testid="browse-row-carried"]').map((row) => row.text())
  }

  it('is off by default: the line only counts, and every carried row is listed', () => {
    const wrapper = mountSheet(['i-pullover', 'i-ladekabel'])

    expect(wrapper.find('[data-testid="browse-hide-count"]').text()).toBe('2 already in')
    expect(wrapper.find('[data-testid="browse-hide-toggle"]').attributes('aria-pressed')).toBe(
      'false',
    )
    expect(wrapper.findAll('[data-testid="browse-row-carried"]')).toHaveLength(2)
  })

  it('hides the carried rows when switched on, and says how many', async () => {
    const wrapper = mountSheet(['i-pullover', 'i-ladekabel'])
    await toggle(wrapper)

    expect(rowNames(wrapper)).toEqual(['Badehose', 'Sonnenhut'])
    expect(wrapper.findAll('[data-testid="browse-row-carried"]')).toHaveLength(0)
    expect(wrapper.find('[data-testid="browse-hide-count"]').text()).toBe('2 hidden')
    // A group left with no rows loses its heading — an empty heading promises
    // a list that is not there.
    expect(wrapper.findAll('[data-testid="browse-group-head"]').map((h) => h.text())).toEqual([
      'Kleidung',
      'Untagged',
    ])
  })

  it('keeps a row added during the run visible, marked as added', async () => {
    const wrapper = mountSheet(['i-pullover'])
    await toggle(wrapper)
    expect(rowNames(wrapper)).toContain('Badehose')

    // The caller's carried set grows after the tap — the row must not vanish
    // under the finger, and it is the run's only feedback.
    await wrapper.setProps({ carriedItemIds: ['i-pullover', 'i-badehose'] })

    const added = wrapper.find('[data-testid="browse-added-now"]')
    expect(added.exists()).toBe(true)
    expect(added.text()).toContain('added')
    expect(wrapper.find('[data-testid="browse-row-carried"]').text()).toContain('Badehose')
    // The count follows the same clock: the added row is on screen, so it is
    // not counted as hidden.
    expect(wrapper.find('[data-testid="browse-hide-count"]').text()).toBe('1 hidden')
    // And the row the switch hid is still hidden — listed nowhere, neither as
    // an offer nor as a carried row.
    expect(rowNames(wrapper)).not.toContain('Pullover')
    expect(carriedNames(wrapper)).toEqual([expect.stringContaining('Badehose')])
  })

  it('re-takes the snapshot when the tag filter changes', async () => {
    const wrapper = mountSheet(['i-pullover'])
    await toggle(wrapper)
    await wrapper.setProps({ carriedItemIds: ['i-pullover', 'i-badehose'] })
    expect(wrapper.find('[data-testid="browse-added-now"]').exists()).toBe(true)

    // Moving the axis starts a new pass over a different part of the
    // inventory: what is carried by then is what is in the way. Both lists are
    // asserted — Kleidung is entirely carried by now, so "no tappable rows"
    // is equally true of a sheet that hides nothing at all.
    await wrapper.find('[data-testid="browse-tag-Kleidung"]').trigger('click')
    expect(rowNames(wrapper)).toEqual([])
    expect(carriedNames(wrapper)).toEqual([])
    expect(wrapper.find('[data-testid="browse-added-now"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="browse-all-carried"]').exists()).toBe(true)
  })

  it('counts inside the tag filter, and drops the line where it would hide nothing', async () => {
    const wrapper = mountSheet(['i-pullover', 'i-ladekabel'])

    await wrapper.find('[data-testid="browse-tag-Technik"]').trigger('click')
    expect(wrapper.find('[data-testid="browse-hide-count"]').text()).toBe('1 already in')

    await wrapper.find('[data-testid="browse-tag-Sommer"]').trigger('click')
    expect(wrapper.find('[data-testid="browse-hide-toggle"]').exists()).toBe(false)
  })

  it('separates the two kinds of empty, and offers the way back out', async () => {
    const wrapper = mountSheet(['i-ladekabel'])
    await wrapper.find('[data-testid="browse-tag-Technik"]').trigger('click')
    await toggle(wrapper)

    const tagSentence = wrapper.find('[data-testid="browse-all-carried"]')
    expect(tagSentence.text()).toContain('Everything with this tag is already in.')
    // Not the inventory-gap sentence: this list is finished, not empty.
    expect(wrapper.find('[data-testid="browse-no-match"]').exists()).toBe(false)
    // The tag axis stays: the next tag is one tap away.
    expect(wrapper.find('[data-testid="browse-tag-all"]').exists()).toBe(true)

    await wrapper.find('[data-testid="browse-show-anyway"]').trigger('click')
    expect(wrapper.find('[data-testid="browse-row-carried"]').text()).toContain('Ladekabel')
  })

  it('has its own sentence when the whole inventory is already in', async () => {
    const wrapper = mountSheet(['i-badehose', 'i-pullover', 'i-ladekabel', 'i-sonnenhut'])
    await toggle(wrapper)

    expect(wrapper.find('[data-testid="browse-all-carried"]').text()).toContain(
      'Everything in the inventory is already in.',
    )
  })

  it('remembers the switch per device, and never hides on a value it cannot read', async () => {
    const wrapper = mountSheet(['i-pullover'])
    await toggle(wrapper)
    expect(localStorage.getItem('jitpack_browse_hide_carried')).toBe('true')

    // A fresh mount opens in the remembered posture…
    browseHideCarried().reload()
    expect(carriedNames(mountSheet(['i-pullover']))).toEqual([])

    // …while a stored value nothing wrote leaves the inventory alone rather
    // than hiding rows the user never asked to hide.
    localStorage.setItem('jitpack_browse_hide_carried', 'yes please')
    browseHideCarried().reload()
    expect(carriedNames(mountSheet(['i-pullover']))).toEqual([expect.stringContaining('Pullover')])
  })
})

describe('InventoryBrowseSheet — the two verbs (FR-25.13f)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    // The FR-25.13e switch is a shared module ref — one test's flip is the
    // next test's default without this.
    browseHideCarried().reload()
    seed()
  })

  /** M4's answer about what the trip carries; M6 and M8 pass none. */
  function states(
    entries: Record<string, Partial<BrowseRowSummary> & { state: BrowseRowSummary['state'] }>,
  ): ReadonlyMap<string, BrowseRowSummary> {
    return new Map(
      Object.entries(entries).map(([id, value]) => [
        id,
        { itemIds: [`row-${id}`], lockNote: null, ...value },
      ]),
    )
  }

  function mountWithVerbs(carriedItemIds: string[], rowStates: ReadonlyMap<string, BrowseRowSummary>) {
    return mount(InventoryBrowseSheet, { props: { carriedItemIds, rowStates } })
  }

  it('offers no verbs where the caller reports no packing states (M6/M8, G-8)', () => {
    const wrapper = mountSheet()

    expect(wrapper.find('[data-testid="browse-pack"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="browse-skip"]').exists()).toBe(false)
  })

  it('adds and decides in one tap on a free line', async () => {
    const wrapper = mountWithVerbs([], states({}))

    await wrapper.get(`[aria-label='Mark "Badehose" as packed']`).trigger('click')
    await wrapper.get(`[aria-label='Deliberately leave "Pullover" behind']`).trigger('click')

    expect(wrapper.emitted('addPacked')?.[0]?.[0]).toMatchObject({ id: 'i-badehose' })
    expect(wrapper.emitted('addSkipped')?.[0]?.[0]).toMatchObject({ id: 'i-pullover' })
    // Neither is a plain add: the decision travels with it, not after it.
    expect(wrapper.emitted('add')).toBeUndefined()
  })

  it('acts on the existing rows where the trip already carries the item', async () => {
    const wrapper = mountWithVerbs(['i-badehose'], states({ 'i-badehose': { state: 'open' } }))

    await wrapper.find('[data-testid="browse-pack"]').trigger('click')

    expect(wrapper.emitted('pack')?.[0]?.[0]).toMatchObject({ id: 'i-badehose' })
    expect(wrapper.emitted('addPacked')).toBeUndefined()
  })

  it('says what the run did to a line, and how many people it reached (FR-25.21)', async () => {
    const wrapper = mountWithVerbs(
      ['i-badehose'],
      states({ 'i-badehose': { state: 'open', itemIds: ['r1', 'r2', 'r3'] } }),
    )

    await wrapper.find('[data-testid="browse-pack"]').trigger('click')

    const packed = wrapper.find('[data-testid="browse-packed-now"]')
    expect(packed.exists()).toBe(true)
    // A single ✓ that quietly packed three rows must not claim only one.
    expect(packed.text()).toContain('3 people')
    // The line stays where it is — FR-25.13e's rule, unchanged by the verbs.
    const line = wrapper.find('[data-testid="browse-row-carried"]')
    expect(line.text()).toContain('Badehose')
    expect(line.find('[data-testid="browse-pack"]').exists()).toBe(false)
  })

  it('offers the way back in the line itself, once, and gives the line back afterwards', async () => {
    const wrapper = mountWithVerbs([], states({}))

    await wrapper.findAll('[data-testid="browse-skip"]')[0]!.trigger('click')
    expect(wrapper.find('[data-testid="browse-skipped-now"]').exists()).toBe(true)

    await wrapper.find('[data-testid="browse-undo"]').trigger('click')

    expect(wrapper.emitted('undo')?.[0]?.[0]).toMatchObject({ id: 'i-badehose' })
    // The run's record is gone, so the line renders from the props again —
    // which is what makes a second decision on it possible.
    expect(wrapper.find('[data-testid="browse-skipped-now"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="browse-undo"]').exists()).toBe(false)
    expect(wrapper.findAll('[data-testid="browse-skip"]')).toHaveLength(4)
  })

  it('lets the run’s own verb outrank FR-25.13e’s added signal', async () => {
    const wrapper = mountWithVerbs(['i-ladekabel'], states({ 'i-ladekabel': { state: 'open' } }))
    await wrapper.find('[data-testid="browse-hide-toggle"]').trigger('click')

    await wrapper.get(`[aria-label='Mark "Badehose" as packed']`).trigger('click')
    // What the caller reports back is "carried since the snapshot" — which
    // FR-25.13e reads as *added*. The tap knows better, and must win.
    await wrapper.setProps({ carriedItemIds: ['i-ladekabel', 'i-badehose'] })

    expect(wrapper.find('[data-testid="browse-packed-now"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="browse-added-now"]').exists()).toBe(false)
  })

  it('states a settled row and offers it nothing', () => {
    const wrapper = mountWithVerbs(
      ['i-badehose', 'i-pullover'],
      states({ 'i-badehose': { state: 'packed' }, 'i-pullover': { state: 'skipped' } }),
    )

    const settled = wrapper.findAll('[data-testid="browse-settled"]').map((s) => s.text())
    expect(settled).toEqual(['already packed', 'staying home'])
    // Two of the four lines are settled; only the free ones carry verbs.
    expect(wrapper.findAll('[data-testid="browse-pack"]')).toHaveLength(2)
  })

  it('hands a locked row to its holder, naming them (G-3)', () => {
    const wrapper = mountWithVerbs(
      ['i-badehose'],
      states({ 'i-badehose': { state: 'locked', lockNote: 'Sia is packing this right now' } }),
    )

    expect(wrapper.find('[data-testid="browse-locked"]').text()).toContain('Sia is packing this')
    expect(wrapper.findAll('[data-testid="browse-pack"]')).toHaveLength(3)
  })
})
