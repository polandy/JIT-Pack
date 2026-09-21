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

import { defineComponent, type Component } from 'vue'
import { TRIP_CARDS, type TripCardProps } from '@/lib/tripCards'

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
  tripDataLoaded: vi.fn(() => true),
  addTripTodo: vi.fn(() => 'new-task'),
  resolveTripTodo: vi.fn(),
  reopenTripTodo: vi.fn(),
  deleteTripTodo: vi.fn(),
}

function mountPage(cards?: Component[]) {
  const provide: Record<symbol, unknown> = { [ORCHESTRATOR]: orchestratorFake }
  if (cards) provide[TRIP_CARDS] = cards
  return mount(DashboardPage, { global: { provide } })
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

/**
 * FR-30.8: what M1 tells a module's card about the trip it sits under. The
 * card opens on the list that is *now*, and *now* is a fact only the trip
 * knows — so M1 has to pass it. It was passing `planned` alone, which is
 * exactly right until a trip's packing is finished before it starts.
 */
describe('M1 — what a trip card is told (FR-30.7/FR-30.8)', () => {
  const seen: TripCardProps[] = []
  const spyCard = defineComponent({
    props: {
      tripId: { type: String, required: true },
      tripName: { type: String, required: true },
      planned: { type: Boolean, required: true },
      packingClosed: { type: Boolean, required: true },
      embedded: { type: Boolean, default: false },
    },
    setup(props) {
      seen.push({ ...props })
      return () => null
    },
  })

  it('passes the packing stamp beside the phase', async () => {
    const trips = useTripStore()
    trips.applyChange({
      seq: 0,
      table: TABLE.trips,
      id: 't-running',
      deleted: false,
      row: { name: 'Samedan', year: 2026, status: 'active' },
    })
    trips.applyChange({
      seq: 0,
      table: TABLE.trips,
      id: 't-shut',
      deleted: false,
      row: {
        name: 'Elba',
        year: 2026,
        status: 'planning',
        packing_closed_at: '2026-09-20T18:40:00.000Z',
      },
    })
    seen.length = 0

    mountPage([spyCard])
    await flushPromises()

    const shut = seen.find((props) => props.tripId === 't-shut')
    expect(shut).toMatchObject({ planned: true, packingClosed: true })
    // The other trip is the control: without it, a card told `true` for every
    // trip would pass this case.
    expect(seen.find((props) => props.tripId === 't-running')).toMatchObject({
      planned: false,
      packingClosed: false,
    })
  })
})

/**
 * FR-7.9 on M1 (owner, 2026-09-21; translated from German): *on the dashboard
 * „packing finished“ takes up too much space — leave it out once the trip is
 * in that phase*, and show the phase in the date line instead.
 *
 * Both halves matter: the line is gone, and the phase is said elsewhere.
 * Without the second, a spec that only proved the line's absence would pass
 * against a card that had simply stopped saying anything.
 */
describe('M1 — the hero once the packing is finished (FR-7.9)', () => {
  const CLOSED = '2026-09-20T18:40:00.000Z'

  function seedActiveTrip(row: Record<string, unknown> = {}) {
    useTripStore().applyChange({
      seq: 0,
      table: TABLE.trips,
      id: 't1',
      deleted: false,
      row: { name: 'Samedan', year: 2026, status: 'active', ...row },
    })
  }

  function seedTask(id: string, row: Record<string, unknown> = {}) {
    useTripStore().applyChange({
      seq: 0,
      table: TABLE.comments,
      id,
      deleted: false,
      row: {
        trip_id: 't1',
        trip_item_id: null,
        author_id: 'u-andy',
        is_task: 1,
        task_state: 'open',
        phase: 'during',
        body: id,
        ...row,
      },
    })
  }

  it('keeps the ring and says Packen in the date line while the packing is open', async () => {
    seedActiveTrip({ start_date: '2026-10-12', end_date: '2026-10-18' })

    const page = mountPage()
    await flushPromises()

    expect(page.find('[data-testid="hero-progress"]').exists()).toBe(true)
    expect(page.find('[data-testid="hero-phase"]').text()).toBe(t('dashboard.phasePacking'))
    expect(page.find('[data-testid="dashboard-tasks-Samedan-add"]').exists()).toBe(false)
  })

  it('drops the ring, names the phase, and shows the blocks', async () => {
    seedActiveTrip({ packing_closed_at: CLOSED })

    const page = mountPage()
    await flushPromises()

    expect(page.find('[data-testid="hero-progress"]').exists()).toBe(false)
    expect(page.find('[data-testid="hero-phase"]').text()).toBe(t('dashboard.phaseOnSite'))
    expect(page.find('[data-testid="dashboard-tasks-Samedan"]').exists()).toBe(true)
  })

  it('is no longer one link: only the head leads into the trip, and no control sits in a link', async () => {
    seedActiveTrip({ packing_closed_at: CLOSED })
    seedTask('Post nachsenden')

    const page = mountPage()
    await flushPromises()

    const hero = page.find('[data-testid="dashboard-trip-Samedan"]')
    expect(hero.element.tagName).not.toBe('A')
    expect(hero.find('[data-testid="hero-head"]').exists()).toBe(true)
    // A control inside a link is the defect: the tap would be a navigation.
    for (const control of hero.findAll('button, input')) {
      expect(control.element.closest('a')).toBeNull()
    }
  })

  it('lists the four next open tasks, counts them all, and names the rest', async () => {
    seedActiveTrip({ packing_closed_at: CLOSED })
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) seedTask(id)
    seedTask('done', { task_state: 'resolved' })

    const page = mountPage()
    await flushPromises()

    const block = page.find('[data-testid="dashboard-tasks-Samedan"]')
    expect(block.findAll('[data-testid="dashboard-tasks-Samedan-row"]')).toHaveLength(4)
    expect(block.find('[data-testid="dashboard-tasks-Samedan-count"]').text()).toBe('6')
    expect(block.find('[data-testid="dashboard-tasks-Samedan-more"]').text()).toContain(
      t('dashboard.tasksMore', { n: 2 }),
    )
  })

  it('ticks a task on the right-hand check and writes it through the shared act', async () => {
    seedActiveTrip({ packing_closed_at: CLOSED })
    seedTask('Post nachsenden')

    const page = mountPage()
    await flushPromises()
    await page.find('[data-testid="dashboard-tasks-Samedan-row-check"]').trigger('click')

    expect(orchestratorFake.resolveTripTodo).toHaveBeenCalledTimes(1)
  })

  it('adds a task in the phase in front of the trip and keeps the field for the next', async () => {
    seedActiveTrip({ packing_closed_at: CLOSED })

    const page = mountPage()
    await flushPromises()
    const input = page.find('[data-testid="dashboard-tasks-Samedan-add-input"]')
    await input.setValue('  Post nachsenden  ')
    await page.find('[data-testid="dashboard-tasks-Samedan-add"]').trigger('submit')

    expect(orchestratorFake.addTripTodo).toHaveBeenCalledWith(
      't1',
      expect.anything(),
      'Post nachsenden',
      'during',
    )
    expect((input.element as HTMLInputElement).value).toBe('')
  })

  it('adds nothing for a blank field', async () => {
    seedActiveTrip({ packing_closed_at: CLOSED })

    const page = mountPage()
    await flushPromises()
    await page.find('[data-testid="dashboard-tasks-Samedan-add-input"]').setValue('   ')
    await page.find('[data-testid="dashboard-tasks-Samedan-add"]').trigger('submit')

    expect(orchestratorFake.addTripTodo).not.toHaveBeenCalled()
  })

  it('stays, with its field and a sentence, when nothing is left to do', async () => {
    seedActiveTrip({ packing_closed_at: CLOSED })

    const page = mountPage()
    await flushPromises()

    expect(page.find('[data-testid="dashboard-tasks-Samedan-empty"]').text()).toBe(
      t('tasks.emptyDuring'),
    )
    expect(page.find('[data-testid="dashboard-tasks-Samedan-add-input"]').exists()).toBe(true)
  })

  it('folds and unfolds by its head, and a folded block keeps head, count and field', async () => {
    seedActiveTrip({ packing_closed_at: CLOSED })
    seedTask('Post nachsenden')
    localStorage.clear()

    const page = mountPage()
    await flushPromises()
    const fold = page.find('[data-testid="dashboard-tasks-Samedan-fold"]')
    expect(fold.attributes('aria-expanded')).toBe('true')

    await fold.trigger('click')

    expect(fold.attributes('aria-expanded')).toBe('false')
    const block = page.find('[data-testid="dashboard-tasks-Samedan"]')
    expect(block.attributes('data-folded')).toBe('true')
    expect(block.find('[data-testid="dashboard-tasks-Samedan-count"]').exists()).toBe(true)
    expect(block.find('[data-testid="dashboard-tasks-Samedan-add-input"]').exists()).toBe(true)
    expect(block.find('.body').attributes('inert')).toBeDefined()
  })

  it('lists tasks only of the trip whose block it is, and not again in the overview card', async () => {
    seedActiveTrip({ packing_closed_at: CLOSED })
    seedTask('Post nachsenden')

    const page = mountPage()
    await flushPromises()

    expect(page.findAll('[data-testid="dashboard-tasks-Samedan-row"]')).toHaveLength(1)
    expect(page.text().match(/Post nachsenden/g)).toHaveLength(1)
  })

  it('leads back to the packing list from under the blocks', async () => {
    seedActiveTrip({ packing_closed_at: CLOSED })

    const page = mountPage()
    await flushPromises()

    expect(page.find('[data-testid="dashboard-open-packing"]').text()).toContain(
      t('dashboard.openPackingList'),
    )
  })

  it('hands the shopping card the hero to sit in, and no card sits under it', async () => {
    seedActiveTrip({ packing_closed_at: CLOSED })
    const seen: TripCardProps[] = []
    const spy = defineComponent({
      props: {
        tripId: { type: String, required: true },
        tripName: { type: String, required: true },
        planned: { type: Boolean, required: true },
        packingClosed: { type: Boolean, required: true },
        embedded: { type: Boolean, default: false },
      },
      setup(props) {
        seen.push({ ...props })
        return () => null
      },
    })

    mountPage([spy])
    await flushPromises()

    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({ embedded: true, packingClosed: true })
  })

  it('draws the cards below the hero without a ring or a line, and with the phase', async () => {
    // The hero is the soonest *dated* departure (FR-21.13), so Samedan is the
    // hero and Elba — undated, packing finished — is a card below it.
    seedActiveTrip({ start_date: '2026-10-01' })
    useTripStore().applyChange({
      seq: 1,
      table: TABLE.trips,
      id: 't2',
      deleted: false,
      row: { name: 'Elba', year: 2026, status: 'active', packing_closed_at: CLOSED },
    })

    const page = mountPage()
    await flushPromises()

    expect(page.find('[data-testid="dashboard-summary-Elba"]').exists()).toBe(false)
    expect(page.find('[data-testid="dashboard-phase-Elba"]').text()).toBe(
      t('dashboard.phaseOnSite'),
    )
    // The hero's own ring is untouched: its packing is still open, and the
    // rule is about the trip, not about the screen.
    expect(page.find('[data-testid="hero-progress"]').exists()).toBe(true)
  })
})
