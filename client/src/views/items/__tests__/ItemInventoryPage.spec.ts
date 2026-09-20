// @vitest-environment jsdom
/**
 * M9 — two subjects, and both are about a sentence the screen says.
 *
 * **ADR-033:** „no items yet", with the spreadsheet importer under it, is the
 * wrong sentence to show somebody whose two hundred items are still in flight.
 * The screen reads `activeItemList`, which is empty before the master pull and
 * empty when the inventory really is, and it could not tell those apart.
 *
 * **FR-24.6/24.7:** the tools are part of the screen rather than behind the
 * magnifier, the head counts what is shown, and a dead end names the filter
 * that caused it. The matching arithmetic itself is `domain/itemSearch`; what
 * is asserted here is what the *screen* does with it.
 *
 * The no-match state needs no guard of its own and this spec says why: it sits
 * behind `!isEmpty`, so at least one item is already on the device.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { actionSheetController } from '@ionic/vue'
import { flushPromises, mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

import ItemInventoryPage from '../ItemInventoryPage.vue'
import TagFilterSheet from '@/components/items/TagFilterSheet.vue'
import BulkTagSheet from '@/components/items/BulkTagSheet.vue'
import BulkAssigneeSheet from '@/components/items/BulkAssigneeSheet.vue'
import MergeItemsSheet from '@/components/items/MergeItemsSheet.vue'
import BulkDependencySheet from '@/components/items/BulkDependencySheet.vue'
import GroupJumpSheet from '@/components/items/GroupJumpSheet.vue'
import TagManagerSheet from '@/components/items/TagManagerSheet.vue'
import MarkPicker from '@/components/items/MarkPicker.vue'
import ItemMark from '@/components/items/ItemMark.vue'
import CreateItemSheet from '@/components/items/CreateItemSheet.vue'
import { UNTAGGED_KEY } from '@/domain/tags'
import { setHeaderTitle } from '@/composables/useHeaderTitle'
import { setHeaderActions, type HeaderAction } from '@/composables/useHeaderActions'
import { presentToast } from '@/lib/toast'
import { confirmAction, confirmDestructive, promptText } from '@/lib/confirm'
import { bulkRetireSentence } from '@/lib/deletionLabels'
import { useMasterStore } from '@/stores/masterStore'
import { inventoryProperties } from '@/composables/useInventoryProperties'
import { TABLE } from '@/types/tables'
import { t } from '@/i18n'

import { masterDataStub } from '@/composables/__tests__/masterDataStub'
import { makeSeamContext } from '@/composables/sync/__tests__/seamContext'
import { createMasterDataActions } from '@/composables/sync/actions/masterData'
import { createDependencyActions } from '@/composables/sync/actions/dependencies'
import { identityStub } from '@/composables/__tests__/identityStub'
import { ORCHESTRATOR } from '@/composables/useOrchestrator'
import { PATH } from '@/router/paths'

vi.mock('@/composables/useHeaderTitle', () => ({ setHeaderTitle: vi.fn() }))
vi.mock('@/composables/useHeaderActions', () => ({ setHeaderActions: vi.fn() }))
vi.mock('@/lib/toast', () => ({ presentToast: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/confirm', () => ({
  confirmDestructive: vi.fn().mockResolvedValue(true),
  confirmAction: vi.fn().mockResolvedValue(false),
  promptText: vi.fn().mockResolvedValue(undefined),
}))
const { routerPush } = vi.hoisted(() => ({ routerPush: vi.fn() }))
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPush, replace: vi.fn() }),
  useRoute: () => ({ query: {}, params: {} }),
}))

const master = masterDataStub()
const orchestratorFake = {
  ...master,
  // The identity seam comes with every mount, since M9 reads the directory
  // for FR-1.9's bulk action; a spec about that action puts accounts in it.
  ...identityStub(),
  // FR-24.12's count reads the day and which trips are on the device.
  today: () => '2026-09-19',
  tripDataLoaded: () => true,
}

function seedItem(name: string, id = 'i1') {
  useMasterStore().applyChange({
    seq: 0,
    table: TABLE.items,
    id,
    deleted: false,
    row: { name, unit: 'pcs' },
  })
}

function seedTag(name: string, id: string, sortOrder = 0) {
  useMasterStore().applyChange({
    seq: 0,
    table: TABLE.tags,
    id,
    deleted: false,
    row: { name, sort_order: sortOrder },
  })
}

function assignTag(itemId: string, tagId: string, position = 0) {
  useMasterStore().applyChange({
    seq: 0,
    table: TABLE.itemTags,
    id: `${itemId}-${tagId}`,
    deleted: false,
    row: { item_id: itemId, tag_id: tagId, position },
  })
}

/** Type into the persistent field the screen now owns (FR-24.6). */
async function typeSearch(page: ReturnType<typeof mountPage>, term: string) {
  const field = page.find('[data-testid="items-search-input"]')
  await field.setValue(term)
  await flushPromises()
}

/** The head's meta line, as the frame would render it (FR-24.6). */
function headMeta(): string | null {
  const calls = vi.mocked(setHeaderTitle).mock.calls
  const meta = calls.at(-1)?.[1] as (() => string | null) | undefined
  return meta ? meta() : null
}

/**
 * `attach` puts the page in the document, which only the focus case needs:
 * `document.activeElement` never moves for a detached element, so without it
 * the "takes no focus" assertion passes against a field that focuses
 * unconditionally — which it did, until this was measured. It is opt-in
 * rather than the default because an attached `ion-segment` runs its own
 * scroll handling on every mutation, and jsdom has no `Element.scrollTo` to
 * run it with; stubbing that globally would hide a real error in the next
 * spec that hits it.
 */
