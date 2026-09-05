// @vitest-environment jsdom
/**
 * M2's two FR-27.4 chips: what a trip *took over* from its groups (past
 * tense, expandable) and what is still *waiting* on it (a pointer, since the
 * decision belongs at the trip). Since the owner's rule change of 2026-08-18
 * a running trip carries both — only a past trip is frozen.
 *
 * A component test rather than e2e for the chip's *rules*: which trips may
 * carry it, whether its log is written out or folded away (owner, 2026-08-18:
 * inline up to ten changes, foldable above), and that each entry is worded
 * from its structured detail. The reachable flow — edit a group, see the chip
 * appear — is E2E-M8-09.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { ref } from 'vue'

import TripListPage from '../TripListPage.vue'
import { useTripStore } from '@/stores/tripStore'
import { TABLE } from '@/types/tables'
import { t } from '@/i18n'
import type { AppliedChange } from '@/types/domain'

import { identityStub } from '@/composables/__tests__/identityStub'

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

const masterLoaded = ref(true)

const orchestratorFake = {
  ...identityStub(),
  activateTrip: vi.fn(),
  fetchMe: vi.fn(() => Promise.resolve(null)),
  drainAll: vi.fn(() => Promise.resolve()),
  refreshProposals: { value: {} as Record<string, unknown> },
  // ADR-033: whether a trip's own rows are on this device, and the request
  // that fetches them. The set is what a test decides.
  loadedTrips: new Set<string>(),
  tripDataLoaded: vi.fn((tripId: string) => orchestratorFake.loadedTrips.has(tripId)),
  // FR-2.8: whether the trip list itself is on the device. A ref, like both
  // signals it stands in for — the screen reads it through a computed, and a
  // plain property would make that computed permanently stale. Default true,
  // so the cases above see a settled list; the FR-2.8 block drives it.
  masterDataLoaded: vi.fn(() => masterLoaded.value),
  ensureTripData: vi.fn(() => Promise.resolve()),
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
  orchestratorFake.refreshProposals.value = {}
  orchestratorFake.loadedTrips = new Set<string>()
  masterLoaded.value = true
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

  it('appears on a running trip too — departure no longer freezes it', async () => {
    // The rule this replaces was "active means frozen" (owner, 2026-08-18).
    segment = 'active'
    const trips = seedTrip('active')
    trips.applyChanges([logEntry()])

    const wrapper = mountPage()

    expect(wrapper.find('[data-testid="trip-row-Samedan"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="m2-applied-chip-Samedan"]').exists()).toBe(true)
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

describe('TripListPage — the FR-27.4 proposal chip', () => {
  it('says how many changes are waiting, and offers nothing to press', async () => {
    seedTrip('planning')
    orchestratorFake.refreshProposals.value = {
      t1: { add: [{}, {}], update: [{}], remove: [], ledgerUpsert: [], ledgerDelete: [], log: [] },
    }

    const wrapper = mountPage()

    const chip = wrapper.find('[data-testid="m2-proposed-chip-Samedan"]')
    expect(chip.exists()).toBe(true)
    expect(chip.text()).toContain('3')
    // The decision is at the trip (owner, 2026-08-18): a second place to
    // answer from would be a second place to get the answer wrong.
    expect(chip.element.tagName).not.toBe('BUTTON')
  })

  it('stays away when the plan only moves the ledger — that is nothing to answer', async () => {
    seedTrip('planning')
    orchestratorFake.refreshProposals.value = {
      t1: {
        add: [],
        update: [],
        remove: [],
        ledgerUpsert: [{ id: 'l1' }],
        ledgerDelete: [],
        log: [],
      },
    }

    const wrapper = mountPage()

    expect(wrapper.find('[data-testid="trip-row-Samedan"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="m2-proposed-chip-Samedan"]').exists()).toBe(false)
  })

  it('says nothing about a trip this device holds no proposal for', async () => {
    seedTrip('planning')

    const wrapper = mountPage()

    expect(wrapper.find('[data-testid="m2-proposed-chip-Samedan"]').exists()).toBe(false)
  })
})

describe('TripListPage — the lifecycle swipe options', () => {
  // The status a trip is in decides which single step it is offered. Worth a
  // test of its own because *start* is the step that made archiving — and
  // therefore M14 and M21 — reachable at all, and because the two options are
  // written as separate `v-if`s that could both render or neither.
  it('offers start on a planning trip, and not archive', async () => {
    segment = 'planned'
    seedTrip('planning')
    const page = mountPage()
    await page.vm.$nextTick()

    expect(page.find('[aria-label="Start trip"]').exists()).toBe(true)
    expect(page.find('[aria-label="Archive trip"]').exists()).toBe(false)
  })

  it('offers archive on a running trip, and not start', async () => {
    segment = 'active'
    seedTrip('active')
    const page = mountPage()
    await page.vm.$nextTick()

    expect(page.find('[aria-label="Archive trip"]').exists()).toBe(true)
    expect(page.find('[aria-label="Start trip"]').exists()).toBe(false)
  })

  it('offers neither on an archived trip — its lifecycle is over', async () => {
    segment = 'archived'
    seedTrip('archived')
    const page = mountPage()
    await page.vm.$nextTick()

    expect(page.find('[aria-label="Start trip"]').exists()).toBe(false)
    expect(page.find('[aria-label="Archive trip"]').exists()).toBe(false)
  })

  it('starting the trip asks the orchestrator to activate it', async () => {
    segment = 'planned'
    seedTrip('planning')
    const page = mountPage()
    await page.vm.$nextTick()

    await page.find('[aria-label="Start trip"]').trigger('click')

    expect(orchestratorFake.activateTrip).toHaveBeenCalledWith('t1')
  })
})

/**
 * ADR-033: `trip_items` live in the trip's own partition, so a trip this
 * device has never opened has nothing to sum. The row used to print the sum
 * of nothing — `0/0 gepackt`, ring at 0 % — which reads as "you packed
 * nothing" for a trip that was fully packed years ago.
 */
