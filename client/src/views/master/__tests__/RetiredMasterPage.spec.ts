// @vitest-environment jsdom
/**
 * M23 — ADR-033: „nothing is hidden — every item in the inventory is visible"
 * is a claim about master rows, and the archive is the one screen a user opens
 * *because* they believe something is in it. Told that nothing is, on a cold
 * start, they would go and recreate it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

import RetiredMasterPage from '../RetiredMasterPage.vue'
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
const orchestratorFake = {
  ...master,
  masterItemDeletionOutlook: vi.fn(() => ({ blocked: false, references: [] })),
  templateDeletionOutlook: vi.fn(() => ({ blocked: false, references: [] })),
}

function mountPage() {
  return mount(RetiredMasterPage, { global: { provide: { [ORCHESTRATOR]: orchestratorFake } } })
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  master.masterLoaded.value = true
})

describe('M23 archive — an absence it has not read yet (ADR-033, G-7)', () => {
  it('says the archive is loading rather than claiming nothing is hidden', async () => {
    master.masterLoaded.value = false

    const page = mountPage()
    await flushPromises()

    expect(page.find('[data-testid="m23-list-loading"]').exists()).toBe(true)
    expect(page.find('[data-testid="m23-empty"]').exists()).toBe(false)
    expect(page.text()).toContain(t('retired.listUnknown'))

    master.masterLoaded.value = true
    await flushPromises()

    expect(page.find('[data-testid="m23-list-loading"]').exists()).toBe(false)
    expect(page.find('[data-testid="m23-empty"]').exists()).toBe(true)
  })

  /*
   * The note said „loading" while the two segments above it said „(0)", and a
   * reader believes the number: it looks settled in a way a sentence does not.
   * The count is the useful half once it is real — an empty tab is worth
   * naming — so this pins both ends rather than deleting it.
   */
  it('names its segments without a count until the archive is on the device', async () => {
    master.masterLoaded.value = false

    const page = mountPage()
    await flushPromises()

    expect(page.find('[data-testid="m23-segment-items"]').text()).toBe(t('retired.segmentItems'))
    expect(page.find('[data-testid="m23-segment-templates"]').text()).toBe(
      t('retired.segmentTemplates'),
    )

    master.masterLoaded.value = true
    await flushPromises()

    expect(page.find('[data-testid="m23-segment-items"]').text()).toBe(
      t('retired.segmentItemsCount', { n: 0 }),
    )
    expect(page.find('[data-testid="m23-segment-templates"]').text()).toBe(
      t('retired.segmentTemplatesCount', { n: 0 }),
    )
  })

  it('shows neither state once a retired row is on the device', async () => {
    useMasterStore().applyChange({
      seq: 0,
      table: TABLE.items,
      id: 'i1',
      deleted: false,
      row: { name: 'Sonnencreme', unit: 'pcs', retired_at: '2026-09-01T00:00:00Z' },
    })

    const page = mountPage()
    await flushPromises()

    expect(page.find('[data-testid="m23-list-loading"]').exists()).toBe(false)
    expect(page.find('[data-testid="m23-empty"]').exists()).toBe(false)
    expect(page.findAll('[data-testid="m23-row"]')).toHaveLength(1)
  })
})
