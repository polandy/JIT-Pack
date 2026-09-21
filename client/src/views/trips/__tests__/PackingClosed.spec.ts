// @vitest-environment jsdom
/**
 * FR-5.10 on M4 — finishing the packing, and what a finished list still does.
 *
 * Three promises, each of which the screen could break silently:
 *
 *  - the ⋮ offers the step while it is available and stops offering it once
 *    it has been taken (a second close would re-decide rows nobody touched);
 *  - the finished list *says* so, with the moment, and carries the way back;
 *  - the list stays workable, and a row typed onto it lands **packed** — the
 *    owner's case (2026-09-20) is a thing that travelled and was never
 *    listed, not the one open job on an otherwise finished trip.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

import PackingListPage from '../PackingListPage.vue'
import QuickAddItem from '@/components/global/QuickAddItem.vue'
import ClosePackingSheet from '@/components/trips/ClosePackingSheet.vue'
import { useTripStore } from '@/stores/tripStore'
import { TABLE } from '@/types/tables'
import { t } from '@/i18n'
import type { HeaderAction } from '@/composables/useHeaderActions'
import type { RowUndo } from '@/composables/useRowUndo'

import { identityStub } from '@/composables/__tests__/identityStub'
import { tripScreenStub } from '@/composables/__tests__/tripScreenStub'
import { ORCHESTRATOR } from '@/composables/useOrchestrator'
import { setHeaderActions } from '@/composables/useHeaderActions'

vi.mock('@/composables/useHeaderTitle', () => ({ setHeaderTitle: vi.fn() }))
vi.mock('@/composables/useHeaderActions', () => ({ setHeaderActions: vi.fn() }))
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useRoute: () => ({ query: {}, params: {} }),
}))

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
  setViewing: vi.fn(),
  holdsClaim: vi.fn(() => false),
  isLockedByOther: vi.fn(() => false),
  lockHolder: vi.fn(() => null),
  // FR-7.7: the action reports the rows it decided *and* the tasks it moved.
  closePacking: vi.fn(() => ({ rows: [], tasks: [] }) as { rows: unknown[]; tasks: unknown[] }),
  reopenPacking: vi.fn(),
  restorePackingClose: vi.fn(),
  addDecidedItem: vi.fn(() => ({ id: 'new-1', companions: [] })),
  setTravelerAssignment: vi.fn(() => ({ id: 'new-1', companions: [] })),
  removeAddedItem: vi.fn(),
  // Read by the app bar's getter, not by anything under test here.
  inventoryRenamesOf: vi.fn(() => []),
}

const CLOSED_AT = '2026-09-20T18:40:00.000Z'

function seedTrip(trip: Record<string, unknown> = {}, rows: Record<string, unknown>[] = []) {
  const trips = useTripStore()
  trips.applyChange({
    seq: 0,
    table: TABLE.trips,
    id: 't1',
    deleted: false,
    row: { name: 'Samedan', year: 2026, status: 'active', ...trip },
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
  tripScreen.loadedTrips.add('t1')
  return trips
}

/** FR-7.7: one task of the trip itself, open and due before it. */
function seedTask(task: Record<string, unknown>) {
  useTripStore().applyChange({
    seq: 0,
    table: TABLE.comments,
    id: String(task['id']),
    deleted: false,
    row: {
      trip_id: 't1',
      trip_item_id: null,
      author_id: 'u-andy',
      is_task: 1,
      task_state: 'open',
      phase: 'before',
      ...task,
    },
  })
}

function mountPage() {
  return mount(PackingListPage, {
    props: { tripId: 't1' },
    global: {
      provide: { [ORCHESTRATOR]: orchestratorFake },
      // The real `ion-modal` renders an empty element under jsdom, so a
      // sheet's content would be unreachable — the stub the tag sheets use.
      stubs: { SheetModal: { template: '<div><slot /></div>' } },
    },
  })
}

/** The app bar's actions, as the frame would read them (they are a getter). */
function headerActions(): HeaderAction[] {
  const calls = vi.mocked(setHeaderActions).mock.calls
  const getter = calls.at(-1)?.[0]
  return getter ? getter() : []
}

const actionIds = () => headerActions().map((action) => action.id)

beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }) as unknown as typeof window.matchMedia

  setActivePinia(createPinia())
  vi.clearAllMocks()
  tripScreen.loadedTrips.clear()
})

describe('M4 — finishing the packing (FR-5.10)', () => {
  it('offers the step while the packing is open', async () => {
    seedTrip({}, [{ name: 'Regenjacke' }])

    mountPage()
    await flushPromises()

    expect(actionIds()).toContain('m4-close-packing')
    expect(headerActions().find((action) => action.id === 'm4-close-packing')?.label).toBe(
      t('packing.closeAction'),
    )
  })

  it('offers it on a list with nothing left open — a finished list is what gets declared finished', async () => {
    seedTrip({}, [{ name: 'Zelt', packed_count: 1, state: 'packed' }])

    mountPage()
    await flushPromises()

    expect(actionIds()).toContain('m4-close-packing')
  })

  it('stops offering it once the packing is closed', async () => {
    seedTrip({ packing_closed_at: CLOSED_AT }, [{ name: 'Regenjacke' }])

    mountPage()
    await flushPromises()

    expect(actionIds()).not.toContain('m4-close-packing')
  })

  it('asks in a sheet, naming what a count hides', async () => {
    seedTrip({}, [
      { name: 'Regenjacke' },
      { name: 'Wandersocken', quantity: 6, packed_count: 4, state: 'partial' },
      { name: 'Stirnlampe', late_packer: 1 },
    ])

    const page = mountPage()
    await flushPromises()
    await headerActions()
      .find((action) => action.id === 'm4-close-packing')
      ?.onClick?.()
    await flushPromises()

    const sheet = page.findComponent(ClosePackingSheet)
    expect(sheet.exists()).toBe(true)
    expect(sheet.text()).toContain(t('packing.closeConfirmBody', { n: 3 }))
    expect(sheet.text()).toContain(t('packing.closeConfirmStarted', { n: 1 }))
    expect(sheet.text()).toContain(t('packing.closeConfirmLate', { n: 1 }))
    expect(sheet.text()).toContain(t('packing.closeConfirmVerb', { n: 3 }))
    // Asking is not writing. Without this clause the sheet would be
    // decoration over an action that had already run.
    expect(orchestratorFake.closePacking).not.toHaveBeenCalled()
  })

  it('leaves the list alone when the sheet is dismissed', async () => {
    seedTrip({}, [{ name: 'Regenjacke' }])

    const page = mountPage()
    await flushPromises()
    await headerActions()
      .find((action) => action.id === 'm4-close-packing')
      ?.onClick?.()
    await flushPromises()
    page.findComponent(ClosePackingSheet).vm.$emit('close')
    await flushPromises()

    expect(page.findComponent(ClosePackingSheet).exists()).toBe(false)
    expect(orchestratorFake.closePacking).not.toHaveBeenCalled()
  })

  it('writes the close once it is confirmed, and arms one undo for the batch', async () => {
    seedTrip({}, [{ name: 'Regenjacke' }])
    // FR-7.7: the action now reports two things it touched. One undo covers
    // both — the rows travel as the snapshot the snackbar holds, the moved
    // tasks in the closure beside it.
    const moved = [{ task: { id: 'task-1', body: 'Salbe holen' }, phase: 'before' }]
    orchestratorFake.closePacking.mockReturnValue({
      rows: [{ id: 'ti1', name: 'Regenjacke', quantity: 1, packed_count: 0, state: 'open' }],
      tasks: moved,
    })

    const page = mountPage()
    await flushPromises()
    await headerActions()
      .find((action) => action.id === 'm4-close-packing')
      ?.onClick?.()
    await flushPromises()
    page.findComponent(ClosePackingSheet).vm.$emit('confirm')
    await flushPromises()

    expect(orchestratorFake.closePacking).toHaveBeenCalledWith('t1', expect.anything())
    // The snackbar's undo is armed with the rows the action reported — the
    // same contract FR-5.5's skip has. Firing it restores exactly those.
    // The composable itself, the way QuickAddItem's spec reaches `open()`:
    // `<script setup>` exposes its bindings on the instance, and the undo is
    // not rendered anywhere a spec could tap it.
    ;(page.vm as unknown as { rowUndo: RowUndo }).rowUndo.undo()
    expect(orchestratorFake.restorePackingClose).toHaveBeenCalledWith(
      't1',
      [expect.objectContaining({ itemId: 'ti1', quantity: 1, state: 'open' })],
      moved,
    )
  })

  /*
   * FR-7.7: the question names what the close will do to the tasks, and the
   * number comes from the plan the write reads — not from a second count
   * beside it, which could say four while three move.
   */
  it('tells the reader that the open tasks move with the close', async () => {
    seedTrip({}, [{ name: 'Regenjacke' }])
    seedTask({ id: 'task-1', body: 'Salbe holen' })

    const page = mountPage()
    await flushPromises()
    await headerActions()
      .find((action) => action.id === 'm4-close-packing')
      ?.onClick?.()
    await flushPromises()

    const sheet = page.findComponent(ClosePackingSheet)
    expect(sheet.props('plan').tasks.map((task: { id: string }) => task.id)).toEqual(['task-1'])
    expect(sheet.find('[data-testid="m4-close-sheet-tasks"]').text()).toContain('1 open task')
  })
})