function mountPage(attach = false) {
  return mount(ItemInventoryPage, {
    ...(attach ? { attachTo: document.body } : {}),
    global: { provide: { [ORCHESTRATOR]: orchestratorFake } },
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  master.masterLoaded.value = true
})

describe('M9 inventory — an absence it has not read yet (ADR-033, G-7)', () => {
  it('says the inventory is loading rather than offering to import a first one', async () => {
    master.masterLoaded.value = false

    const page = mountPage()
    await flushPromises()

    expect(page.find('[data-testid="m9-list-loading"]').exists()).toBe(true)
    expect(page.find('[data-testid="m9-empty"]').exists()).toBe(false)
    expect(page.find('[data-testid="m9-import"]').exists()).toBe(false)
    expect(page.text()).toContain(t('items.listUnknown'))

    master.masterLoaded.value = true
    await flushPromises()

    expect(page.find('[data-testid="m9-list-loading"]').exists()).toBe(false)
    expect(page.find('[data-testid="m9-empty"]').exists()).toBe(true)
  })

  /*
   * The chrome was deciding on the bare `isEmpty` too: with the rows still on
   * their way the search row was gone and the bar was down to two glyphs,
   * which states „there is nothing here" as plainly as the sentence the notice
   * declines to write — and then jumps when the rows land.
   */
  it('keeps the tools it will have while the rows are still on their way', async () => {
    master.masterLoaded.value = false

    const page = mountPage()
    await flushPromises()

    expect(page.find('[data-testid="m9-tools"]').exists()).toBe(true)
    // The bar reads the same fact, and it is a second site: the tools row is a
    // template `v-if` and this is a function, so one says nothing about the
    // other.
    const build = vi.mocked(setHeaderActions).mock.calls.at(-1)![0] as () => HeaderAction[]
    expect(build().map((action) => action.id)).toContain('m9-select')

    // Once the inventory is known to be empty the tools go, which is FR-24.6's
    // own intent — this half is what keeps the fix from simply always showing
    // them.
    master.masterLoaded.value = true
    await flushPromises()

    expect(page.find('[data-testid="m9-tools"]').exists()).toBe(false)
    expect(build().map((action) => action.id)).not.toContain('m9-select')
  })

  it('leaves the no-match state alone — it can only be reached with an item here', async () => {
    seedItem('Sonnencreme')
    master.masterLoaded.value = false

    const page = mountPage()
    await flushPromises()

    // The item is the positive signal: the list is not empty, so neither the
    // notice nor the G-7 state applies, and the screen renders its rows.
    expect(page.find('[data-testid="m9-list-loading"]').exists()).toBe(false)
    expect(page.find('[data-testid="m9-empty"]').exists()).toBe(false)
    expect(page.findAll('[data-testid="m9-row"]')).toHaveLength(1)
  })
})

describe('M9 inventory — the tools stay on the screen (FR-24.6)', () => {
  it('renders the search field without waiting for a magnifier, and takes no focus', async () => {
    seedItem('Sonnencreme')

    const page = mountPage(true)
    await flushPromises()

    // The G-12 exception: the field is there on arrival. Before this it was
    // revealed by a header action, and the header cluster is where the proof
    // sits — the screen registers the eye and nothing else.
    expect(page.find('[data-testid="items-search-input"]').exists()).toBe(true)
    expect(page.find('[data-testid="m9-tools"]').exists()).toBe(true)
    expect(document.activeElement).not.toBe(page.find('[data-testid="items-search-input"]').element)
    expect(document.activeElement).toBe(document.body)
  })

  it('offers the clear control only once there is something to clear', async () => {
    seedItem('Sonnencreme')

    const page = mountPage()
    await flushPromises()

    // The persistent row's ✕ empties the field instead of closing it, so an
    // empty field must not render one: a control that does nothing reads as
    // a broken one.
    expect(page.find('[data-testid="search-clear"]').exists()).toBe(false)

    await typeSearch(page, 'sonne')
    expect(page.find('[data-testid="search-clear"]').exists()).toBe(true)

    await page.find('[data-testid="search-clear"]').trigger('click')
    await flushPromises()
    expect(page.find('[data-testid="items-search-input"]').element).toHaveProperty('value', '')
    expect(page.findAll('[data-testid="m9-row"]')).toHaveLength(1)
  })

  it('counts the collection in the head, and what a filter leaves of it', async () => {
    seedItem('Sonnencreme', 'i1')
    seedItem('Sonnenbrille', 'i2')
    seedTag('Diverses', 't1')

    const page = mountPage()
    await flushPromises()

    expect(headMeta()).toBe(t('items.metaAll', { items: 2, tags: 1 }))

    await typeSearch(page, 'brille')
    expect(page.findAll('[data-testid="m9-row"]')).toHaveLength(1)
    expect(headMeta()).toBe(t('items.metaFiltered', { shown: 1, total: 2 }))
  })

  it('keeps the row’s initial its own while the headings are reasons', async () => {
    seedItem('Finken', 'i1')
    seedTag('Schuhe', 't1')
    assignTag('i1', 't1')

    const page = mountPage()
    await flushPromises()
    await typeSearch(page, 'schuhe')

    // The heading under a search is „Matched a tag", and taking *its* initial
    // painted an N (for „name") on every row of the group above it.
    // The row's own ladder — headings and chips render a plain mark too (FR-24.13).
    const mark = page
      .findAllComponents({ name: 'ItemMark' })
      .find((m) => m.props('surface') === 'inventory')!
    expect(mark.props('initial')).toBe('S')
  })

  it('groups the results by why they matched, and says what carried the match', async () => {
    seedItem('Sonnencreme', 'i1')
    seedItem('Finken', 'i2')
    seedTag('Sonnenschutz', 't1')
    assignTag('i2', 't1')

    const page = mountPage()
    await flushPromises()
    await typeSearch(page, 'sonnen')

    const heads = page.findAll('[data-testid="m9-group-head"]').map((h) => h.text())
    expect(heads[0]).toContain(t('items.match.name'))
    expect(heads[1]).toContain(t('items.match.tag'))
    // The tag hit says which tag, because the row does not contain the query.
    expect(page.find('[data-testid="m9-row-via"]').text()).toBe(
      t('items.matchVia', { via: 'Sonnenschutz' }),
    )
  })
})

describe('M9 inventory — a dead end explains itself (FR-24.7)', () => {
  it('names the tag that is narrowing the list and counts the hits outside it', async () => {
    seedItem('Normale Socken', 'i1')
    seedItem('Zahnbürste', 'i2')
    seedTag('Hygiene', 't-hyg')
    assignTag('i2', 't-hyg')

    const page = mountPage()
    await flushPromises()

    // Filter to Hygiene, then search for something that exists elsewhere —
    // the exact shape measured on the family instance. The chip is one of the
    // three the bar offers (FR-24.8); the axis it replaced is gone.
    await page.find('[data-testid="m9-tag-chip-Hygiene"]').trigger('click')
    await flushPromises()
    await typeSearch(page, 'socken')

    const empty = page.find('[data-testid="m9-no-match"]')
    expect(empty.exists()).toBe(true)
    expect(empty.text()).toContain(t('items.noMatchInTag', { tag: 'Hygiene' }))
    expect(empty.text()).toContain(t('items.noMatchElsewhere', { n: 1 }))

    // And the way out is on the screen: clearing the filter keeps the query.
    await page.find('[data-testid="m9-search-everywhere"]').trigger('click')
    await flushPromises()
    expect(page.find('[data-testid="m9-no-match"]').exists()).toBe(false)
    expect(page.findAll('[data-testid="m9-row"]')).toHaveLength(1)
    expect(page.find('[data-testid="m9-row"]').text()).toContain('Normale Socken')
  })

  it('says only "no match" when nothing is narrowing the list', async () => {
    seedItem('Sonnencreme')

    const page = mountPage()
    await flushPromises()
    await typeSearch(page, 'zzz')

    const empty = page.find('[data-testid="m9-no-match"]')
    expect(empty.text()).toContain(t('items.noMatch'))
    // No filter, so no count of what lies outside one, and no way-out button
    // that would only repeat what the field already offers.
    expect(page.find('[data-testid="m9-search-everywhere"]').exists()).toBe(false)
  })
})

describe('M9 inventory — picking a tag without a swipe axis (FR-24.8)', () => {
  /** Four tags, so the bar's three chips leave one behind the sheet. */
  function seedVocabulary() {
    seedTag('Diverses', 't-div', 0)
    seedTag('Hygiene', 't-hyg', 1)
    seedTag('Sport', 't-sport', 2)
    seedTag('Wandern', 't-wan', 3)
    seedItem('Sonnencreme', 'i1')
    seedItem('Sonnenbrille', 'i2')
    seedItem('Zahnbürste', 'i3')
    seedItem('Laufschuhe', 'i4')
    seedItem('Wanderstöcke', 'i5')
    assignTag('i1', 't-div')
    assignTag('i2', 't-div')
    assignTag('i3', 't-hyg')
    assignTag('i4', 't-sport')
    assignTag('i4', 't-div', 1)
    assignTag('i5', 't-wan')
  }

  it('offers the three biggest tags and no scrollable axis at all', async () => {
    seedVocabulary()

    const page = mountPage()
    await flushPromises()

    // Diverses 3, Hygiene 1, Sport 1, Wandern 1 — the first three by count,
    // ties by axis order.
    expect(page.find('[data-testid="m9-tag-chip-Diverses"]').exists()).toBe(true)
    expect(page.find('[data-testid="m9-tag-chip-Hygiene"]').exists()).toBe(true)
    expect(page.find('[data-testid="m9-tag-chip-Sport"]').exists()).toBe(true)
    expect(page.find('[data-testid="m9-tag-chip-Wandern"]').exists()).toBe(false)

    // The control it replaced is gone rather than hidden.
    expect(page.findComponent({ name: 'IonSegment' }).exists()).toBe(false)
    // ...and the door to the rest names how many there are.
    expect(page.find('[data-testid="m9-filter-open"]').text()).toContain(
      t('items.filterAll', { n: 4 }),
    )
  })

  it('carries each chip’s count, so a shortcut says what it leads to', async () => {
    seedVocabulary()

    const page = mountPage()
    await flushPromises()

    expect(page.find('[data-testid="m9-tag-chip-Diverses"]').text()).toContain('3')
    expect(page.find('[data-testid="m9-tag-chip-Hygiene"]').text()).toContain('1')
  })

  it('combines two tags under "all", which the single-select axis could not ask', async () => {
    seedVocabulary()

    const page = mountPage()
    await flushPromises()

    await page.find('[data-testid="m9-tag-chip-Diverses"]').trigger('click')
    await flushPromises()
    expect(page.findAll('[data-testid="m9-row"]')).toHaveLength(3)

    await page.find('[data-testid="m9-tag-chip-Sport"]').trigger('click')
    await flushPromises()
    // Still "any": the union of the two.
    expect(page.findAll('[data-testid="m9-row"]')).toHaveLength(3)

    // The sheet's own controls are asserted in `TagFilterSheet.spec.ts`:
    // Ionic renders an overlay's content only once it has presented, which
    // never happens under jsdom. What the page owns is what it does with the
    // sheet's contract, so the mode arrives the way the sheet sends it.
    page.findComponent(TagFilterSheet).vm.$emit('update:mode', 'all')
    await flushPromises()
    // Only the item carrying both.
    const rows = page.findAll('[data-testid="m9-row"]')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.text()).toContain('Laufschuhe')
  })

  it('keeps a tag that is not one of the three visible as its own chip', async () => {
    seedVocabulary()

    const page = mountPage()
    await flushPromises()
    page.findComponent(TagFilterSheet).vm.$emit('update:selection', ['t-wan'])
    await flushPromises()

    // Not among the three shortcuts, so the bar grows a chip for it —
    // otherwise the list is narrowed by something the screen never shows.
    const chip = page.find('[data-testid="m9-clear-tag-Wandern"]')
    expect(chip.exists()).toBe(true)
    expect(page.findAll('[data-testid="m9-row"]')).toHaveLength(1)

    await chip.trigger('click')
    await flushPromises()
    expect(page.findAll('[data-testid="m9-row"]')).toHaveLength(5)
  })

  it('keeps the untagged bucket exclusive, because "all" plus a tag is empty by construction', async () => {
    seedVocabulary()
    seedItem('Loses Teil', 'i6')

    const page = mountPage()
    await flushPromises()
    page.findComponent(TagFilterSheet).vm.$emit('update:selection', [UNTAGGED_KEY])
    await flushPromises()
    // ...and the other way round: a chip drops the bucket, which is the half
    // the page owns.
    expect(page.findAll('[data-testid="m9-row"]')).toHaveLength(1)
    await page.find('[data-testid="m9-tag-chip-Diverses"]').trigger('click')
    await flushPromises()
    expect(page.findAll('[data-testid="m9-row"]')).toHaveLength(3)

    page.findComponent(TagFilterSheet).vm.$emit('update:selection', [UNTAGGED_KEY])
    await flushPromises()

    // The tag went with it, so the screen shows the bucket rather than an
    // impossible intersection.
    const rows = page.findAll('[data-testid="m9-row"]')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.text()).toContain('Loses Teil')
    expect(page.find('[data-testid="m9-tag-chip-Diverses"]').classes()).not.toContain('active')
  })

  it('offers the jump only while there is more than one group to jump between', async () => {
    seedItem('Sonnencreme', 'i1')
    seedTag('Diverses', 't-div')
    assignTag('i1', 't-div')

    const page = mountPage()
    await flushPromises()
    // One group: the heading is a heading, not a control.
    expect(page.find('[data-testid="m9-jump-open"]').exists()).toBe(false)

    seedItem('Zahnbürste', 'i3')
    seedTag('Hygiene', 't-hyg', 1)
    assignTag('i3', 't-hyg')
    await flushPromises()
    expect(page.findAll('[data-testid="m9-jump-open"]').length).toBe(2)

    // ...and never while searching, where the headings are match reasons and
    // the list is not the inventory's own order.
    await typeSearch(page, 'sonne')
    expect(page.find('[data-testid="m9-jump-open"]').exists()).toBe(false)
  })
})

