/**
 * M2's applied-changes chip (FR-27.4): a *planned* trip that took changes
 * over from its groups says so on its row, expandably, and a running or
 * past trip never does — they are frozen, so a chip there would be a lie.
 *
 * A component test rather than e2e for the chip's *rules*: which trips may
 * carry it, whether its log is written out or folded away (owner, 2026-08-18:
 * inline up to ten changes, foldable above), and that each entry is worded
 * from its structured detail. The reachable flow — edit a group, see the chip
 * appear — is E2E-M8-09.
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

/** n distinct log rows, so the fold threshold can be approached from both sides. */
function manyEntries(n: number) {
  return Array.from({ length: n }, (_, i) =>
    logEntry({ id: `log-${i}`, item_name: `Artikel ${i}` } as never),
  )
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

  it('writes a short log out where it happened, with no control to press', async () => {
    const trips = seedTrip('planning')
    trips.applyChanges([logEntry()])

    const wrapper = mountPage()

    const log = wrapper.find('[data-testid="m2-applied-log-Samedan"]')
    expect(log.exists()).toBe(true)
    expect(log.text()).toContain('Makro Fotografie')
    expect(log.text()).toContain('Stativ')
    // The chip is the heading of what is already on screen, not a button
    // that reveals it: a control that toggles nothing is a lie about state.
    expect(wrapper.find('button[data-testid="m2-applied-chip-Samedan"]').exists()).toBe(false)
  })

  it('still writes it out at exactly ten changes — the limit is inclusive', async () => {
    const trips = seedTrip('planning')
    trips.applyChanges(manyEntries(10))

    const wrapper = mountPage()

    expect(wrapper.find('[data-testid="m2-applied-log-Samedan"]').exists()).toBe(true)
    expect(wrapper.find('button[data-testid="m2-applied-chip-Samedan"]').exists()).toBe(false)
  })

  it('folds an eleventh change away, so one busy trip cannot bury the list', async () => {
    const trips = seedTrip('planning')
    trips.applyChanges(manyEntries(11))

    const wrapper = mountPage()

    // Folded: the chip is a real button and the log is not on screen yet.
    const chip = wrapper.find('button[data-testid="m2-applied-chip-Samedan"]')
    expect(chip.exists()).toBe(true)
    expect(chip.attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('[data-testid="m2-applied-log-Samedan"]').exists()).toBe(false)

    await chip.trigger('click')

    const log = wrapper.find('[data-testid="m2-applied-log-Samedan"]')
    expect(log.exists()).toBe(true)
    expect(log.findAll('p')).toHaveLength(12) // eleven changes plus the frozen note
    expect(
      wrapper.find('button[data-testid="m2-applied-chip-Samedan"]').attributes('aria-expanded'),
    ).toBe('true')
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

    const text = wrapper.find('[data-testid="m2-applied-log-Samedan"]').text()
    expect(text).toContain('2')
    expect(text).toContain('4')
  })
})