/**
 * FR-5.10's second door (owner, 2026-09-20): *„wird es auch getriggert, wenn
 * das letzte Item gepackt wurde? das sollte es."*
 *
 * The step is offered where the moment is, not only where the menu is. What
 * needs pinning is the *shape* of that offer, because each clause below is a
 * way for it to become a nuisance instead: it is the same question, not a
 * silent write; it fires on the transition rather than on arrival at a list
 * that was already complete; and a reader who says *später* is not asked
 * again for that trip.
 */
describe('M4 — the last row packed offers the step (FR-5.10)', () => {
  /** Pack the one row the trip has, the way a pull of the write would. */
  function packLastRow() {
    const trips = useTripStore()
    trips.applyChange({
      seq: 1,
      table: TABLE.tripItems,
      id: 'ti1',
      deleted: false,
      row: {
        trip_id: 't1',
        name: 'Regenjacke',
        quantity: 1,
        packed_count: 1,
        state: 'packed',
        mode: 'pack',
      },
    })
    return flushPromises()
  }

  it('offers the step when the last open row is packed, without taking the screen', async () => {
    seedTrip({}, [{ name: 'Regenjacke' }])

    const page = mountPage()
    await flushPromises()
    expect(page.find('[data-testid="m4-close-prompt"]').exists()).toBe(false)

    await packLastRow()

    // A bar, not a modal: the first build opened the sheet here, and a sheet
    // the user did not ask for intercepts every following tap — seventeen
    // e2e flows said so at once.
    expect(page.find('[data-testid="m4-close-prompt"]').exists()).toBe(true)
    expect(page.findComponent(ClosePackingSheet).exists()).toBe(false)
    expect(orchestratorFake.closePacking).not.toHaveBeenCalled()

    // Its button asks the question, and only then.
    await page.find('[data-testid="m4-close-prompt"]').trigger('click')
    await flushPromises()
    const sheet = page.findComponent(ClosePackingSheet)
    expect(sheet.exists()).toBe(true)
    expect(sheet.text()).toContain(t('packing.closeConfirmNothing'))
  })

  it('takes the offer away when the list reopens', async () => {
    seedTrip({}, [{ name: 'Regenjacke' }])

    const page = mountPage()
    await flushPromises()
    await packLastRow()
    expect(page.find('[data-testid="m4-close-prompt"]').exists()).toBe(true)

    // Un-packed again: the bar reported a moment that is over.
    useTripStore().applyChange({
      seq: 2,
      table: TABLE.tripItems,
      id: 'ti1',
      deleted: false,
      row: {
        trip_id: 't1',
        name: 'Regenjacke',
        quantity: 1,
        packed_count: 0,
        state: 'open',
        mode: 'pack',
      },
    })
    await flushPromises()

    expect(page.find('[data-testid="m4-close-prompt"]').exists()).toBe(false)
  })

  it('does not ask when a list that was already complete arrives after the screen', async () => {
    // The real order on a cold start: M4 mounts, the partition lands a moment
    // later. Seeding before the mount (the case below) never sees it, and the
    // first build asked here — about a moment that had passed before the
    // screen was opened.
    const trips = useTripStore()
    trips.applyChange({
      seq: 0,
      table: TABLE.trips,
      id: 't1',
      deleted: false,
      row: { name: 'Samedan', year: 2026, status: 'active' },
    })
    tripScreen.loadedTrips.delete('t1')

    const page = mountPage()
    await flushPromises()

    trips.applyChange({
      seq: 1,
      table: TABLE.tripItems,
      id: 'ti1',
      deleted: false,
      row: {
        trip_id: 't1',
        name: 'Zelt',
        quantity: 1,
        packed_count: 1,
        state: 'packed',
        mode: 'pack',
      },
    })
    tripScreen.loadedTrips.add('t1')
    await flushPromises()

    expect(page.find('[data-testid="m4-close-prompt"]').exists()).toBe(false)
    expect(actionIds()).toContain('m4-close-packing')
  })

  it('does not ask on arrival at a list that was already complete', async () => {
    seedTrip({}, [{ name: 'Zelt', packed_count: 1, state: 'packed' }])

    const page = mountPage()
    await flushPromises()

    // The ⋮ still offers it. What must not happen is the app asking about a
    // moment that passed before the screen was opened.
    expect(page.find('[data-testid="m4-close-prompt"]').exists()).toBe(false)
    expect(actionIds()).toContain('m4-close-packing')
  })

  it('does not offer again once the reader has waved it away', async () => {
    seedTrip({}, [{ name: 'Regenjacke' }])

    const page = mountPage()
    await flushPromises()
    await packLastRow()
    // *Später* on the sheet is the way to wave it off.
    await page.find('[data-testid="m4-close-prompt"]').trigger('click')
    await flushPromises()
    page.findComponent(ClosePackingSheet).vm.$emit('close')
    await flushPromises()
    expect(page.find('[data-testid="m4-close-prompt"]').exists()).toBe(false)

    // A row is added and packed: the list completes a second time, and the
    // app holds its tongue. Without this the screen would ask on every tick
    // of the last box.
    const trips = useTripStore()
    trips.applyChange({
      seq: 2,
      table: TABLE.tripItems,
      id: 'ti2',
      deleted: false,
      row: {
        trip_id: 't1',
        name: 'Zahnbürste',
        quantity: 1,
        packed_count: 0,
        state: 'open',
        mode: 'pack',
      },
    })
    await flushPromises()
    trips.applyChange({
      seq: 3,
      table: TABLE.tripItems,
      id: 'ti2',
      deleted: false,
      row: {
        trip_id: 't1',
        name: 'Zahnbürste',
        quantity: 1,
        packed_count: 1,
        state: 'packed',
        mode: 'pack',
      },
    })
    await flushPromises()

    expect(page.find('[data-testid="m4-close-prompt"]').exists()).toBe(false)
  })

  it('does not offer on a trip that carries nothing but shopping rows', async () => {
    // The defect twelve e2e cases reported: a buy row is the shopping list's
    // (FR-30.2), so this trip's packing plan is empty — and an empty plan is
    // not a finished packing. The sheet put itself over M4 on trips nobody
    // had packed anything on, and every later click landed on the modal.
    seedTrip({}, [{ name: 'Brot', mode: 'buy_before' }])

    const page = mountPage()
    await flushPromises()
    // A second buy row arriving is the transition the first build fired on.
    useTripStore().applyChange({
      seq: 2,
      table: TABLE.tripItems,
      id: 'ti9',
      deleted: false,
      row: {
        trip_id: 't1',
        name: 'Sonnencreme',
        quantity: 1,
        packed_count: 0,
        state: 'open',
        mode: 'buy_local',
      },
    })
    await flushPromises()

    expect(page.find('[data-testid="m4-close-prompt"]').exists()).toBe(false)
  })

  it('does not offer when the last row was skipped rather than packed', async () => {
    seedTrip({}, [{ name: 'Drohne' }])

    const page = mountPage()
    await flushPromises()
    useTripStore().applyChange({
      seq: 2,
      table: TABLE.tripItems,
      id: 'ti1',
      deleted: false,
      row: {
        trip_id: 't1',
        name: 'Drohne',
        quantity: 0,
        packed_count: 0,
        state: 'skipped',
        mode: 'pack',
      },
    })
    await flushPromises()

    // Deciding against the last row is not finishing the packing, and the
    // offer would arrive on the back of the skip's own snackbar.
    expect(page.find('[data-testid="m4-close-prompt"]').exists()).toBe(false)
  })

  it('does not offer on a trip whose packing is already closed', async () => {
    seedTrip({ packing_closed_at: CLOSED_AT }, [{ name: 'Regenjacke' }])

    const page = mountPage()
    await flushPromises()
    await packLastRow()

    expect(page.find('[data-testid="m4-close-prompt"]').exists()).toBe(false)
  })

  it('does not ask over a list that has not arrived (ADR-033)', async () => {
    // No rows at all and the partition still in flight: „nothing is open" is
    // not a fact here, and asking would be asking about an unread list.
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
    tripScreen.loadedTrips.add('t1')
    await flushPromises()

    expect(page.findComponent(ClosePackingSheet).exists()).toBe(false)
  })
})