describe('M9 inventory — the jump waits for the sheet to be gone (FR-24.8)', () => {
  /**
   * The ordering rule, which the e2e case cannot falsify: while an Ionic
   * overlay is presented the scroll host is locked, and a `scrollTo` issued
   * in the same breath as the dismissal is clamped — measured on the family
   * instance as 120 px of a 9 975 px jump. A short list (any list an e2e case
   * builds through the UI) is reachable inside that clamp, so the defect is
   * invisible there and the rule is asserted here instead.
   */
  function stubScroller(page: ReturnType<typeof mountPage>) {
    const scrollTo = vi.fn()
    const scroller = {
      scrollTo,
      scrollTop: 0,
      getBoundingClientRect: () => ({ top: 0, height: 800 }) as DOMRect,
    }
    const content = page.find('ion-content').element as HTMLElement & {
      getScrollElement?: () => Promise<unknown>
    }
    content.getScrollElement = () => Promise.resolve(scroller)
    return scrollTo
  }

  it('scrolls only once the sheet reports it has dismissed', async () => {
    seedItem('Sonnencreme', 'i1')
    seedItem('Zahnbürste', 'i2')
    seedTag('Diverses', 't-div')
    seedTag('Hygiene', 't-hyg', 1)
    assignTag('i1', 't-div')
    assignTag('i2', 't-hyg')

    const page = mountPage()
    await flushPromises()
    const scrollTo = stubScroller(page)

    const sheet = page.findComponent(GroupJumpSheet)
    sheet.vm.$emit('jump', 'Hygiene')
    await flushPromises()

    // Still presented: nothing has moved yet.
    expect(scrollTo).not.toHaveBeenCalled()

    sheet.vm.$emit('dismiss')
    await flushPromises()

    expect(scrollTo).toHaveBeenCalledTimes(1)
  })

  it('does not scroll when the sheet is dismissed without a choice', async () => {
    seedItem('Sonnencreme', 'i1')
    seedTag('Diverses', 't-div')
    assignTag('i1', 't-div')

    const page = mountPage()
    await flushPromises()
    const scrollTo = stubScroller(page)

    page.findComponent(GroupJumpSheet).vm.$emit('dismiss')
    await flushPromises()

    // Closing the sheet is not a jump — the key is consumed, never kept.
    expect(scrollTo).not.toHaveBeenCalled()
  })
})

/**
 * FR-24.9 — acting on several rows at once. The bulk give, take and undo are
 * the **real** master-data actions over a seam context, since the screen and
 * `jitpack tags` share them (FR-18.9); `writes` reads back what they queued.
 * What is asserted is *which rows the screen asked to write*: the selection
 * it hands over, and the undo it wires to the snackbar.
 */
