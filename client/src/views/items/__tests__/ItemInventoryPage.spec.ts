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
import { flushPromises, mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

import ItemInventoryPage from '../ItemInventoryPage.vue'
import { setHeaderTitle } from '@/composables/useHeaderTitle'
import { useMasterStore } from '@/stores/masterStore'
import { TABLE } from '@/types/tables'
import { t } from '@/i18n'

import { masterDataStub } from '@/composables/__tests__/masterDataStub'
import { ORCHESTRATOR } from '@/composables/useOrchestrator'

vi.mock('@/composables/useHeaderTitle', () => ({ setHeaderTitle: vi.fn() }))
vi.mock('@/composables/useHeaderActions', () => ({ setHeaderActions: vi.fn() }))
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useRoute: () => ({ query: {}, params: {} }),
}))

const master = masterDataStub()
const orchestratorFake = { ...master }

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
    const mark = page.findComponent({ name: 'ItemMark' })
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
    // the exact shape measured on the family instance.
    await page.findComponent({ name: 'IonSegment' }).vm.$emit('ionChange', {
      detail: { value: 't-hyg' },
    })
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
