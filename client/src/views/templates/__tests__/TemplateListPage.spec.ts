// @vitest-environment jsdom
/**
 * M7 — ADR-033: this screen already distinguished „no templates yet" from „no
 * templates matching", and both sentences read off a master partition that
 * arrives after the first paint. A third state was missing under the two, and
 * the cold start fell into the first of them: an offer to create the first of
 * the twenty templates the device was about to receive.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

import TemplateListPage from '../TemplateListPage.vue'
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
  templateNameCollision: vi.fn(() => null),
  createTemplate: vi.fn(() => 'tpl-new'),
  updateTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
  templateDeletionOutlook: vi.fn(() => ({ blocked: false, references: [] })),
}

function mountPage() {
  return mount(TemplateListPage, { global: { provide: { [ORCHESTRATOR]: orchestratorFake } } })
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  master.masterLoaded.value = true
})

describe('M7 templates — an absence it has not read yet (ADR-033, G-7)', () => {
  it('says the templates are loading rather than claiming there are none', async () => {
    master.masterLoaded.value = false

    const page = mountPage()
    await flushPromises()

    expect(page.find('[data-testid="m7-list-loading"]').exists()).toBe(true)
    expect(page.find('[data-testid="m7-empty"]').exists()).toBe(false)
    expect(page.text()).toContain(t('templates.listUnknown'))
    expect(page.text()).not.toContain(t('templates.empty'))

    master.masterLoaded.value = true
    await flushPromises()

    expect(page.find('[data-testid="m7-list-loading"]').exists()).toBe(false)
    expect(page.find('[data-testid="m7-empty"]').exists()).toBe(true)
  })

  it('shows neither state once a template is on the device', async () => {
    useMasterStore().applyChange({
      seq: 0,
      table: TABLE.templates,
      id: 'tpl1',
      deleted: false,
      row: { name: 'Ferien', kind: 'template' },
    })

    const page = mountPage()
    await flushPromises()

    expect(page.find('[data-testid="m7-list-loading"]').exists()).toBe(false)
    expect(page.find('[data-testid="m7-empty"]').exists()).toBe(false)
    expect(page.find('[data-testid="m7-row-tpl1"]').exists()).toBe(true)
  })
})