describe('M9 inventory — the selection mode (FR-24.9)', () => {
  interface Writes {
    assigned: { id: string; itemId: string; tagId: string; position: number }[]
    unassigned: string[]
    moved: { assignmentId: string; position: number }[]
    /** Tags the undo removed — a tag the batch itself created. */
    tagsDeleted: string[]
    deleted: string[]
    /** FR-1.9: which items were told who they are usually assigned to. */
    assignees: { itemId: string; assigneeId: string | null }[]
    /** FR-20.1: the edges a bulk link wrote, and the ids its undo removed. */
    links: { id: string; itemId: string; dependsOn: string; mode: string }[]
    linksRemoved: string[]
  }

  let writes: Writes

  /** Press the app bar's own entry, which is where the mode is armed. */
  function headerAction(id: string): HeaderAction {
    const build = vi.mocked(setHeaderActions).mock.calls.at(-1)![0] as () => HeaderAction[]
    return build().find((action) => action.id === id)!
  }

  function seedThree() {
    seedTag('Diverses', 't-div', 0)
    seedTag('Sonnenschutz', 't-sonne', 1)
    seedItem('Sonnencreme', 'i1')
    seedItem('Sonnenbrille', 'i2')
    seedItem('Taschenmesser', 'i3')
    assignTag('i1', 't-div')
    assignTag('i2', 't-div')
    assignTag('i3', 't-div')
    // One of them already carries the target tag, behind Diverses.
    assignTag('i2', 't-sonne', 1)
  }

  async function enterSelection() {
    headerAction('m9-select').onClick()
    await flushPromises()
  }

  beforeEach(() => {
    const { ctx, queued } = makeSeamContext()
    const actions = createMasterDataActions(ctx)
    const sent = (table: string) =>
      queued.flatMap((q) => q.muts.map((m) => m.mutation)).filter((m) => m.table === table)
    const deleted: string[] = []
    writes = {
      get assigned() {
        return sent(TABLE.itemTags)
          .filter((m) => m.op === 'insert')
          .map((m) => ({
            id: m.id,
            itemId: m.fields!.item_id as string,
            tagId: m.fields!.tag_id as string,
            position: m.fields!.position as number,
          }))
      },
      get unassigned() {
        return sent(TABLE.itemTags)
          .filter((m) => m.op === 'delete')
          .map((m) => m.id)
      },
      get moved() {
        return sent(TABLE.itemTags)
          .filter((m) => m.op === 'upsert')
          .map((m) => ({ assignmentId: m.id, position: m.fields!.position as number }))
      },
      get tagsDeleted() {
        return sent(TABLE.tags)
          .filter((m) => m.op === 'delete')
          .map((m) => m.id)
      },
      get assignees() {
        return sent(TABLE.items)
          .filter((m) => m.fields && 'default_assignee_id' in m.fields)
          .map((m) => ({
            itemId: m.id,
            assigneeId: m.fields!.default_assignee_id as string | null,
          }))
      },
      get links() {
        return sent(TABLE.itemDependencies)
          .filter((m) => m.op === 'insert')
          .map((m) => ({
            id: m.id,
            itemId: m.fields!.item_id as string,
            dependsOn: m.fields!.depends_on_item_id as string,
            mode: m.fields!.mode as string,
          }))
      },
      get linksRemoved() {
        return sent(TABLE.itemDependencies)
          .filter((m) => m.op === 'delete')
          .map((m) => m.id)
      },
      deleted,
    }
    const dependencies = createDependencyActions(ctx)
    Object.assign(orchestratorFake, {
      giveTagToItems: actions.giveTagToItems,
      takeTagFromItems: actions.takeTagFromItems,
      undoBulkTag: actions.undoBulkTag,
      assignDefaultAssignee: actions.assignDefaultAssignee,
      undoBulkAssignee: actions.undoBulkAssignee,
      linkItemsToDependency: dependencies.linkItemsToDependency,
      undoBulkDependency: dependencies.undoBulkDependency,
      masterItemDeletionOutlook: (itemId: string) => ({
        // Only the first item is referenced anywhere: the batch spans both
        // acts, which is the case the confirm has to report honestly.
        kind: itemId === 'i1' ? 'retire' : 'remove',
        references: itemId === 'i1' ? 2 : 0,
        certain: true,
      }),
      deleteMasterItem: (itemId: string) => deleted.push(itemId),
    })
  })

  it('offers no selection at all while there is nothing to select', async () => {
    const page = mountPage()
    await flushPromises()

    // The empty inventory renders G-7, and an action over a selection that
    // cannot exist is the same offer the sheets refuse to make.
    expect(page.find('[data-testid="m9-empty"]').exists()).toBe(true)
    const build = vi.mocked(setHeaderActions).mock.calls.at(-1)![0] as () => HeaderAction[]
    expect(build().map((action) => action.id)).not.toContain('m9-select')

    seedItem('Sonnencreme', 'i1')
    await flushPromises()
    expect(build().map((action) => action.id)).toContain('m9-select')
  })

  it('arms from the app bar, stops the rows navigating, and takes what is on screen', async () => {
    seedThree()

    const page = mountPage()
    await flushPromises()

    // Off: the rows are links into M10, and there is no box to tick.
    const rowLink = () =>
      page
        .findAllComponents({ name: 'IonItem' })
        .find((row) => row.attributes('data-testid') === 'm9-row')!
        .props('routerLink') as unknown
    // Which row sorts first does not matter; that it *is* a link does.
    // Ionic fills an unset prop with a Symbol sentinel rather than undefined,
    // so the question is asked as "is it a path".
    expect(typeof rowLink()).toBe('string')
    expect(page.find('[data-testid="m9-selbar"]').exists()).toBe(false)
    expect(page.find('[data-testid="m9-row-check-Sonnencreme"]').exists()).toBe(false)

    await enterSelection()

    expect(page.find('[data-testid="m9-selbar"]').exists()).toBe(true)
    // On: the same tap picks instead of leaving the screen.
    expect(typeof rowLink()).not.toBe('string')
    expect(page.find('[data-testid="m9-row-check-Sonnencreme"]').exists()).toBe(true)

    await page.find('[data-testid="m9-select-all"]').trigger('click')
    expect(page.find('[data-testid="m9-select-count"]').text()).toContain('3')

    // The same control clears, so it undoes itself.
    await page.find('[data-testid="m9-select-all"]').trigger('click')
    expect(page.find('[data-testid="m9-select-count"]').text()).toBe(t('items.selectedNone'))
  })

  it('counts one picked row as one, and none as none', async () => {
    // The catalogue has two forms and `n === 1` takes the first, so a zero
    // sentence written as the „singular" said „Nichts ausgewählt" for one row
    // and „0 ausgewählt" for none. The clause that carries this is the
    // `not.toBe` below: comparing the bar against `t` alone was green against
    // the inverted catalogue, because both sides came from the same entry.
    seedThree()

    const page = mountPage()
    await flushPromises()
    await enterSelection()

    const bar = () => page.find('[data-testid="m9-select-count"]').text()
    expect(bar()).toBe(t('items.selectedNone'))

    await page.find('[data-testid="m9-row-check-Sonnencreme"]').trigger('click')
    expect(bar()).toBe(t('items.selectedCount', { n: 1 }))
    expect(bar()).not.toBe(t('items.selectedNone'))

    await page.find('[data-testid="m9-row-check-Sonnenbrille"]').trigger('click')
    expect(bar()).toBe(t('items.selectedCount', { n: 2 }))
  })

  it('“Alle N” means what the filter and the search left, not the inventory', async () => {
    seedThree()

    const page = mountPage()
    await flushPromises()
    await typeSearch(page, 'sonnen')
    await enterSelection()

    await page.find('[data-testid="m9-select-all"]').trigger('click')

    // Two of three rows match — the batch is the screen, not the database.
    expect(page.find('[data-testid="m9-select-count"]').text()).toContain('2')
  })

  it('gives the tag only to the items missing it, and refiles them when asked', async () => {
    seedThree()

    const page = mountPage()
    await flushPromises()
    await enterSelection()
    await page.find('[data-testid="m9-select-all"]').trigger('click')
    page.findComponent(BulkTagSheet).vm.$emit('pick', { tagId: 't-sonne', primary: true })
    await flushPromises()

    // i2 already carries it, so it is moved rather than assigned twice.
    expect(writes.assigned.map((w) => w.itemId).sort()).toEqual(['i1', 'i3'])
    expect(writes.moved.map((w) => w.assignmentId)).toEqual(['i2-t-sonne'])
    // Primary means *below every sibling*, which is what refiles the row.
    expect(writes.assigned.every((w) => w.position < 0)).toBe(true)
    // The mode ends with the batch; leaving it armed invites a second press.
    expect(page.find('[data-testid="m9-selbar"]').exists()).toBe(false)
  })

  it('writes nothing, and says so, when the selection is already as asked', async () => {
    seedTag('Diverses', 't-div', 0)
    seedItem('Sonnencreme', 'i1')
    assignTag('i1', 't-div')

    const page = mountPage()
    await flushPromises()
    await enterSelection()
    await page.find('[data-testid="m9-select-all"]').trigger('click')
    page.findComponent(BulkTagSheet).vm.$emit('pick', { tagId: 't-div', primary: true })
    await flushPromises()

    expect(writes.assigned).toEqual([])
    expect(writes.moved).toEqual([])
    expect(vi.mocked(presentToast).mock.calls.at(-1)![0].message).toBe(t('items.bulkNothingToDo'))
  })

  it('creates a typed tag and gives it in one step; the undo takes the new tag too (FR-24.9)', async () => {
    seedThree()
    const createdTags: string[] = []
    Object.assign(orchestratorFake, {
      createTag: (name: string) => {
        createdTags.push(name)
        seedTag(name, 't-new', 2)
        return 't-new'
      },
    })

    const page = mountPage()
    await flushPromises()
    await enterSelection()
    await page.find('[data-testid="m9-select-all"]').trigger('click')
    page.findComponent(BulkTagSheet).vm.$emit('create', { name: 'Wasser', primary: true })
    await flushPromises()

    expect(createdTags).toEqual(['Wasser'])
    expect(writes.assigned.map((w) => w.itemId).sort()).toEqual(['i1', 'i2', 'i3'])
    expect(writes.assigned.every((w) => w.tagId === 't-new')).toBe(true)

    const toast = vi.mocked(presentToast).mock.calls.at(-1)![0]
    expect(toast.message).toBe(t('items.bulkGaveNew', { n: 3, tag: 'Wasser' }))
    await (toast.buttons![0] as { handler: () => void }).handler()
    await flushPromises()

    // The assignments go first, then the tag they emptied — a tag created
    // only to be undone is not left behind carrying nothing.
    expect(writes.unassigned).toHaveLength(3)
    expect(writes.tagsDeleted).toEqual(['t-new'])
  })

  it('takes a tag off only the selected items that carry it', async () => {
    seedThree()

    const page = mountPage()
    await flushPromises()
    await enterSelection()
    await page.find('[data-testid="m9-row-check-Sonnenbrille"]').trigger('click')
    await page.find('[data-testid="m9-bulk-take"]').trigger('click')
    page.findComponent(BulkTagSheet).vm.$emit('pick', { tagId: 't-sonne', primary: false })
    await flushPromises()

    expect(writes.unassigned).toEqual(['i2-t-sonne'])
  })

  it('puts a batch back where it was — created rows removed, removed rows re-made', async () => {
    seedThree()

    const page = mountPage()
    await flushPromises()
    await enterSelection()
    await page.find('[data-testid="m9-select-all"]').trigger('click')
    page.findComponent(BulkTagSheet).vm.$emit('pick', { tagId: 't-sonne', primary: false })
    await flushPromises()

    const created = writes.assigned.map((w) => w.id)
    expect(created).toHaveLength(2)

    // The snackbar's own button is the undo — pressed here through the toast
    // options, which is where the screen put it.
    const toast = vi.mocked(presentToast).mock.calls.at(-1)![0]
    await (toast.buttons![0] as { handler: () => void }).handler()
    await flushPromises()

    expect(writes.unassigned.sort()).toEqual(created.sort())
  })

  it('states both halves of a retire and offers no undo for it', async () => {
    seedThree()

    const page = mountPage()
    await flushPromises()
    await enterSelection()
    await page.find('[data-testid="m9-select-all"]').trigger('click')
    await page.find('[data-testid="m9-bulk-retire"]').trigger('click')
    await flushPromises()

    // One referenced row is hidden, two unreferenced ones are removed — the
    // sentence must carry both, because the batch spans two different acts.
    const confirm = vi.mocked(confirmDestructive).mock.calls.at(-1)![0]
    expect(confirm.message).toBe(bulkRetireSentence(1, 2))
    expect(confirm.message).toContain('1')
    expect(confirm.message).toContain('2')
    expect(writes.deleted.sort()).toEqual(['i1', 'i2', 'i3'])

    // No undo: the removed half cannot come back, so the confirm is the safety.
    const toast = vi.mocked(presentToast).mock.calls.at(-1)![0]
    expect(toast.buttons).toBeUndefined()
  })

  /**
   * FR-24.9 widened — the three later actions, which live behind the bar's ⋯
   * rather than beside the two tag ones. The action sheet is Ionic's, so it
   * is answered here the way a tap would answer it: `create` is spied on, its
   * buttons are read (that is the G-8 assertion) and its dismissal carries
   * the `data` of the button pressed.
   */
  const DIRECTORY = [
    { user_id: 'u-sia', display_name: 'Sia' },
    { user_id: 'u-max', display_name: 'Max' },
  ]

  /** Two accounts on the instance, as Server Mode answers (G-8). */
  function withAccounts() {
    Object.assign(orchestratorFake, { fetchUsers: async () => DIRECTORY })
  }

  /** Press ⋯ and answer its sheet with `data`, or dismiss it. Returns its buttons. */
  async function chooseMore(page: ReturnType<typeof mountPage>, data: string | null) {
    const buttons: { text: string; data?: string; role?: string }[] = []
    const create = vi
      .spyOn(actionSheetController, 'create')
      .mockImplementation(async (opts: { buttons?: unknown[] } = {}) => {
        buttons.push(...((opts.buttons ?? []) as typeof buttons))
        return {
          present: async () => {},
          onDidDismiss: async () => (data === null ? { role: 'cancel' } : { data }),
        } as never
      })
    await page.find('[data-testid="m9-bulk-more"]').trigger('click')
    await flushPromises()
    create.mockRestore()
    return buttons
  }

  /** Arm the mode over every row on screen — what all three actions start from. */
  async function selectAll(page: ReturnType<typeof mountPage>) {
    await enterSelection()
    await page.find('[data-testid="m9-select-all"]').trigger('click')
  }

  it('offers the merge only once two rows are picked (FR-24.15)', async () => {
    seedThree()

    const page = mountPage()
    await flushPromises()
    await enterSelection()
    await page.find('[data-testid="m9-row-check-Sonnencreme"]').trigger('click')

    expect((await chooseMore(page, null)).map((b) => b.text)).not.toContain(t('items.bulkMerge'))

    await page.find('[data-testid="m9-row-check-Sonnenbrille"]').trigger('click')
    expect((await chooseMore(page, null)).map((b) => b.text)).toContain(t('items.bulkMerge'))
  })

  it('merges the selection into the row the sheet names, after asking (FR-24.15)', async () => {
    seedThree()
    const mergeMasterItems = vi.fn().mockReturnValue({
      merged: 1,
      tags: 1,
      positions: 0,
      edgesDropped: 0,
      retired: 0,
      filled: ['weight_grams'],
    })
    Object.assign(orchestratorFake, { mergeMasterItems })
    vi.mocked(confirmDestructive).mockResolvedValueOnce(true)

    const page = mountPage()
    await flushPromises()
    await selectAll(page)
    await chooseMore(page, 'merge')
    page.getComponent(MergeItemsSheet).vm.$emit('pick', 'i1')
    await flushPromises()

    expect(mergeMasterItems).toHaveBeenCalledWith('i1', ['i2', 'i3'])
    // The sentence says what the survivor quietly took over — the part of a
    // merge that is invisible on the list afterwards.
    expect(vi.mocked(presentToast).mock.calls.at(-1)?.[0].message).toContain(
      t('items.mergedTook', { what: t('items.field.weight_grams') }),
    )
  })

  it('writes nothing when the merge confirm is declined (FR-24.15)', async () => {
    seedThree()
    const mergeMasterItems = vi.fn()
    Object.assign(orchestratorFake, { mergeMasterItems })
    vi.mocked(confirmDestructive).mockResolvedValueOnce(false)

    const page = mountPage()
    await flushPromises()
    await selectAll(page)
    await chooseMore(page, 'merge')
    page.getComponent(MergeItemsSheet).vm.$emit('pick', 'i1')
    await flushPromises()

    expect(mergeMasterItems).not.toHaveBeenCalled()
    // The positive signal: the confirm is what was reached and declined.
    expect(vi.mocked(confirmDestructive)).toHaveBeenCalledWith(
      expect.objectContaining({ testid: 'm9-merge-confirm' }),
    )
  })

  it('offers no assignee action where there is nobody to choose between (G-8)', async () => {
    seedThree()

    const page = mountPage()
    await flushPromises()
    await selectAll(page)

    // Local and Single-User Mode answer with an empty directory, and so does
    // an instance of one: a „default" between one person is no decision. The
    // two link actions are there either way — they need no accounts.
    const buttons = (await chooseMore(page, null)).map((b) => b.text)
    expect(buttons).not.toContain(t('items.bulkAssignee'))
    expect(buttons).toContain(t('items.bulkDependsOn'))
    expect(buttons).toContain(t('items.bulkCompanion'))
  })

  it('names who the selection is usually assigned to, skipping the items already naming them', async () => {
    seedThree()
    withAccounts()
    // i2 already names Sia, so the batch must leave its row alone (FR-1.9).
    useMasterStore().applyChange({
      seq: 0,
      table: TABLE.items,
      id: 'i2',
      deleted: false,
      row: { name: 'Sonnenbrille', unit: 'pcs', default_assignee_id: 'u-sia' },
    })

    const page = mountPage()
    await flushPromises()
    await selectAll(page)

    // The other half of G-8: with accounts on the instance, it is offered.
    expect((await chooseMore(page, 'assignee')).map((b) => b.text)).toContain(
      t('items.bulkAssignee'),
    )

    page.findComponent(BulkAssigneeSheet).vm.$emit('pick', { userId: 'u-sia' })
    await flushPromises()

    expect(writes.assignees).toEqual([
      { itemId: 'i1', assigneeId: 'u-sia' },
      { itemId: 'i3', assigneeId: 'u-sia' },
    ])
    expect(vi.mocked(presentToast).mock.calls.at(-1)![0].message).toBe(
      t('items.bulkAssigned', { n: 2, name: 'Sia' }),
    )
    expect(page.find('[data-testid="m9-selbar"]').exists()).toBe(false)
  })

  it('puts each item’s own previous assignee back, not one value for the batch', async () => {
    seedThree()
    withAccounts()
    useMasterStore().applyChange({
      seq: 0,
      table: TABLE.items,
      id: 'i2',
      deleted: false,
      row: { name: 'Sonnenbrille', unit: 'pcs', default_assignee_id: 'u-max' },
    })

    const page = mountPage()
    await flushPromises()
    await selectAll(page)
    await chooseMore(page, 'assignee')
    page.findComponent(BulkAssigneeSheet).vm.$emit('pick', { userId: 'u-sia' })
    await flushPromises()

    const toast = vi.mocked(presentToast).mock.calls.at(-1)![0]
    await (toast.buttons![0] as { handler: () => void }).handler()
    await flushPromises()

    // Three writes forward, three back — and i2 goes back to Max rather than
    // to the nobody the other two came from.
    expect(writes.assignees.slice(0, 3).every((w) => w.assigneeId === 'u-sia')).toBe(true)
    expect(writes.assignees.slice(3)).toEqual([
      { itemId: 'i2', assigneeId: 'u-max' },
      { itemId: 'i1', assigneeId: null },
      { itemId: 'i3', assigneeId: null },
    ])
  })

  it('links the selection to the picked item, in the direction the sheet was opened for', async () => {
    seedThree()

    const page = mountPage()
    await flushPromises()
    await selectAll(page)
    await chooseMore(page, 'main')

    page.findComponent(BulkDependencySheet).vm.$emit('pick', { itemId: 'i1', mode: 'suggested' })
    await flushPromises()

    // „Die Auswahl hängt ab von i1": the selected rows are the dependents,
    // and i1 — which is in the selection — is skipped as its own edge.
    expect(writes.links).toEqual([
      { id: expect.any(String), itemId: 'i2', dependsOn: 'i1', mode: 'suggested' },
      { id: expect.any(String), itemId: 'i3', dependsOn: 'i1', mode: 'suggested' },
    ])
  })

  it('turns the edges round for a companion, and reports what it skipped', async () => {
    seedThree()

    const page = mountPage()
    await flushPromises()
    await selectAll(page)
    await chooseMore(page, 'companion')

    page.findComponent(BulkDependencySheet).vm.$emit('pick', { itemId: 'i1', mode: 'required' })
    await flushPromises()

    // „i1 kommt mit": i1 is the dependent of each selected row instead.
    expect(writes.links.map((l) => [l.itemId, l.dependsOn])).toEqual([
      ['i1', 'i2'],
      ['i1', 'i3'],
    ])
    // The batch wrote two of three and says so rather than refusing whole.
    expect(vi.mocked(presentToast).mock.calls.at(-1)![0].message).toBe(
      `${t('items.bulkLinked', { n: 2, name: 'Sonnencreme' })}. ${t('items.bulkLinkedSkipped', { n: 1 })}`,
    )
  })

  it('removes exactly the rows a link created when the batch is undone', async () => {
    seedThree()

    const page = mountPage()
    await flushPromises()
    await selectAll(page)
    await chooseMore(page, 'main')
    page.findComponent(BulkDependencySheet).vm.$emit('pick', { itemId: 'i1', mode: 'required' })
    await flushPromises()

    const created = writes.links.map((l) => l.id)
    const toast = vi.mocked(presentToast).mock.calls.at(-1)![0]
    await (toast.buttons![0] as { handler: () => void }).handler()
    await flushPromises()

    expect(writes.linksRemoved).toEqual(created)
  })

  it('offers no undo for a link that wrote nothing, and says why', async () => {
    seedThree()

    const page = mountPage()
    await flushPromises()
    await enterSelection()
    // Only the picked item itself: every edge of the batch is a self edge.
    await page.find('[data-testid="m9-row-check-Sonnencreme"]').trigger('click')
    await chooseMore(page, 'main')
    page.findComponent(BulkDependencySheet).vm.$emit('pick', { itemId: 'i1', mode: 'required' })
    await flushPromises()

    expect(writes.links).toEqual([])
    const toast = vi.mocked(presentToast).mock.calls.at(-1)![0]
    expect(toast.message).toBe(t('items.bulkLinkedNothing'))
    expect(toast.buttons).toBeUndefined()
    // Still armed: nothing happened, so the selection is still the user's.
    expect(page.find('[data-testid="m9-selbar"]').exists()).toBe(true)
  })

  it('writes nothing when the confirm is declined', async () => {
    seedThree()
    vi.mocked(confirmDestructive).mockResolvedValueOnce(false)

    const page = mountPage()
    await flushPromises()
    await enterSelection()
    await page.find('[data-testid="m9-select-all"]').trigger('click')
    await page.find('[data-testid="m9-bulk-retire"]').trigger('click')
    await flushPromises()

    expect(writes.deleted).toEqual([])
    // Still armed with the selection intact, so the user can act again.
    expect(page.find('[data-testid="m9-select-count"]').text()).toContain('3')
  })
})

