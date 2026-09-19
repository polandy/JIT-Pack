// @vitest-environment jsdom
/**
 * M24 — Aufräumen (FR-24.12). What the screen lists and which existing act
 * each repair reaches. The rules themselves are `inventoryHygiene.spec.ts`;
 * here the question is the wiring: the right orchestrator call, and an undo
 * that takes exactly that call back.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { setActivePinia, createPinia, type Pinia } from 'pinia'

import InventoryCleanupPage from '../InventoryCleanupPage.vue'
import BulkTagSheet from '@/components/items/BulkTagSheet.vue'
import { cleanupSettings } from '@/composables/useCleanupSettings'
import { setHeaderTitle } from '@/composables/useHeaderTitle'
import { ORCHESTRATOR } from '@/composables/useOrchestrator'
import { masterDataStub } from '@/composables/__tests__/masterDataStub'
import { HYGIENE_RULE_UNTAGGED } from '@/domain/inventoryHygiene'
import { t } from '@/i18n'
import { promptTagMerge } from '@/lib/tagMergePrompt'
import { presentToast } from '@/lib/toast'
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'
import { TABLE } from '@/types/tables'

vi.mock('@/composables/useHeaderTitle', () => ({ setHeaderTitle: vi.fn() }))
vi.mock('@/composables/useHeaderActions', () => ({ setHeaderActions: vi.fn() }))
vi.mock('@/lib/toast', () => ({ presentToast: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/tagMergePrompt', () => ({ promptTagMerge: vi.fn().mockResolvedValue(1) }))

const master = masterDataStub()
const loaded = new Set<string>()
const orchestratorFake = {
  ...master,
  today: () => '2026-09-19',
  tripDataLoaded: (id: string) => loaded.has(id),
  assignTag: vi.fn((itemId: string, tagId: string) => `a-${itemId}-${tagId}`),
  unassignTag: vi.fn(),
  createTag: vi.fn(() => 't-new'),
  deleteTag: vi.fn(),
  deleteMasterItem: vi.fn(),
  restoreMasterItem: vi.fn(),
  mergeTags: vi.fn(),
}

function change(table: string, id: string, row: Record<string, unknown>) {
  return { seq: 0, table, id, deleted: false, row }
}

function seedItem(id: string, name: string) {
  useMasterStore().applyChange(change(TABLE.items, id, { name, unit: 'pcs' }))
}

function seedTag(id: string, name: string, sortOrder = 0) {
  useMasterStore().applyChange(change(TABLE.tags, id, { name, sort_order: sortOrder }))
}

function assign(itemId: string, tagId: string) {
  useMasterStore().applyChange(
    change(TABLE.itemTags, `${itemId}-${tagId}`, { item_id: itemId, tag_id: tagId, position: 0 }),
  )
}

/** A trip that ended long ago, carrying one row made from `itemId`. */
function seedOldTrip(tripId: string, itemId: string) {
  const trips = useTripStore()
  trips.applyChange(
    change(TABLE.trips, tripId, {
      name: 'Alt',
      status: 'done',
      year: 2024,
      start_date: '2024-08-01',
      end_date: '2024-08-10',
    }),
  )
  trips.applyChange(
    change(TABLE.tripItems, `ti-${tripId}-${itemId}`, {
      trip_id: tripId,
      name: 'row',
      quantity: 1,
      source_item_id: itemId,
    }),
  )
}

function mountPage() {
  return mount(InventoryCleanupPage, {
    global: { plugins: [pinia], provide: { [ORCHESTRATOR]: orchestratorFake } },
  })
}

/*
 * Every page is unmounted after its test. The rule settings are one shared
 * ref, so the next test's reset re-renders a page left mounted — and a child
 * it mounts then re-activates *that* test's pinia, under which the next
 * test's rows are seeded and never seen.
 */
enableAutoUnmount(afterEach)

/** The last snackbar's Rückgängig, pressed. */
async function pressUndo() {
  const toast = vi.mocked(presentToast).mock.calls.at(-1)![0]
  await (toast.buttons![0] as { handler: () => void }).handler()
}

