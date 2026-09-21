// @vitest-environment jsdom
/**
 * M25 — a trip's tasks on a screen of their own (FR-7.7).
 *
 * What this pins is the screen's half of „one list in the data, two windows
 * on it": both kinds of task appear here, split by the phase they are due in;
 * the composer writes into the section it stands in; the crossing can be made
 * by hand and taken back; and the chip narrows the list to what is yours,
 * where there is anybody to be.
 *
 * The rules themselves are pure and tested without a screen
 * (`domain/__tests__/tripTodos.spec.ts`, `lib/__tests__/taskFacts.spec.ts`).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { IonInput } from '@ionic/vue'
import { flushPromises, mount } from '@vue/test-utils'
import { RouterLinkStub } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

import TripTasksPage from '../TripTasksPage.vue'
import TripTaskSheet from '@/components/trips/TripTaskSheet.vue'
import TripTodoList from '@/components/trips/TripTodoList.vue'
import { identityStub } from '@/composables/__tests__/identityStub'
import { tripScreenStub } from '@/composables/__tests__/tripScreenStub'
import { ORCHESTRATOR } from '@/composables/useOrchestrator'
import type { RowUndo } from '@/composables/useRowUndo'
import { useTripStore } from '@/stores/tripStore'
import { TABLE } from '@/types/tables'

vi.mock('@/composables/useHeaderTitle', () => ({ setHeaderTitle: vi.fn() }))

const tripScreen = tripScreenStub()

/** The people the instance knows — two, so a task can be handed over (G-8). */
const people = [
  { user_id: 'u-andy', display_name: 'Andy' },
  { user_id: 'u-sia', display_name: 'Sia' },
]

const acts = {
  addTripTodo: vi.fn(() => 'new-task'),
  deleteTripTodo: vi.fn(),
  resolveTripTodo: vi.fn(),
  reopenTripTodo: vi.fn(),
  resolvePrepTodo: vi.fn(),
  reopenPrepTodo: vi.fn(),
  assignTripTodo: vi.fn(),
  assignPrepTodo: vi.fn(),
  setTaskPhase: vi.fn(),
}

function mountPage() {
  return mount(TripTasksPage, {
    props: { tripId: 't1' },
    global: {
      provide: {
        [ORCHESTRATOR]: {
          ...identityStub(),
          fetchUsers: async () => people,
          fetchMe: async () => ({
            user_id: 'u-andy',
            display_name: 'Andy',
            is_instance_admin: false,
          }),
          ...tripScreen,
          ...acts,
        },
      },
      // The real `ion-modal` renders an empty element under jsdom, so the
      // sheet's content would be unreachable — the stub every sheet spec uses.
      stubs: { RouterLink: RouterLinkStub, SheetModal: { template: '<div><slot /></div>' } },
    },
  })
}

function seedTrip(members: string[] = ['u-andy', 'u-sia']) {
  const trips = useTripStore()
  trips.applyChange({
    seq: 0,
    table: TABLE.trips,
    id: 't1',
    deleted: false,
    row: { name: 'Samedan', year: 2026, status: 'active' },
  })
  for (const [i, userId] of members.entries()) {
    trips.applyChange({
      seq: 0,
      table: TABLE.tripMembers,
      id: `mem-${i}`,
      deleted: false,
      row: { trip_id: 't1', user_id: userId, role: i === 0 ? 'owner' : 'member' },
    })
  }
  return trips
}

/** One packing row, so a preparation has something to hang off. */
function seedRow(id: string, name: string) {
  useTripStore().applyChange({
    seq: 0,
    table: TABLE.tripItems,
    id,
    deleted: false,
    row: { trip_id: 't1', name, quantity: 1, packed_count: 0, state: 'open', mode: 'pack' },
  })
}

function seedTask(id: string, row: Record<string, unknown>) {
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
      phase: 'before',
      body: id,
      ...row,
    },
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  tripScreen.loadedTrips.clear()
  tripScreen.loadedTrips.add('t1')
})

