// @vitest-environment jsdom
/**
 * M14 review assistant — the list semantics FR-27.11 promises the user:
 * every proposal visible at once with an open count, a groups-only
 * target picker, applied and skipped rows staying in place marked, and
 * "never ask again" persisting the item–group pair.
 *
 * A component test rather than e2e, deliberately: reaching a flagged
 * archived trip in the browser needs the planning→active transition,
 * which no UI ships yet (see dev-docs/e2e-tests.md, M12 entry). The
 * e2e unit covers what is reachable; the list semantics live here.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

import ReviewPage from '../ReviewPage.vue'
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'
import { isDismissed } from '@/local/reviewDismissals'

vi.mock('@/composables/useHeaderTitle', () => ({ setHeaderTitle: vi.fn() }))

const TODAY = '2026-01-15'

const orchestratorFake = {
  applyReviewProposal: vi.fn(() => 'g1'),
  today: () => TODAY,
}

function seedMaster() {
  const master = useMasterStore()
  master.applyChange({
    seq: 0,
    table: 'templates',
    id: 'g1',
    deleted: false,
    row: { owner_id: 'me', name: 'Fotografie', kind: 'group' },
  })
  master.applyChange({
    seq: 0,
    table: 'templates',
    id: 'g2',
    deleted: false,
    row: { owner_id: 'me', name: 'Extras', kind: 'group' },
  })
  master.applyChange({
    seq: 0,
    table: 'templates',
    id: 'v1',
    deleted: false,
    row: { owner_id: 'me', name: 'Sommerferien', kind: 'template' },
  })
  master.applyChange({
    seq: 0,
    table: 'items',
    id: 'item1',
    deleted: false,
    row: { name: 'Stativ' },
  })
  master.applyChange({
    seq: 0,
    table: 'template_items',
    id: 'g1-item-1',
    deleted: false,
    row: {
      template_id: 'g1',
      item_id: 'item1',
      quantity: 1,
      assignment: 'trip_global',
      dedup: 'max',
      default_mode: 'pack',
      late_packer: 0,
    },
  })
  return master
}

function seedTrip() {
  const trips = useTripStore()
  trips.applyChange({
    seq: 0,
    table: 'trips',
    id: 't1',
    deleted: false,
    row: { name: 'Samedan', status: 'archived', end_date: '2026-08-10' },
  })
  // Unused: came from group g1. Missing: ad-hoc, so it defaults to the
  // dominant group — g1, the only provenance the trip has.
  trips.applyChange({
    seq: 0,
    table: 'trip_items',
    id: 'ti1',
    deleted: false,
    row: {
      trip_id: 't1',
      name: 'Stativ',
      quantity: 1,
      source_item_id: 'item1',
      source_template_id: 'g1',
      flag_unused: 1,
    },
  })
  trips.applyChange({
    seq: 0,
    table: 'trip_items',
    id: 'ti2',
    deleted: false,
    row: { trip_id: 't1', name: 'Moskitonetz', quantity: 1, flag_missing: 1 },
  })
  return trips
}

function mountPage() {
  return mount(ReviewPage, {
    props: { tripId: 't1' },
    global: { provide: { orchestrator: orchestratorFake } },
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  localStorage.clear()
})

describe('ReviewPage (M14, FR-27.11)', () => {
  it('renders every proposal as a list with an open count — not one card at a time', () => {
    seedMaster()
    seedTrip()

    const wrapper = mountPage()

    const rows = wrapper.findAll('[data-testid="m14-row"]')
    expect(rows).toHaveLength(2)
    expect(wrapper.get('[data-testid="m14-open-count"]').text()).toContain('2')
  })

  it('offers groups only in the target picker, never a Ferien-Vorlage', () => {
    seedMaster()
    seedTrip()

    const wrapper = mountPage()

    const options = wrapper
      .findAll('[data-testid="m14-row"]')[1]!
      .findAll('ion-select-option')
      .map((o) => o.text())
    expect(options).toContain('Fotografie')
    expect(options).toContain('Extras')
    expect(options).not.toContain('Sommerferien')
  })

  it('an unused row can only move between groups that carry the item', () => {
    seedMaster()
    seedTrip()

    const wrapper = mountPage()

    // Row 0 is the unused Stativ; only g1 contains item1.
    const options = wrapper
      .findAll('[data-testid="m14-row"]')[0]!
      .findAll('ion-select-option')
      .map((o) => o.text())
    expect(options).toEqual(['Fotografie'])
  })

  it('apply writes to the row target and the row stays visible, marked', async () => {
    seedMaster()
    seedTrip()

    const wrapper = mountPage()
    await wrapper.findAll('[data-testid="m14-apply"]')[0]!.trigger('click')

    expect(orchestratorFake.applyReviewProposal).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'unused', itemId: 'item1' }),
      'g1',
    )
    const rows = wrapper.findAll('[data-testid="m14-row"]')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.get('[data-testid="m14-state"]').text()).toContain('applied')
    // The footer counts what was written; the open count drops.
    const summary = wrapper.get('[data-testid="m14-summary"]').text()
    expect(summary).toContain('1')
    // FR-27.4 has been an *offer* since 2026-08-18: a trip following the
    // group is asked on its next open and may decline. The footer said
    // planning trips "pick it up immediately", which is the pre-revision
    // model — a promise the app does not keep.
    expect(summary).not.toMatch(/immediately|sofort/i)
    expect(wrapper.get('[data-testid="m14-open-count"]').text()).toContain('1')
  })

  it('skip marks the row in place without writing anything', async () => {
    seedMaster()
    seedTrip()

    const wrapper = mountPage()
    await wrapper.findAll('[data-testid="m14-skip"]')[0]!.trigger('click')

    expect(orchestratorFake.applyReviewProposal).not.toHaveBeenCalled()
    expect(wrapper.findAll('[data-testid="m14-row"]')).toHaveLength(2)
    expect(wrapper.get('[data-testid="m14-state"]').text()).toContain('skipped')
  })

  it('"never ask again" removes the row and persists the item–group pair only', async () => {
    seedMaster()
    seedTrip()

    const wrapper = mountPage()
    await wrapper.findAll('[data-testid="m14-never"]')[0]!.trigger('click')

    expect(wrapper.findAll('[data-testid="m14-row"]')).toHaveLength(1)
    expect(isDismissed('item1::g1')).toBe(true)
    // Pair-scoped, not item-global (UI-Spec M14 decision).
    expect(isDismissed('item1::g2')).toBe(false)
  })

  it('states the FR-27.4 blast radius when the target group reaches a trip that still follows it', () => {
    seedMaster()
    const trips = seedTrip()
    trips.applyChange({
      seq: 0,
      table: 'trips',
      id: 't2',
      deleted: false,
      row: { name: 'Engadin 2027', status: 'planning', end_date: '2027-08-10' },
    })
    trips.applyChange({
      seq: 0,
      table: 'trip_items',
      id: 'ti3',
      deleted: false,
      row: {
        trip_id: 't2',
        name: 'Stativ',
        quantity: 1,
        source_item_id: 'item1',
        source_template_id: 'g1',
      },
    })

    const wrapper = mountPage()

    const blasts = wrapper.findAll('[data-testid="m14-blast"]')
    expect(blasts.length).toBeGreaterThan(0)
    expect(blasts[0]!.text()).toContain('1')
  })

  it('shows the empty state when there is nothing to review', () => {
    seedMaster()
    const trips = useTripStore()
    trips.applyChange({
      seq: 0,
      table: 'trips',
      id: 't1',
      deleted: false,
      row: { name: 'Samedan', status: 'archived', end_date: '2026-08-10' },
    })

    const wrapper = mountPage()

    expect(wrapper.find('[data-testid="m14-row"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="m14-empty"]').exists()).toBe(true)
  })
})