let pinia: Pinia
beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
  vi.clearAllMocks()
  localStorage.clear()
  cleanupSettings().reset()
  master.masterLoaded.value = true
  loaded.clear()
})

describe('M24 — Ohne Tag (FR-24.12)', () => {
  beforeEach(() => {
    seedTag('t-bad', 'Bad')
    seedItem('zb', 'Zahnbürste')
    assign('zb', 't-bad')
    seedItem('zs', 'Zahnseide')
    seedItem('ks', 'Kartenspiel')
  })

  it('lists each untagged item with its reasoned suggestion, or says there is none', async () => {
    const page = mountPage()
    await flushPromises()

    const seide = page.get('[data-testid="m24-untagged-Zahnseide"]')
    expect(seide.get('[data-testid="m24-suggest-Zahnseide"]').text()).toContain('Bad')
    expect(seide.text()).toContain(t('cleanup.suggestName', { name: 'Zahnbürste' }))
    const karten = page.get('[data-testid="m24-untagged-Kartenspiel"]')
    expect(karten.find('[data-testid="m24-suggest-Kartenspiel"]').exists()).toBe(false)
    expect(karten.text()).toContain(t('cleanup.noSuggestion'))
  })

  it('gives the suggested tag, and the undo takes exactly that assignment back', async () => {
    const page = mountPage()
    await flushPromises()

    await page.get('[data-testid="m24-suggest-Zahnseide"]').trigger('click')
    expect(orchestratorFake.assignTag).toHaveBeenCalledWith('zs', 't-bad')
    await pressUndo()
    expect(orchestratorFake.unassignTag).toHaveBeenCalledWith('a-zs-t-bad')
  })

  it('opens FR-24.9’s sheet without the refiling switch, and creates a missing tag', async () => {
    const page = mountPage()
    await flushPromises()

    await page.get('[data-testid="m24-pick-Kartenspiel"]').trigger('click')
    const sheet = page.getComponent(BulkTagSheet)
    expect(sheet.props('isOpen')).toBe(true)
    expect(sheet.props('refile')).toBe(false)

    sheet.vm.$emit('create', { name: 'Spiele', primary: false })
    await flushPromises()
    expect(orchestratorFake.createTag).toHaveBeenCalledWith('Spiele')
    expect(orchestratorFake.assignTag).toHaveBeenCalledWith('ks', 't-new')
    expect(page.getComponent(BulkTagSheet).props('isOpen')).toBe(false)

    // The tag made for this one item leaves with the undo.
    await pressUndo()
    expect(orchestratorFake.unassignTag).toHaveBeenCalledWith('a-ks-t-new')
    expect(orchestratorFake.deleteTag).toHaveBeenCalledWith('t-new')
  })

  it('offers to take every suggestion at once only when there are several', async () => {
    const page = mountPage()
    await flushPromises()
    // One suggestion (Zahnseide) — a „take all" of one is the row's own button.
    expect(page.find('[data-testid="m24-take-all"]').exists()).toBe(false)

    seedItem('zp', 'Zahnpasta')
    await flushPromises()
    await page.get('[data-testid="m24-take-all"]').trigger('click')
    expect(orchestratorFake.assignTag).toHaveBeenCalledTimes(2)
  })
})