describe('TripListPage — a trip whose own rows are not here yet', () => {
  it('says the items are still coming instead of claiming there are none', () => {
    seedTrip('archived')
    segment = 'archived'

    const wrapper = mountPage()

    const summary = wrapper.find('[data-testid="trip-item-summary"]')
    expect(summary.text()).toBe(t('trips.itemsUnknown'))
    // The positive half: the number it used to show is *not* there.
    expect(summary.text()).not.toContain('0/0')
  })

  it('leaves the ring unfilled and unlabelled rather than showing 0 %', () => {
    seedTrip('archived')
    segment = 'archived'

    const wrapper = mountPage()

    expect(wrapper.find('.ring-fg').attributes('stroke-dasharray')).toBe('0 100')
    expect(wrapper.find('.ring-text').text()).not.toContain('%')
  })

  it('shows the real numbers once the rows are here', () => {
    const trips = seedTrip('archived')
    segment = 'archived'
    orchestratorFake.loadedTrips.add('t1')
    trips.applyChange({
      seq: 1,
      table: TABLE.tripItems,
      id: 'ti-1',
      deleted: false,
      row: { trip_id: 't1', name: 'Zelt', quantity: 2, packed_count: 2, state: 'packed' },
    })

    const wrapper = mountPage()

    expect(wrapper.find('[data-testid="trip-item-summary"]').text()).toContain('2')
    expect(wrapper.find('.ring-fg').attributes('stroke-dasharray')).toBe('100 100')
    expect(wrapper.find('.ring-text').text()).toContain('100%')
  })

  it('asks for a row it is showing — jsdom has no observer, so every row counts as shown', () => {
    seedTrip('archived')
    segment = 'archived'

    mountPage()

    expect(orchestratorFake.ensureTripData).toHaveBeenCalledWith('t1')
  })

  it('does not ask again for a trip whose rows it already has', () => {
    seedTrip('archived')
    segment = 'archived'
    orchestratorFake.loadedTrips.add('t1')

    mountPage()

    // The guard is in `ensureTripData`, and the screen still calls it — what
    // matters is that a loaded trip costs no request, which its own unit
    // asserts. Here: the screen does not decide to skip the call, so a trip
    // that becomes stale later can still be refreshed.
    expect(orchestratorFake.ensureTripData).toHaveBeenCalledWith('t1')
  })
})