describe('M9 — who an item is usually for, on the row (FR-1.9 over FR-24.4)', () => {
  const DIRECTORY = [
    { user_id: 'u-sia', display_name: 'Sia' },
    { user_id: 'u-max', display_name: 'Max' },
  ]

  beforeEach(() => {
    inventoryProperties().reset()
    Object.assign(orchestratorFake, identityStub())
  })

  function seedAssigned(name: string, id: string, userId: string | null) {
    useMasterStore().applyChange({
      seq: 0,
      table: TABLE.items,
      id,
      deleted: false,
      row: { name, unit: 'pcs', default_assignee_id: userId },
    })
  }

  it('names the account on the row once the device asks for it', async () => {
    Object.assign(orchestratorFake, { fetchUsers: async () => DIRECTORY })
    seedAssigned('Zelt', 'i1', 'u-sia')
    seedAssigned('Hammer', 'i2', null)

    const page = mountPage()
    await flushPromises()
    // Lean by default: the account is not on the row until it is switched on.
    expect(page.find('[data-testid="m9-row-assignee"]').exists()).toBe(false)

    inventoryProperties().toggle('assignee')
    await flushPromises()

    const named = page.findAll('[data-testid="m9-row-assignee"]')
    expect(named).toHaveLength(1)
    expect(named[0]!.text()).toContain('Sia')
  })

  it('finds an item by the account it names (FR-24.7’s fourth field)', async () => {
    Object.assign(orchestratorFake, { fetchUsers: async () => DIRECTORY })
    seedAssigned('Zelt', 'i1', 'u-sia')
    seedAssigned('Hammer', 'i2', null)

    const page = mountPage()
    await flushPromises()
    await typeSearch(page, 'sia')

    expect(page.findAll('[data-testid="m9-row"]')).toHaveLength(1)
    expect(page.text()).toContain(t('items.match.assignee'))
  })
})

