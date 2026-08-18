/**
 * M2's applied-changes chip (FR-27.4): a *planned* trip that took changes
 * over from its groups says so on its row, expandably, and a running or
 * past trip never does — they are frozen, so a chip there would be a lie.
 *
 * A component test rather than e2e for the chip's *rules*: which trips may
 * carry it, and that the log words each entry from its structured detail.
 * The reachable flow — edit a group, see the chip appear — is E2E-M8-09.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

import TripListPage from '../TripListPage.vue'
import { useTripStore } from '@/stores/tripStore'
import { TABLE } from '@/types/tables'
import type { AppliedChange } from '@/types/domain'

vi.mock('@/composables/useHeaderTitle', () => ({ setHeaderTitle: vi.fn() }))
vi.mock('@/composables/useHeaderActions', () => ({ setHeaderActions: vi.fn() }))
// M2 opens on the *active* segment, so each test names the one it needs the
// way M18 does — through `?status=`. Mutable rather than fixed: the frozen
// case has to render an active trip's row and find no chip on it, and a test
// that simply filtered the row away would pass against a chip with no rule
// at all.
let segment = 'planned'

vi.mock('vue-router', () => ({
  useRoute: () => ({
    get query() {
      return { status: segment }
    },
    params: {},
  }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

const orchestratorFake = {
  fetchMe: vi.fn(() => Promise.resolve(null)),
  drainAll: vi.fn(() => Promise.resolve()),
}

function seedTrip(status: string) {
  const trips = useTripStore()
  trips.applyChange({
    seq: 0,
    table: TABLE.trips,
    id: 't1',
    deleted: false,
    row: { name: 'Samedan', year: 2026, status },
  })
  return trips
}

function logEntry(extra: Partial<AppliedChange> = {}) {
  return {
    seq: 0,
    table: TABLE.tripAppliedChanges,
    id: extra.id ?? 'log-1',
    deleted: false,
    row: {
      trip_id: 't1',
      source_template_id: 'g1',
      source_template_name: 'Makro Fotografie',
      kind: 'added',
      item_name: 'Stativ',
      detail: null,
      created_at: '2026-08-18T10:00:00Z',
      ...extra,
    },
  }
}

function mountPage() {
  return mount(TripListPage, {
    global: { provide: { orchestrator: orchestratorFake } },
  })
}

beforeEach(() => {
  segment = 'planned'
  setActivePinia(createPinia())
  vi.clearAllMocks()
  localStorage.clear()
})

describe('TripListPage — the FR-27.4 applied-changes chip', () => {
  it('counts what a planned trip took over from its groups', async () => {
    const trips = seedTrip('planning')
    trips.applyChanges([logEntry(), logEntry({ id: 'log-2', item_name: 'Fernauslöser' })])

    const wrapper = mountPage()

    const chip = wrapper.find('[data-testid="m2-applied-chip-Samedan"]')
    expect(chip.exists()).toBe(true)
    expect(chip.text()).toContain('2')
  })

  it('never appears on a running trip — an active trip is frozen', async () => {
    segment = 'active'
    const trips = seedTrip('active')
    // Log rows exist for this trip: the only thing keeping the chip away is
    // the status rule, which is what this asserts.
    trips.applyChanges([logEntry()])

    const wrapper = mountPage()

    // The row *is* on screen — otherwise this would assert the filter.
    expect(wrapper.find('[data-testid="trip-row-Samedan"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="m2-applied-chip-Samedan"]').exists()).toBe(false)
  })

  it('stays collapsed until asked, then names each change with its source group', async () => {
    const trips = seedTrip('planning')
    trips.applyChanges([logEntry()])
    const wrapper = mountPage()

    expect(wrapper.find('[data-testid="m2-applied-log-Samedan"]').exists()).toBe(false)

    await wrapper.find('[data-testid="m2-applied-chip-Samedan"]').trigger('click')

    const log = wrapper.find('[data-testid="m2-applied-log-Samedan"]')
    expect(log.text()).toContain('Makro Fotografie')
    expect(log.text()).toContain('Stativ')
  })

  it('words a quantity change from its structured detail, not from a stored sentence', async () => {
    const trips = seedTrip('planning')
    trips.applyChanges([
      logEntry({
        kind: 'changed',
        detail: JSON.stringify({ field: 'quantity', from: 2, to: 4 }),
      } as never),
    ])
    const wrapper = mountPage()

    await wrapper.find('[data-testid="m2-applied-chip-Samedan"]').trigger('click')

    const text = wrapper.find('[data-testid="m2-applied-log-Samedan"]').text()
    expect(text).toContain('2')
    expect(text).toContain('4')
  })
})
