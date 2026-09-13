// @vitest-environment jsdom
/**
 * M1 — ADR-033: the dashboard's G-7 state is a claim about the master
 * partition, and on a cold start in Server Mode that partition is not here
 * yet. The screen therefore greeted a returning user with „plan your first
 * trip" and a button to create one, over trips the next frame would paint.
 *
 * A mount spec rather than e2e because the subject is the guard, not a flow:
 * the two states have to be told apart with the store held still, which a
 * held pull can do for one screen (E2E-M2-18) but not cheaply for nine.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

import DashboardPage from '../DashboardPage.vue'
import { useTripStore } from '@/stores/tripStore'
import { TABLE } from '@/types/tables'
import { t } from '@/i18n'

import { identityStub } from '@/composables/__tests__/identityStub'
import { masterDataStub } from '@/composables/__tests__/masterDataStub'
import { ORCHESTRATOR } from '@/composables/useOrchestrator'

vi.mock('@/composables/useHeaderTitle', () => ({ setHeaderTitle: vi.fn() }))
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useRoute: () => ({ query: {}, params: {} }),
}))

const master = masterDataStub()

const orchestratorFake = {
  ...identityStub(),
  ...master,
  drainAll: vi.fn(() => Promise.resolve()),
  ensureTripData: vi.fn(() => Promise.resolve()),
  subscribeTrip: vi.fn(),
  resolvePrepTodo: vi.fn(),
  reopenPrepTodo: vi.fn(),
}

function mountPage() {
  return mount(DashboardPage, { global: { provide: { [ORCHESTRATOR]: orchestratorFake } } })
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  master.masterLoaded.value = true
})

describe('M1 dashboard — an absence it has not read yet (ADR-033, G-7)', () => {
  it('says the trips are loading rather than offering to plan the first one', async () => {
    master.masterLoaded.value = false

    const page = mountPage()
    await flushPromises()

    expect(page.find('[data-testid="dashboard-list-loading"]').exists()).toBe(true)
    expect(page.find('[data-testid="dashboard-empty"]').exists()).toBe(false)
    expect(page.find('[data-testid="dashboard-plan-trip"]').exists()).toBe(false)
    expect(page.text()).toContain(t('trips.listUnknown'))

    // The settled half, without which the first one would pass against a
    // screen that had simply stopped rendering either state.
    master.masterLoaded.value = true
    await flushPromises()

    expect(page.find('[data-testid="dashboard-list-loading"]').exists()).toBe(false)
    expect(page.find('[data-testid="dashboard-empty"]').exists()).toBe(true)
  })

  it('shows neither state once a trip is on the device', async () => {
    const trips = useTripStore()
    trips.applyChange({
      seq: 0,
      table: TABLE.trips,
      id: 't1',
      deleted: false,
      row: { name: 'Samedan', year: 2026, status: 'active' },
    })

    const page = mountPage()
    await flushPromises()

    expect(page.find('[data-testid="dashboard-list-loading"]').exists()).toBe(false)
    expect(page.find('[data-testid="dashboard-empty"]').exists()).toBe(false)
  })
})