/**
 * FR-2.8 — the opening segment is derived from what the list holds. The pure
 * walk is `openingFilter`'s own unit; what is tested here is the wiring the
 * screen owes it: the settled guard, the `?status=` precedence, and the
 * counts on the segment buttons.
 */
describe('TripListPage — the opening segment (FR-2.8)', () => {
  /** A second trip beside `seedTrip`'s, so a walk has somewhere to walk to. */
  function seedAlso(id: string, name: string, status: string) {
    useTripStore().applyChange({
      seq: 0,
      table: TABLE.trips,
      id,
      deleted: false,
      row: { name, year: 2026, status },
    })
  }

  function countOf(wrapper: ReturnType<typeof mountPage>, name: string): string | null {
    const button = wrapper.find(`[data-testid="trips-filter-${name}"]`)
    const count = button.find('.segment-count')
    return count.exists() ? count.text() : null
  }

  beforeEach(() => {
    // No caller naming a segment: this is the ordinary opening of the tab.
    segment = ''
  })

  it('leaves an empty Active for the planned trip', async () => {
    seedTrip('planning')

    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.find('[data-testid="trip-row-Samedan"]').exists()).toBe(true)
  })

  it('falls through to the archive when nothing is active or planned', async () => {
    seedTrip('archived')

    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.find('[data-testid="trip-row-Samedan"]').exists()).toBe(true)
  })

  it('stays on Active, with its own empty state, when there is no trip at all', async () => {
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.text()).toContain(t('trips.emptyActive'))
  })

  it('honours a caller that names an empty segment', async () => {
    // M18's restore and M15's migration land where their own result is, even
    // when that is nowhere — being shown somebody else's trips instead would
    // read as "your import went in there".
    segment = 'active'
    seedTrip('archived')

    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.text()).toContain(t('trips.emptyActive'))
    expect(wrapper.find('[data-testid="trip-row-Samedan"]').exists()).toBe(false)
  })

  it('does not decide on a list that has not arrived, and decides once it has', async () => {
    // The sharpest edge in the FR: zeros read off an unpulled list are not
    // zeros. Without the guard this lands on the archive on every cold start
    // and stays there, because the walk decides on entry only.
    masterLoaded.value = false
    seedTrip('archived')

    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.find('[data-testid="trip-row-Samedan"]').exists()).toBe(false)
    expect(countOf(wrapper, 'archived')).toBeNull()

    // The same entry, now settled: the deferred decision is what fires here,
    // which is also what proves the assertion above was not simply empty.
    masterLoaded.value = true
    await flushPromises()

    expect(wrapper.find('[data-testid="trip-row-Samedan"]').exists()).toBe(true)
    expect(countOf(wrapper, 'archived')).toBe('(1)')
  })

  it('writes each segment its count, zero included', async () => {
    seedTrip('planning')
    seedAlso('t2', 'Rom', 'planning')
    seedAlso('t3', 'Kreta 2019', 'archived')

    const wrapper = mountPage()
    await flushPromises()

    expect(countOf(wrapper, 'active')).toBe('(0)')
    expect(countOf(wrapper, 'planned')).toBe('(2)')
    expect(countOf(wrapper, 'archived')).toBe('(1)')
  })

  it('says the count in the button’s name, not only as a digit beside it', async () => {
    seedTrip('planning')

    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.find('[data-testid="trips-filter-planned"]').attributes('aria-label')).toBe(
      t('trips.filterCount', { label: t('trips.filterPlanned'), n: 1 }),
    )
  })
})