describe('M4 — a list whose packing is finished (FR-5.10)', () => {
  it('says so, with the moment and what was left behind', async () => {
    seedTrip({ packing_closed_at: CLOSED_AT }, [
      { name: 'Regenjacke', quantity: 0, state: 'skipped' },
      { name: 'Zelt', packed_count: 1, state: 'packed' },
    ])

    const page = mountPage()
    await flushPromises()

    const card = page.find('[data-testid="m4-packing-closed"]')
    expect(card.exists()).toBe(true)
    expect(card.text()).toContain(t('packing.closedTitle'))
    expect(page.find('[data-testid="m4-packing-closed-stamp"]').text()).toContain('1')
  })

  it('carries no card while the packing is open', async () => {
    seedTrip({}, [{ name: 'Regenjacke' }])

    const page = mountPage()
    await flushPromises()

    expect(page.find('[data-testid="m4-packing-closed"]').exists()).toBe(false)
  })

  it('reopens the packing from the card, and decides nothing by doing so', async () => {
    seedTrip({ packing_closed_at: CLOSED_AT }, [
      { name: 'Regenjacke', quantity: 0, state: 'skipped' },
    ])

    const page = mountPage()
    await flushPromises()
    await page.find('[data-testid="m4-reopen-packing"]').trigger('click')

    expect(orchestratorFake.reopenPacking).toHaveBeenCalledWith('t1')
    expect(orchestratorFake.restorePackingClose).not.toHaveBeenCalled()
  })

  it('takes an addition as something already in the bag', async () => {
    seedTrip({ packing_closed_at: CLOSED_AT }, [{ name: 'Zelt', packed_count: 1, state: 'packed' }])

    const page = mountPage()
    await flushPromises()
    page
      .findComponent(QuickAddItem)
      .vm.$emit('add', { name: 'Zahnbürste', sourceItemId: 'm-1', travelerIds: [] })
    await flushPromises()

    expect(orchestratorFake.addDecidedItem).toHaveBeenCalledWith(
      't1',
      'Zahnbürste',
      expect.anything(),
      true,
      'packed',
    )
    expect(orchestratorFake.setTravelerAssignment).not.toHaveBeenCalled()
  })

  it('takes an addition for named travelers as the plan it is', async () => {
    seedTrip({ packing_closed_at: CLOSED_AT }, [{ name: 'Zelt', packed_count: 1, state: 'packed' }])

    const page = mountPage()
    await flushPromises()
    page
      .findComponent(QuickAddItem)
      .vm.$emit('add', { name: 'Zahnbürste', sourceItemId: 'm-1', travelerIds: ['tr1'] })
    await flushPromises()

    expect(orchestratorFake.setTravelerAssignment).toHaveBeenCalled()
    expect(orchestratorFake.addDecidedItem).not.toHaveBeenCalled()
  })

  it('tells the composer what an addition will become', async () => {
    seedTrip({ packing_closed_at: CLOSED_AT }, [{ name: 'Zelt', packed_count: 1, state: 'packed' }])

    const page = mountPage()
    await flushPromises()

    expect(page.findComponent(QuickAddItem).props('addsPacked')).toBe(true)
  })
})
