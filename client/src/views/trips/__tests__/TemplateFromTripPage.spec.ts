// @vitest-environment jsdom
/**
 * M21's screen-level rules (FR-27.5). The recognition and the write plan are
 * domain-owned and the reachable flow is E2E-M21-01…03b; what is pinned here
 * is the one thing neither covers — that pressing create twice writes one
 * template, which an e2e case cannot provoke reliably and a real thumb can.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

import TemplateFromTripPage from '../TemplateFromTripPage.vue'
import { useTripStore } from '@/stores/tripStore'
import { TABLE } from '@/types/tables'

import { tripScreenStub } from '@/composables/__tests__/tripScreenStub'

vi.mock('@/composables/useHeaderTitle', () => ({ setHeaderTitle: vi.fn() }))

const replace = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
}))

vi.mock('@ionic/vue', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@ionic/vue')
  return {
    ...actual,
    // Present resolves on a later tick, which is exactly the window the
    // second tap lands in.
    toastController: { create: () => Promise.resolve({ present: () => Promise.resolve() }) },
  }
})

const orchestratorFake = {
  ...tripScreenStub(),
  createTemplateFromTrip: vi.fn(() => 'tpl-new'),
  templateNameCollision: vi.fn(() => undefined),
  today: () => '2026-03-01',
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  orchestratorFake.createTemplateFromTrip.mockReturnValue('tpl-new')
  useTripStore().applyChanges([
    {
      seq: 0,
      table: TABLE.trips,
      id: 'trip-1',
      deleted: false,
      row: { name: 'Samedan Sommer 2026', year: 2026, status: 'archived' },
    },
    {
      seq: 0,
      table: TABLE.tripItems,
      id: 'row-1',
      deleted: false,
      row: { trip_id: 'trip-1', name: 'Reisefön', quantity: 1 },
    },
  ])
})

function mountPage() {
  return mount(TemplateFromTripPage, {
    props: { tripId: 'trip-1' },
    global: { provide: { orchestrator: orchestratorFake } },
  })
}

describe('M21 — creating (FR-27.5)', () => {
  it('writes one template however fast the button is pressed twice', async () => {
    const page = mountPage()
    await page.vm.$nextTick()

    const create = page.find('[data-testid="m21-create"]')
    // Both taps before either await settles — the toast and the navigation
    // are async, and the screen is still on top while they run.
    await Promise.all([create.trigger('click'), create.trigger('click')])
    await page.vm.$nextTick()

    expect(orchestratorFake.createTemplateFromTrip).toHaveBeenCalledTimes(1)
  })

  it('lets the user try again when the trip’s rows were not on the device', async () => {
    orchestratorFake.createTemplateFromTrip.mockReturnValue(null as never)
    const page = mountPage()
    await page.vm.$nextTick()

    await page.find('[data-testid="m21-create"]').trigger('click')
    await page.vm.$nextTick()
    await page.vm.$nextTick()

    // A refusal is not a dead end: the control comes back.
    expect(page.find('[data-testid="m21-create"]').attributes('disabled')).toBeUndefined()
    expect(replace).not.toHaveBeenCalled()
  })
})