describe('M25 — the two phases of a trip (FR-7.7)', () => {
  /*
   * The salve and the station are the owner's own two examples, and they are
   * the two phases: one you meant to do before leaving, one that can only
   * happen once you are there.
   */
  it('splits the list by phase, both kinds of task in either', async () => {
    seedTrip()
    seedRow('ti-1', 'Kulturbeutel')
    seedTask('Salbe holen', { trip_item_id: 'ti-1' })
    seedTask('Zugverbindung abklären', { phase: 'during' })
    seedTask('Pflanzen giessen', {})

    const page = mountPage()
    await flushPromises()

    const before = page.get('[data-testid="m25-before"]').text()
    const during = page.get('[data-testid="m25-during"]').text()
    expect(before).toContain('Salbe holen')
    expect(before).toContain('Pflanzen giessen')
    expect(during).toContain('Zugverbindung abklären')
    expect(during).not.toContain('Salbe holen')
  })

  /*
   * A task written before FR-7.7 carries no phase. It reads as one for before
   * the trip rather than falling out of both sections, which is the one way
   * this screen could lose a task outright.
   */
  it('shows a task that never named a phase under the first section', async () => {
    seedTrip()
    seedTask('Salbe holen', { phase: null })

    const page = mountPage()
    await flushPromises()

    expect(page.get('[data-testid="m25-before"]').text()).toContain('Salbe holen')
  })

  it('writes what is typed into a section as a task of that section’s phase', async () => {
    seedTrip()
    const page = mountPage()
    await flushPromises()

    const during = page.findAllComponents(TripTodoList)[1]!
    await during.findComponent(IonInput).setValue('Zugverbindung abklären')
    await during.get('[data-testid="trip-todo-add"]').trigger('click')

    expect(acts.addTripTodo).toHaveBeenCalledWith(
      't1',
      expect.any(String),
      'Zugverbindung abklären',
      'during',
    )
  })

  it('says so where a section is empty, rather than leaving a gap', async () => {
    seedTrip()
    seedTask('Salbe holen', {})

    const page = mountPage()
    await flushPromises()

    expect(page.get('[data-testid="m25-during"]').text()).toContain('Nothing noted')
  })

  /*
   * A trip with no tasks keeps both sections and both fields. An empty state
   * covering the screen would be a dead end on the one screen that writes
   * tasks — the two composers are exactly what that reader needs.
   */
  it('keeps both sections and their fields on a trip with no tasks at all', async () => {
    seedTrip()

    const page = mountPage()
    await flushPromises()

    expect(page.findAll('[data-testid="trip-todo-input"]')).toHaveLength(2)
    expect(page.get('[data-testid="m25-before"]').text()).toContain('Nothing left to do')
  })
})

describe('M25 — the crossing by hand (FR-7.7)', () => {
  it('moves a task to the other phase, and takes it back whole', async () => {
    seedTrip()
    seedTask('Salbe holen', {})

    const page = mountPage()
    await flushPromises()
    await page.get('[data-testid="trip-todo-open-Salbe holen"]').trigger('click')
    await flushPromises()

    page.findComponent(TripTaskSheet).vm.$emit('move', 'during')
    await flushPromises()

    expect(acts.setTaskPhase).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ id: 'Salbe holen' }),
      'during',
    )

    // One snackbar, one undo — and it writes back the phase the task actually
    // had, which for a task written before FR-7.7 is no phase at all.
    acts.setTaskPhase.mockClear()
    ;(page.vm as unknown as { rowUndo: RowUndo }).rowUndo.undo()
    expect(acts.setTaskPhase).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ id: 'Salbe holen' }),
      'before',
    )
  })

  /*
   * The sheet is where the facts that do not fit a line live — and where a
   * preparation is *not* offered a delete, because it is removed on the row
   * it prepares.
   */
  it('shows both stamps on the sheet, and offers no delete for a preparation', async () => {
    seedTrip()
    seedRow('ti-1', 'Kamera')
    seedTask('Akkus laden', {
      trip_item_id: 'ti-1',
      task_state: 'resolved',
      created_at: '2026-09-20T14:32:00',
      resolved_at: '2026-09-21T09:15:00',
      resolved_by_user_id: 'u-sia',
    })

    const page = mountPage()
    await flushPromises()
    await page.get('[data-testid="trip-todos-resolved"]').trigger('click')
    await page.get('[data-testid="trip-todo-open-Akkus laden"]').trigger('click')
    await flushPromises()

    const sheet = page.findComponent(TripTaskSheet)
    expect(sheet.get('[data-testid="task-sheet-created"]').text()).toContain('Andy')
    expect(sheet.get('[data-testid="task-sheet-resolved"]').text()).toContain('Sia')
    expect(sheet.get('[data-testid="task-sheet-item"]').text()).toContain('Kamera')
    expect(sheet.find('[data-testid="task-sheet-remove"]').exists()).toBe(false)
  })
})

describe('M25 — whose task it is (FR-7.5/FR-7.7)', () => {
  it('narrows the list to what is yours, and gives it back', async () => {
    seedTrip()
    seedTask('Salbe holen', { assignee_user_id: 'u-andy' })
    seedTask('Pflanzen giessen', { assignee_user_id: 'u-sia' })

    const page = mountPage()
    await flushPromises()
    await page.get('[data-testid="m25-mine"]').trigger('click')

    expect(page.get('[data-testid="m25-before"]').text()).toContain('Salbe holen')
    expect(page.get('[data-testid="m25-before"]').text()).not.toContain('Pflanzen giessen')

    await page.get('[data-testid="m25-mine"]').trigger('click')
    expect(page.get('[data-testid="m25-before"]').text()).toContain('Pflanzen giessen')
  })

  /*
   * G-8: with nobody to hand a task to, „mine" is a filter for a distinction
   * that does not exist — every task is everybody's.
   */
  it('offers no chip where the trip has nobody else', async () => {
    seedTrip(['u-andy'])
    seedTask('Salbe holen', {})

    const page = mountPage()
    await flushPromises()

    expect(page.find('[data-testid="m25-mine"]').exists()).toBe(false)
  })

  /*
   * FR-7.7 reverses FR-7.5's exclusion: a preparation is somebody's job too,
   * and it is written through the action that owns that kind of row.
   */
  it('hands a preparation to somebody through the preparation’s own writer', async () => {
    seedTrip()
    seedRow('ti-1', 'Kamera')
    seedTask('Akkus laden', { trip_item_id: 'ti-1' })

    const page = mountPage()
    await flushPromises()

    expect(page.find('[data-testid="trip-todo-assign-Akkus laden"]').exists()).toBe(true)
  })
})
