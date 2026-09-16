// @vitest-environment jsdom
/**
 * M4 — ADR-033. M4's comment already said an empty list means one of two
 * things and that conflating them is how a packing app tells someone they are
 * finished when they are not. There were three, and the missing one was the
 * cheapest to hit: on a cold start or a shared link straight onto the screen,
 * `view.groups`, `view.narrowed` and `allItems` are all empty, so the chain
 * fell through to „everything is packed" over a list nobody had read.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

import PackingListPage from '../PackingListPage.vue'
import { useTripStore } from '@/stores/tripStore'
import { TABLE } from '@/types/tables'
import { t } from '@/i18n'

import { identityStub } from '@/composables/__tests__/identityStub'
import { tripScreenStub } from '@/composables/__tests__/tripScreenStub'
import { ORCHESTRATOR } from '@/composables/useOrchestrator'

vi.mock('@/composables/useHeaderTitle', () => ({ setHeaderTitle: vi.fn() }))
vi.mock('@/composables/useHeaderActions', () => ({ setHeaderActions: vi.fn() }))
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useRoute: () => ({ query: {}, params: {} }),
}))

/*
 * Every case here mounts M4 and none of them used to take it down again, so a
 * live component from the previous case kept its watchers on the *next* case's
 * store: `seedTrip()` reported a row it had never been given, and a case that
 * asserted a figure read the leftovers. Only an assertion on the header's own
 * number was ever going to notice.
 */
enableAutoUnmount(afterEach)

const tripScreen = tripScreenStub()
const orchestratorFake = {
  ...identityStub(),
  ...tripScreen,
  refreshProposals: { value: {} as Record<string, unknown> },
  proposeTripRefresh: vi.fn(),
  acceptTripRefresh: vi.fn(),
  declineTripRefresh: vi.fn(),
  getPresence: vi.fn(() => []),
  holdsClaim: vi.fn(() => false),
  isLockedByOther: vi.fn(() => false),
  lockHolder: vi.fn(() => null),
}

function seedTrip(rows: Record<string, unknown>[] = []) {
  const trips = useTripStore()
  trips.applyChange({
    seq: 0,
    table: TABLE.trips,
    id: 't1',
    deleted: false,
    row: { name: 'Samedan', year: 2026, status: 'active' },
  })
  for (const [i, row] of rows.entries()) {
    trips.applyChange({
      seq: 0,
      table: TABLE.tripItems,
      id: `ti${i + 1}`,
      deleted: false,
      row: { trip_id: 't1', quantity: 1, packed_count: 0, state: 'open', mode: 'pack', ...row },
    })
  }
  return trips
}

function mountPage() {
  return mount(PackingListPage, {
    props: { tripId: 't1' },
    global: { provide: { [ORCHESTRATOR]: orchestratorFake } },
  })
}

beforeEach(() => {
  // jsdom has no media queries. M4 reads two of them at setup — the ≥900px
  // panel breakpoint and `prefers-reduced-motion` — so the stub answers both
  // with „no", the phone-width, animated default the rest of the suite assumes.
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }) as unknown as typeof window.matchMedia

  setActivePinia(createPinia())
  vi.clearAllMocks()
  tripScreen.loadedTrips.clear()
})

describe('M4 packing list — an absence it has not read yet (ADR-033, G-7)', () => {
  it('says the list is loading rather than claiming everything is packed', async () => {
    seedTrip()

    const page = mountPage()
    await flushPromises()

    expect(page.find('[data-testid="m4-list-loading"]').exists()).toBe(true)
    expect(page.find('[data-testid="packing-empty"]').exists()).toBe(false)
    expect(page.text()).toContain(t('packing.listUnknown'))
    expect(page.text()).not.toContain(t('packing.allDone'))

    // The partition arrives and the trip genuinely holds nothing: only now is
    // one of the three G-7 sentences the honest answer.
    tripScreen.loadedTrips.add('t1')
    await flushPromises()

    expect(page.find('[data-testid="m4-list-loading"]').exists()).toBe(false)
    expect(page.find('[data-testid="packing-empty"]').exists()).toBe(true)
    expect(page.text()).toContain(t('packing.empty'))
  })

  it('shows neither state once a row is on the device', async () => {
    seedTrip([{ name: 'Zelt' }])
    tripScreen.loadedTrips.add('t1')

    const page = mountPage()
    await flushPromises()

    expect(page.find('[data-testid="m4-list-loading"]').exists()).toBe(false)
    expect(page.find('[data-testid="packing-empty"]').exists()).toBe(false)
  })

  /*
   * The note was gated and the figure above it was not, which is the half of
   * ADR-033 the 2026-09-13 sweep missed: „0/0 packed" under a full ring track
   * is the same verdict as „everything is packed", stated in the one place on
   * M4 that a reader trusts over a sentence. Rendering found it; no assertion
   * did, because every case here looked below the header.
   */
  it('states no figure until the rows it would count are on the device', async () => {
    seedTrip()

    const page = mountPage()
    await flushPromises()

    expect(page.find('[data-testid="m4-progress"]').exists()).toBe(false)

    // Once the partition is here, 0/0 is a measurement rather than a guess —
    // and this half is what stops the fix from simply deleting the header.
    tripScreen.loadedTrips.add('t1')
    await flushPromises()

    expect(page.find('[data-testid="m4-progress"]').text()).toBe(
      t('trips.itemSummary', { packed: 0, total: 0 }),
    )
  })

  /*
   * The band the figure sits in is a second decision: with the figure waiting
   * it holds nothing, and a padded, bordered strip above the notice is a
   * container asserting itself. It reuses the state that already yields the
   * space rather than a second one — so what is asserted is that class.
   */
  it('yields the header band while it has no figure to hold', async () => {
    seedTrip()

    const page = mountPage()
    await flushPromises()

    expect(page.find('[data-testid="m4-header"]').classes()).toContain('collapsed')

    tripScreen.loadedTrips.add('t1')
    await flushPromises()

    expect(page.find('[data-testid="m4-header"]').classes()).not.toContain('collapsed')
  })
})
