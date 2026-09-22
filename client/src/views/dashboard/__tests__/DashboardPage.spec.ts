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
import { CLIENT_ACTOR_PLACEHOLDER } from '@/sync/mutations'

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
  toggleNoteTick: vi.fn(),
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
 * FR-5.10 on M1 (owner, 2026-09-20): *„es soll auch Auswirkungen auf das
 * Dashboard haben. Die Packliste kann dort deutlich weniger prominent sein,
 * da wir nun in einer anderen Ferienphase sind."*
 *
 * The ring is the loudest thing on the card and it answers a question that
 * is settled. What replaces it has to be quieter *and* still true — hence
 * both halves below: the figure goes, and the sentence that goes in its
 * place says what happened rather than nothing.
 */
describe('M1 — a trip whose packing is finished (FR-5.10)', () => {
  function seedActiveTrip(row: Record<string, unknown> = {}) {
    useTripStore().applyChange({
      seq: 0,
      table: TABLE.trips,
      id: 't1',
      deleted: false,
      row: { name: 'Samedan', year: 2026, status: 'active', ...row },
    })
  }

  it('keeps the packing figure while the packing is open', async () => {
    seedActiveTrip()

    const page = mountPage()
    await flushPromises()

    expect(page.find('[data-testid="hero-progress"]').exists()).toBe(true)
    expect(page.find('[data-testid="hero-done"]').exists()).toBe(false)
  })

  it('replaces the figure with one quiet line once it is closed', async () => {
    seedActiveTrip({ packing_closed_at: '2026-09-20T18:40:00.000Z' })

    const page = mountPage()
    await flushPromises()

    expect(page.find('[data-testid="hero-progress"]').exists()).toBe(false)
    const done = page.find('[data-testid="hero-done"]')
    expect(done.exists()).toBe(true)
    expect(done.text()).toBe(t('dashboard.packingDone'))
  })

  it('does the same on the cards below the hero', async () => {
    // The hero is the soonest *dated* departure (FR-21.13), so Samedan is the
    // hero and Elba — undated, still packing open — is a card below it.
    seedActiveTrip({ start_date: '2026-10-01' })
    useTripStore().applyChange({
      seq: 1,
      table: TABLE.trips,
      id: 't2',
      deleted: false,
      row: {
        name: 'Elba',
        year: 2026,
        status: 'active',
        packing_closed_at: '2026-09-20T18:40:00.000Z',
      },
    })

    const page = mountPage()
    await flushPromises()

    expect(page.find('[data-testid="dashboard-summary-Elba"]').exists()).toBe(false)
    expect(page.find('[data-testid="dashboard-done-Elba"]').text()).toBe(t('dashboard.packingDone'))
    // The hero's own figure is untouched: its packing is still open, and the
    // rule is about the trip, not about the screen.
    expect(page.find('[data-testid="hero-progress"]').exists()).toBe(true)
  })
})

/**
 * FR-7.9 decision 1/2 — the one deliberate exception to "M1 takes no
 * actions". `identityStub`'s `fetchMe` answers `u1`, so a note authored by
 * anyone else is new; one authored by `u1` itself is mine.
 */
describe('M1 — the Neue Notizen card (FR-7.9)', () => {
  function seedActiveTrip(id: string, name: string) {
    useTripStore().applyChange({
      seq: 0,
      table: TABLE.trips,
      id,
      deleted: false,
      row: { name, year: 2026, status: 'active' },
    })
  }

  function seedNote(id: string, tripId: string, authorId: string, body: string) {
    useTripStore().applyChange({
      seq: 0,
      table: TABLE.comments,
      id,
      deleted: false,
      row: { trip_id: tripId, trip_item_id: null, author_id: authorId, body, is_task: 0 },
    })
  }

  it('lists a note by someone else, naming its trip', async () => {
    seedActiveTrip('t1', 'Samedan')
    seedNote('note-1', 't1', 'u2', 'Schlüsselfach: 4711')

    const page = mountPage()
    await flushPromises()

    const card = page.find('[data-testid="dashboard-notes"]')
    expect(card.exists()).toBe(true)
    expect(card.text()).toContain('Schlüsselfach: 4711')
    expect(card.text()).toContain('Samedan')
  })

  it('never lists my own note (decision 4)', async () => {
    seedActiveTrip('t1', 'Samedan')
    seedNote('note-1', 't1', 'u1', 'Schlüsselfach: 4711')

    const page = mountPage()
    await flushPromises()

    expect(page.find('[data-testid="dashboard-notes"]').exists()).toBe(false)
  })

  it('ticks a note from the card’s own control', async () => {
    seedActiveTrip('t1', 'Samedan')
    seedNote('note-1', 't1', 'u2', 'Schlüsselfach: 4711')

    const page = mountPage()
    await flushPromises()

    await page
      .get('[data-testid="dashboard-note-tick-note-1"]')
      .trigger('ionChange', { detail: { checked: true } })

    // The client's actor placeholder, like every write of an identity
    // column the server stamps (invariant 3) — never the real myUserId.
    // No existing ack row yet (null) — the caller decides insert vs. upsert
    // from it, the same seam M25's own tick uses.
    expect(orchestratorFake.toggleNoteTick).toHaveBeenCalledWith(
      't1',
      'note-1',
      CLIENT_ACTOR_PLACEHOLDER,
      null,
    )
  })
})