describe('M24 — Lange nicht gebraucht (FR-24.12)', () => {
  beforeEach(() => {
    seedTag('t-camp', 'Camping')
    seedItem('gas', 'Gaskocher')
    assign('gas', 't-camp')
    seedItem('zelt', 'Zelt')
    assign('zelt', 't-camp')
    seedOldTrip('trip-old', 'gas')
    loaded.add('trip-old')
  })

  it('retires through FR-24.3, and the undo is M23’s restore', async () => {
    const page = mountPage()
    await flushPromises()

    expect(page.find('[data-testid="m24-unused-Zelt"]').exists()).toBe(false)
    await page.get('[data-testid="m24-retire-Gaskocher"]').trigger('click')
    expect(orchestratorFake.deleteMasterItem).toHaveBeenCalledWith('gas')
    await pressUndo()
    expect(orchestratorFake.restoreMasterItem).toHaveBeenCalledWith('gas')
  })

  it('keeps an item on this device so the rule stops asking, until undone', async () => {
    const page = mountPage()
    await flushPromises()

    await page.get('[data-testid="m24-keep-Gaskocher"]').trigger('click')
    await flushPromises()
    expect(page.find('[data-testid="m24-unused-Gaskocher"]').exists()).toBe(false)
    expect(cleanupSettings().settings.value.keptItems).toEqual(['gas'])

    await pressUndo()
    await flushPromises()
    expect(page.find('[data-testid="m24-unused-Gaskocher"]').exists()).toBe(true)
  })

  it('admits the trips in the window it has not seen (ADR-032)', async () => {
    useTripStore().applyChange(
      change(TABLE.trips, 'trip-recent', {
        name: 'Neu',
        status: 'active',
        year: 2026,
        start_date: '2026-07-01',
        end_date: '2026-07-10',
      }),
    )
    const page = mountPage()
    await flushPromises()
    expect(page.get('[data-testid="m24-unseen"]').text()).toBe(t('cleanup.unseen', { n: 1 }))

    loaded.add('trip-recent')
    const again = mountPage()
    await flushPromises()
    // The finding is still there — the admission is what went away.
    expect(again.find('[data-testid="m24-unused-Gaskocher"]').exists()).toBe(true)
    expect(again.find('[data-testid="m24-unseen"]').exists()).toBe(false)
  })
})

describe('M24 — Tag mit nur einem Artikel (FR-24.12)', () => {
  beforeEach(() => {
    seedTag('t-tech', 'Technik', 0)
    seedTag('t-foto', 'Fotografie', 1)
    seedItem('k', 'Kamera')
    seedItem('s', 'Stativ')
    seedItem('g', 'Graufilter')
    assign('k', 't-tech')
    assign('s', 't-tech')
    assign('g', 't-foto')
  })

  it('merges through the shared FR-24.10 prompt', async () => {
    const page = mountPage()
    await flushPromises()

    await page.get('[data-testid="m24-merge-Fotografie"]').trigger('click')
    expect(vi.mocked(promptTagMerge).mock.calls[0]![0].id).toBe('t-foto')
    expect(vi.mocked(promptTagMerge).mock.calls[0]![1].usage).toBe(1)
  })

  it('keeps a tag so the rule stops asking about it', async () => {
    const page = mountPage()
    await flushPromises()

    await page.get('[data-testid="m24-keep-tag-Fotografie"]').trigger('click')
    await flushPromises()
    expect(page.find('[data-testid="m24-single-Fotografie"]').exists()).toBe(false)
  })
})

describe('M24 — the screen as a whole', () => {
  it('says all is tidy when no rule finds anything, and the head says so too', async () => {
    seedTag('t-bad', 'Bad')
    seedItem('a', 'Seife')
    seedItem('b', 'Shampoo')
    assign('a', 't-bad')
    assign('b', 't-bad')

    const page = mountPage()
    await flushPromises()

    expect(page.find('[data-testid="m24-done"]').exists()).toBe(true)
    const meta = vi.mocked(setHeaderTitle).mock.calls.at(-1)![1] as () => string | null
    expect(meta()).toBe(t('cleanup.metaDone'))
  })

  it('leaves out a rule this device switched off', async () => {
    seedItem('ks', 'Kartenspiel')
    cleanupSettings().setRule(HYGIENE_RULE_UNTAGGED, false)

    const page = mountPage()
    await flushPromises()

    expect(page.find('[data-testid="m24-rule-untagged"]').exists()).toBe(false)
    // The positive signal: the other rules still render.
    expect(page.find('[data-testid="m24-rule-singleTag"]').exists()).toBe(true)
  })

  it('claims nothing before the master partition has arrived (ADR-033)', async () => {
    seedItem('ks', 'Kartenspiel')
    master.masterLoaded.value = false

    const page = mountPage()
    await flushPromises()

    expect(page.find('[data-testid="m24-loading"]').exists()).toBe(true)
    expect(page.find('[data-testid="m24-rule-untagged"]').exists()).toBe(false)
  })
})