describe('M9 — the tag manager’s half of the contract (FR-24.10)', () => {
  // Named spies rather than reads back off `orchestratorFake`: it is typed
  // as the master-data stub, and `Object.assign` does not widen that type.
  const renameTag = vi.fn()
  const deleteTag = vi.fn()
  const mergeTags = vi.fn()
  const reorderTags = vi.fn()

  beforeEach(() => {
    renameTag.mockReturnValue({ ok: true })
    deleteTag.mockReturnValue({ ok: true })
    mergeTags.mockReturnValue(0)
    Object.assign(orchestratorFake, { renameTag, deleteTag, mergeTags, reorderTags })
  })

  it('offers "Tags verwalten" only once there is a tag to manage', async () => {
    seedItem('Sonnencreme')
    mountPage()
    await flushPromises()

    const build = vi.mocked(setHeaderActions).mock.calls.at(-1)![0] as () => HeaderAction[]
    expect(build().map((a) => a.id)).not.toContain('m9-manage-tags')

    seedTag('Hygiene', 't-hyg')
    await flushPromises()

    const action = build().find((a) => a.id === 'm9-manage-tags')
    expect(action?.label).toBe(t('items.manageTags'))
  })

  it('counts assignments the way a refused delete counts them, retired items included', async () => {
    seedItem('Sonnencreme', 'i1')
    seedItem('Zahnbürste', 'i2')
    seedTag('Hygiene', 't-hyg')
    assignTag('i1', 't-hyg')
    assignTag('i2', 't-hyg')
    useMasterStore().applyChange({
      seq: 0,
      table: TABLE.items,
      id: 'i2',
      deleted: false,
      row: { name: 'Zahnbürste', unit: 'pcs', retired_at: '2026-09-01T00:00:00.000Z' },
    })

    const page = mountPage()
    await flushPromises()

    // The chips count what is on screen and would say 1 here. This number has
    // to agree with the refusal instead — a manager saying „1" beside a tag
    // whose delete is then refused over 2 is the screen contradicting itself.
    const counts = page.getComponent(TagManagerSheet).props('counts') as Map<string, number>
    expect(counts.get('t-hyg')).toBe(2)
  })

  it('opens the mark picker for the tag the manager named, and writes the pick (FR-24.13)', async () => {
    seedItem('Sonnencreme', 'i1')
    seedTag('Hygiene', 't-hyg')
    const setTagMark = vi.fn()
    Object.assign(orchestratorFake, { setTagMark })

    const page = mountPage()
    await flushPromises()
    const picker = () => page.getComponent(MarkPicker)
    expect(picker().props('isOpen')).toBe(false)

    page.getComponent(TagManagerSheet).vm.$emit('mark', { id: 't-hyg', name: 'Hygiene' })
    await flushPromises()
    // The suggestion band is derived from the tag's own name.
    expect(picker().props('isOpen')).toBe(true)
    expect(picker().props('name')).toBe('Hygiene')

    picker().vm.$emit('pick', '🧼')
    picker().vm.$emit('close')
    await flushPromises()
    expect(setTagMark).toHaveBeenCalledWith('t-hyg', '🧼')
    expect(picker().props('isOpen')).toBe(false)
  })

  it('lends an unmarked item its primary tag’s mark, and marks the tag’s heading (FR-24.13)', async () => {
    seedItem('Seife', 'i1')
    useMasterStore().applyChange({
      seq: 0,
      table: TABLE.tags,
      id: 't-bad',
      deleted: false,
      row: { name: 'Bad', sort_order: 0, icon: '🧼' },
    })
    assignTag('i1', 't-bad')

    const page = mountPage()
    await flushPromises()

    const row = page.findAllComponents(ItemMark).find((m) => m.props('surface') === 'inventory')!
    expect(row.props('tagMark')).toBe('🧼')
    expect(row.props('mark')).toBeNull()
    expect(page.get('[data-testid="m9-group-head"]').findComponent(ItemMark).props('mark')).toBe(
      '🧼',
    )
  })

  it('hands a move straight to the orchestrator, by axis index', async () => {
    seedItem('Sonnencreme')
    seedTag('A', 't-a', 0)
    seedTag('B', 't-b', 1)

    const page = mountPage()
    await flushPromises()
    page.getComponent(TagManagerSheet).vm.$emit('move', 1, 0)
    await flushPromises()

    expect(reorderTags).toHaveBeenCalledWith(1, 0)
  })

  it('refuses a delete while items carry the tag, and offers the merge instead (ADR-063)', async () => {
    seedItem('Sonnencreme', 'i1')
    seedTag('Hygiene', 't-hyg')
    assignTag('i1', 't-hyg')

    const page = mountPage()
    await flushPromises()
    page.getComponent(TagManagerSheet).vm.$emit('remove', { id: 't-hyg', name: 'Hygiene' })
    await flushPromises()

    expect(deleteTag).not.toHaveBeenCalled()
    expect(vi.mocked(confirmDestructive)).not.toHaveBeenCalled()
    // The positive signal the absences are read against: the refusal is the
    // one thing that *did* happen, and it names the count.
    expect(vi.mocked(confirmAction)).toHaveBeenCalledWith(
      expect.objectContaining({ message: t('items.tagInUseBody', { n: 1 }) }),
    )
  })

  it('deletes a tag nothing carries, after asking', async () => {
    seedItem('Sonnencreme')
    seedTag('Leer', 't-leer')

    const page = mountPage()
    await flushPromises()
    page.getComponent(TagManagerSheet).vm.$emit('remove', { id: 't-leer', name: 'Leer' })
    await flushPromises()

    expect(vi.mocked(confirmDestructive)).toHaveBeenCalled()
    expect(deleteTag).toHaveBeenCalledWith('t-leer')
    expect(vi.mocked(presentToast)).toHaveBeenCalledWith({
      message: t('items.tagDeleted', { tag: 'Leer' }),
    })
  })

  it('says so rather than opening an empty picker when there is nothing to merge into', async () => {
    seedItem('Sonnencreme')
    seedTag('Hygiene', 't-hyg')

    const page = mountPage()
    await flushPromises()
    page.getComponent(TagManagerSheet).vm.$emit('merge', { id: 't-hyg', name: 'Hygiene' })
    await flushPromises()

    expect(mergeTags).not.toHaveBeenCalled()
    expect(vi.mocked(presentToast)).toHaveBeenCalledWith({
      message: t('items.tagMergeNoTarget', { tag: 'Hygiene' }),
    })
  })

  it('merges a selection of tags into the one the picker names (FR-24.14)', async () => {
    seedItem('Sonnencreme', 'i1')
    seedTag('Hygiene', 't-hyg')
    seedTag('hygiene', 't-hyg2', 1)
    seedTag('Technik', 't-tec', 2)
    assignTag('i1', 't-hyg')
    const mergeTagsMany = vi.fn().mockReturnValue(1)
    Object.assign(orchestratorFake, { mergeTagsMany })

    // The picker offers the *picked* tags and nothing else: the selection is
    // the claim that these are one tag, so the survivor comes from inside it.
    const buttons: { text: string; data?: string }[] = []
    const create = vi
      .spyOn(actionSheetController, 'create')
      .mockImplementation(async (opts: { buttons?: unknown[] } = {}) => {
        buttons.push(...((opts.buttons ?? []) as typeof buttons))
        return { present: async () => {}, onDidDismiss: async () => ({ data: 't-hyg' }) } as never
      })
    vi.mocked(confirmDestructive).mockResolvedValueOnce(true)

    const page = mountPage()
    await flushPromises()
    page.getComponent(TagManagerSheet).vm.$emit('mergeMany', [
      { id: 't-hyg', name: 'Hygiene' },
      { id: 't-hyg2', name: 'hygiene' },
    ])
    await flushPromises()
    create.mockRestore()

    expect(buttons.map((b) => b.data).filter(Boolean)).toEqual(['t-hyg', 't-hyg2'])
    // Largest first: „Hygiene" carries the one assignment, „hygiene" none.
    expect(buttons[0]!.text).toBe(t('items.tagsMergeManyCount', { name: 'Hygiene', n: 1 }))
    expect(mergeTagsMany).toHaveBeenCalledWith(['t-hyg2'], 't-hyg')
    expect(vi.mocked(presentToast)).toHaveBeenCalledWith({
      message: t('items.tagMerged', { n: 1, tag: 'Hygiene' }),
    })
  })

  it('writes nothing when the merge confirm is declined (FR-24.14)', async () => {
    seedItem('Sonnencreme', 'i1')
    seedTag('Hygiene', 't-hyg')
    seedTag('hygiene', 't-hyg2', 1)
    const mergeTagsMany = vi.fn()
    Object.assign(orchestratorFake, { mergeTagsMany })

    const create = vi
      .spyOn(actionSheetController, 'create')
      .mockImplementation(
        async () =>
          ({ present: async () => {}, onDidDismiss: async () => ({ data: 't-hyg' }) }) as never,
      )
    vi.mocked(confirmDestructive).mockResolvedValueOnce(false)

    const page = mountPage()
    await flushPromises()
    page.getComponent(TagManagerSheet).vm.$emit('mergeMany', [
      { id: 't-hyg', name: 'Hygiene' },
      { id: 't-hyg2', name: 'hygiene' },
    ])
    await flushPromises()
    create.mockRestore()

    expect(mergeTagsMany).not.toHaveBeenCalled()
    // The positive signal: the confirm is what was reached and declined.
    expect(vi.mocked(confirmDestructive)).toHaveBeenCalledWith(
      expect.objectContaining({
        message: t('items.tagsMergeManyConfirmBody', { n: 0, m: 1, target: 'Hygiene' }),
      }),
    )
  })

  it('renames through the prompt, and keeps the alert open on a name already taken', async () => {
    seedItem('Sonnencreme')
    seedTag('Hygiene', 't-hyg')
    seedTag('Technik', 't-tec', 1)
    renameTag.mockReturnValue({ ok: false, collision: 'Technik' })

    const page = mountPage()
    await flushPromises()
    page.getComponent(TagManagerSheet).vm.$emit('rename', { id: 't-hyg', name: 'Hygiene' })
    await flushPromises()

    const options = vi.mocked(promptText).mock.calls.at(-1)![0]
    expect(options.value).toBe('Hygiene')
    // `false` is what keeps the typed text in the field instead of throwing
    // the edit away — the idiom the other two prompts use.
    await expect(options.onConfirm('Technik')).resolves.toBe(false)
    expect(vi.mocked(presentToast)).toHaveBeenCalledWith({
      message: t('items.tagNameTaken', { name: 'Technik' }),
    })
  })
})

