// @vitest-environment jsdom
/**
 * M9 — ADR-033: „no items yet", with the spreadsheet importer under it, is the
 * wrong sentence to show somebody whose two hundred items are still in flight.
 * The screen reads `activeItemList`, which is empty before the master pull and
 * empty when the inventory really is, and it could not tell those apart.
 *
 * The no-match state needs no guard of its own and this spec says why: it sits
 * behind `!isEmpty`, so at least one item is already on the device.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

import ItemInventoryPage from '../ItemInventoryPage.vue'
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

function seedItem(name: string) {
  useMasterStore().applyChange({
    seq: 0,
    table: TABLE.items,
    id: 'i1',
    deleted: false,
    row: { name, unit: 'pcs' },
  })
}

function mountPage() {
  return mount(ItemInventoryPage, { global: { provide: { [ORCHESTRATOR]: orchestratorFake } } })
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