describe('M9 — the items it is not showing (FR-24.3, ADR-032)', () => {
  /** A retired item: hidden from the list by design, and counted by the note. */
  function seedRetired(name: string, id: string) {
    useMasterStore().applyChange({
      seq: 0,
      table: TABLE.items,
      id,
      deleted: false,
      row: { name, unit: 'pcs', retired_at: '2026-09-01T00:00:00.000Z' },
    })
  }

  it('says how many items are hidden, and the note is a way to them', async () => {
    seedItem('Sonnencreme')
    seedRetired('Alte Jacke', 'r1')
    seedRetired('Kaputtes Zelt', 'r2')

    const page = mountPage()
    await flushPromises()

    // The list itself is unchanged — retired rows stay out of it (ADR-032).
    expect(page.findAll('[data-testid="m9-row"]')).toHaveLength(1)
    const note = page.get('[data-testid="m9-retired-note"]')
    expect(note.text()).toBe(t('items.retiredHint', { n: 2 }))
  })

  it('stays silent when nothing is hidden', async () => {
    seedItem('Sonnencreme')

    const page = mountPage()
    await flushPromises()

    // The positive signal the absence is read against: the row is there, so
    // the screen has rendered and simply has nothing to report.
    expect(page.findAll('[data-testid="m9-row"]')).toHaveLength(1)
    expect(page.find('[data-testid="m9-retired-note"]').exists()).toBe(false)
  })

  it('claims nothing before the master partition has arrived (ADR-033)', async () => {
    seedItem('Sonnencreme')
    seedRetired('Alte Jacke', 'r1')
    master.masterLoaded.value = false

    const page = mountPage()
    await flushPromises()

    // A partition that has not arrived carries no retired rows either, so a
    // count read from it is a guess — and „nothing is hidden" is a claim.
    expect(page.find('[data-testid="m9-retired-note"]').exists()).toBe(false)

    master.masterLoaded.value = true
    await flushPromises()
    expect(page.find('[data-testid="m9-retired-note"]').exists()).toBe(true)
  })
})

describe('M9 — the way into the cleanup (FR-24.12)', () => {
  function headerActions(): HeaderAction[] {
    const build = vi.mocked(setHeaderActions).mock.calls.at(-1)![0] as () => HeaderAction[]
    return build()
  }

  it('counts the findings at the foot of the list, and the sentence is the way in', async () => {
    seedItem('Kartenspiel', 'i1')
    seedItem('Schnorchel', 'i2')

    const page = mountPage()
    await flushPromises()

    // Two untagged items, and nothing else for a rule to find.
    const note = page.get('[data-testid="m9-cleanup-note"]')
    expect(note.text()).toBe(t('items.cleanupHint', { n: 2 }))
    await note.trigger('click')
    expect(routerPush).toHaveBeenCalledWith(PATH.inventoryCleanup)
  })

  it('stays silent when no rule finds anything', async () => {
    seedItem('Sonnencreme', 'i1')
    seedTag('Bad', 't-bad')
    seedItem('Seife', 'i2')
    assignTag('i1', 't-bad')
    assignTag('i2', 't-bad')

    const page = mountPage()
    await flushPromises()

    expect(page.findAll('[data-testid="m9-row"]')).toHaveLength(2)
    expect(page.find('[data-testid="m9-cleanup-note"]').exists()).toBe(false)
  })

  it('offers the screen as a word behind the ⋮, whatever the count', async () => {
    seedItem('Sonnencreme', 'i1')

    mountPage()
    await flushPromises()

    const action = headerActions().find((a) => a.id === 'm9-cleanup')!
    expect(action.label).toBe(t('items.cleanup'))
    expect(action.overflow).toBe(true)
    action.onClick()
    expect(routerPush).toHaveBeenCalledWith(PATH.inventoryCleanup)
  })

  it('claims no finding before the master partition has arrived (ADR-033)', async () => {
    seedItem('Kartenspiel', 'i1')
    master.masterLoaded.value = false

    const page = mountPage()
    await flushPromises()
    expect(page.find('[data-testid="m9-cleanup-note"]').exists()).toBe(false)

    master.masterLoaded.value = true
    await flushPromises()
    expect(page.find('[data-testid="m9-cleanup-note"]').exists()).toBe(true)
  })
})

describe('M9 — what the search did not find, it offers to create (FR-24.11)', () => {
  interface Writes {
    created: { id: string; name: string }[]
    assigned: { itemId: string; tagId: string }[]
    restored: string[]
  }
  let writes: Writes

  function seedRetired(name: string, id: string) {
    useMasterStore().applyChange({
      seq: 0,
      table: TABLE.items,
      id,
      deleted: false,
      row: { name, unit: 'pcs', retired_at: '2026-09-01T00:00:00.000Z' },
    })
  }

  function seedCamping() {
    seedTag('Camping', 't-camp', 0)
    seedTag('Hygiene', 't-hyg', 1)
    seedItem('Zeltheringe', 'i-hering')
    seedItem('Zeltunterlage', 'i-unterlage')
    seedItem('Zahnbürste', 'i-zb')
    assignTag('i-hering', 't-camp')
    assignTag('i-unterlage', 't-camp')
    assignTag('i-zb', 't-hyg')
  }

  beforeEach(() => {
    writes = { created: [], assigned: [], restored: [] }
    Object.assign(orchestratorFake, {
      createMasterItem: (name: string) => {
        const id = `new-${writes.created.length}`
        writes.created.push({ id, name })
        seedItem(name, id)
        return id
      },
      assignTag: (itemId: string, tagId: string) => {
        writes.assigned.push({ itemId, tagId })
        assignTag(itemId, tagId, 0)
        return `${itemId}-${tagId}`
      },
      createTag: (name: string) => {
        seedTag(name, `t-${name}`)
        return `t-${name}`
      },
      restoreMasterItem: (itemId: string) => {
        writes.restored.push(itemId)
        return true
      },
    })
  })

  it('offers the missing name above partial hits — „Zelt" finds two rows and no tent', async () => {
    seedCamping()
    const page = mountPage()
    await typeSearch(page, 'Zelt')

    expect(page.findAll('[data-testid="m9-row"]')).toHaveLength(2)
    expect(page.get('[data-testid="m9-offer-title"]').text()).toBe(
      t('items.offerCreate', { name: 'Zelt' }),
    )
  })

  it('offers nothing once the name is on screen — the hit row is the positive signal', async () => {
    seedCamping()
    const page = mountPage()
    await typeSearch(page, 'zeltheringe')

    expect(page.findAll('[data-testid="m9-row"]')).toHaveLength(1)
    expect(page.find('[data-testid="m9-offer"]').exists()).toBe(false)
  })

  it('offers it in the dead end too, beside the sentence that names the dead end', async () => {
    seedCamping()
    const page = mountPage()
    await typeSearch(page, 'Stirnlampe')

    expect(page.find('[data-testid="m9-no-match"]').exists()).toBe(true)
    expect(page.find('[data-testid="m9-offer"]').exists()).toBe(true)
  })

  it('claims nothing is missing before the master partition has arrived (ADR-033)', async () => {
    seedCamping()
    master.masterLoaded.value = false
    const page = mountPage()
    await typeSearch(page, 'Zelt')

    expect(page.findAll('[data-testid="m9-row"]')).toHaveLength(2)
    expect(page.find('[data-testid="m9-offer"]').exists()).toBe(false)

    master.masterLoaded.value = true
    await flushPromises()
    expect(page.find('[data-testid="m9-offer"]').exists()).toBe(true)
  })

  it('offers nothing in the selection mode, where rows do not navigate', async () => {
    seedCamping()
    const page = mountPage()
    await typeSearch(page, 'Zelt')
    expect(page.find('[data-testid="m9-offer"]').exists()).toBe(true)

    const build = vi.mocked(setHeaderActions).mock.calls.at(-1)![0] as () => HeaderAction[]
    build()
      .find((action) => action.id === 'm9-select')!
      .onClick()
    await flushPromises()

    expect(page.find('[data-testid="m9-selbar"]').exists()).toBe(true)
    expect(page.find('[data-testid="m9-offer"]').exists()).toBe(false)
  })

  it('opens the sheet with the query as the name, the filter tag assigned and the hits’ tags first', async () => {
    seedCamping()
    const page = mountPage()
    page.findComponent(TagFilterSheet).vm.$emit('update:selection', ['t-camp'])
    await typeSearch(page, 'Zelt')

    await page.get('[data-testid="m9-offer"]').trigger('click')
    await flushPromises()

    const sheet = page.findComponent(CreateItemSheet)
    expect(sheet.props('isOpen')).toBe(true)
    expect(sheet.props('name')).toBe('Zelt')
    expect(sheet.props('tagIds')).toEqual(['t-camp'])
    expect(sheet.props('preferredTagIds')).toEqual(['t-camp'])
  })

  it('never assigns the untagged bucket — it is not a tag', async () => {
    seedCamping()
    const page = mountPage()
    page.findComponent(TagFilterSheet).vm.$emit('update:selection', [UNTAGGED_KEY])
    await typeSearch(page, 'Stirnlampe')
    await page.get('[data-testid="m9-offer"]').trigger('click')
    await flushPromises()

    expect(page.findComponent(CreateItemSheet).props('tagIds')).toEqual([])
  })

  it('opens the sheet on Enter and writes nothing — a typo must not become an item', async () => {
    seedCamping()
    const page = mountPage()
    await typeSearch(page, 'Stirnlampe')

    await page.get('[data-testid="items-search-input"]').trigger('keydown', { key: 'Enter' })
    await flushPromises()

    expect(page.findComponent(CreateItemSheet).props('isOpen')).toBe(true)
    expect(writes.created).toEqual([])
  })

  it('stays on the list after creating: the offer goes, the new row is marked, the toast opens it', async () => {
    seedCamping()
    const page = mountPage()
    await typeSearch(page, 'Stirnlampe')
    await page.get('[data-testid="m9-offer"]').trigger('click')
    await flushPromises()

    // What the sheet reports once its own write has landed.
    seedItem('Stirnlampe', 'new-0')
    page.findComponent(CreateItemSheet).vm.$emit('created', {
      id: 'new-0',
      name: 'Stirnlampe',
      open: false,
    })
    await flushPromises()

    expect(page.findComponent(CreateItemSheet).props('isOpen')).toBe(false)
    expect(page.find('[data-testid="m9-offer"]').exists()).toBe(false)
    expect(page.findAll('[data-testid="m9-row"]')).toHaveLength(1)
    expect(page.find('[data-testid="m9-row-new"]').exists()).toBe(true)
    expect(presentToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: t('items.created', { name: 'Stirnlampe' }) }),
    )

    // A new query ends the mark: it confirmed one write, not a state.
    await typeSearch(page, 'Stirnlamp')
    expect(page.findAll('[data-testid="m9-row"]')).toHaveLength(1)
    expect(page.find('[data-testid="m9-row-new"]').exists()).toBe(false)
  })

  it('offers a retired item back instead of creating a second one, and restores it', async () => {
    seedCamping()
    seedRetired('Regenponcho', 'r-poncho')
    const page = mountPage()
    await typeSearch(page, 'regenponcho')

    expect(page.get('[data-testid="m9-offer-title"]').text()).toBe(
      t('items.offerRestore', { name: 'Regenponcho' }),
    )
    await page.get('[data-testid="m9-offer"]').trigger('click')
    await flushPromises()

    expect(writes.restored).toEqual(['r-poncho'])
    expect(writes.created).toEqual([])
    expect(page.findComponent(CreateItemSheet).props('isOpen')).toBe(false)
  })
})
