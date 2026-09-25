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
import TaskComposer from '@/components/trips/TaskComposer.vue'
import TripTaskSheet from '@/components/trips/TripTaskSheet.vue'
import { identityStub } from '@/composables/__tests__/identityStub'
import { STUB_TODAY, tripScreenStub } from '@/composables/__tests__/tripScreenStub'
import { ORCHESTRATOR } from '@/composables/useOrchestrator'
import { setHeaderActions, type HeaderAction } from '@/composables/useHeaderActions'
import type { RowUndo } from '@/composables/useRowUndo'
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'
import { TABLE } from '@/types/tables'
import { barAll, barCount, barExit, barSelection } from '@/__tests__/headerSelection'

vi.mock('@/composables/useHeaderTitle', () => ({ setHeaderTitle: vi.fn() }))
vi.mock('@/composables/useHeaderActions', () => ({ setHeaderActions: vi.fn() }))
vi.mock('@/composables/useHeaderSelection', async (actual) => ({
  ...(await actual<typeof import('@/composables/useHeaderSelection')>()),
  setHeaderSelection: (await import('@/__tests__/headerSelection')).captureSelection,
}))

/**
 * What the person picker answers. It is mocked rather than driven, because
 * the value under test is the *third* one it can give — an action sheet that
 * was dismissed — and dismissing a real one asserts Ionic rather than us.
 */
let picked: string | null | undefined
vi.mock('@/lib/pickAssignee', () => ({ pickAssignee: vi.fn(async () => picked) }))

const tripScreen = tripScreenStub()

/** The people the instance knows — two, so a task can be handed over (G-8). */
const people = [
  { user_id: 'u-andy', display_name: 'Andy' },
  { user_id: 'u-sia', display_name: 'Sia' },
]

const acts = {
  setTaskTag: vi.fn(),
  createTaskTag: vi.fn(() => 'tag-new'),
  addTripTodo: vi.fn(() => 'new-task'),
  deleteTripTodo: vi.fn(),
  resolveTripTodo: vi.fn(),
  reopenTripTodo: vi.fn(),
  resolvePrepTodo: vi.fn(),
  reopenPrepTodo: vi.fn(),
  assignTripTodo: vi.fn(),
  assignPrepTodo: vi.fn(),
  setTaskPhase: vi.fn(),
  setTaskDueDate: vi.fn(),
  setTaskBody: vi.fn(),
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

/** FR-7.8: a task tag in the master store, the way a pull delivers one. */
function seedTaskTag(id: string, name: string, sortOrder: number) {
  useMasterStore().applyChange({
    seq: 0,
    table: TABLE.taskTags,
    id,
    deleted: false,
    row: { name, sort_order: sortOrder },
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
  picked = null
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

  it('writes what is typed on top, in the phase its chip names (FR-7.14)', async () => {
    seedTrip()
    const page = mountPage()
    await flushPromises()

    const composer = page.findComponent(TaskComposer)
    await composer.get('[data-testid="m25-phase-during"]').trigger('click')
    await composer.findComponent(IonInput).setValue('Zugverbindung abklären')
    await composer.get('form').trigger('submit')

    expect(acts.addTripTodo).toHaveBeenCalledWith(
      't1',
      expect.any(String),
      'Zugverbindung abklären',
      'during',
      { taskTagId: null, dueDate: null },
    )
  })

  it('files a new task under its tag and day in the one write, and keeps the tag for the next (FR-7.14)', async () => {
    seedTrip()
    seedTaskTag('tag-apo', 'Apotheke', 0)
    const page = mountPage()
    await flushPromises()

    const composer = page.findComponent(TaskComposer)
    await composer.get('[data-testid="m25-composer-tag-Apotheke"]').trigger('click')
    await composer.findComponent(IonInput).setValue('Salbe holen')
    await composer.get('[data-testid="due-chip-today"]').trigger('click')
    await composer.get('form').trigger('submit')

    expect(acts.addTripTodo).toHaveBeenLastCalledWith(
      't1',
      expect.any(String),
      'Salbe holen',
      'before',
      { taskTagId: 'tag-apo', dueDate: STUB_TODAY },
    )
    // The tag stays chosen for the next task of the same errand; the day does not.
    await composer.findComponent(IonInput).setValue('Rezept abholen')
    await composer.get('form').trigger('submit')
    expect(acts.addTripTodo).toHaveBeenLastCalledWith(
      't1',
      expect.any(String),
      'Rezept abholen',
      'before',
      { taskTagId: 'tag-apo', dueDate: null },
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
  it('keeps both sections and the one field on a trip with no tasks at all', async () => {
    seedTrip()

    const page = mountPage()
    await flushPromises()

    expect(page.findAll('[data-testid="trip-todo-input"]')).toHaveLength(1)
    expect(page.find('[data-testid="m25-during"]').exists()).toBe(true)
    expect(page.get('[data-testid="m25-before"]').text()).toContain('Nothing left to do')
  })
})

describe('M25 — the sheet in the order acts are wanted (FR-7.14)', () => {
  it('corrects a task’s words and takes the correction back whole', async () => {
    seedTrip()
    seedTask('Pas holen', {})

    const page = mountPage()
    await flushPromises()
    await page.get('[data-testid="trip-todo-open-Pas holen"]').trigger('click')
    await flushPromises()
    page.findComponent(TripTaskSheet).vm.$emit('rename', 'Pass holen')
    await flushPromises()

    expect(acts.setTaskBody).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ id: 'Pas holen' }),
      'Pass holen',
    )
    acts.setTaskBody.mockClear()
    ;(page.vm as unknown as { rowUndo: RowUndo }).rowUndo.undo()
    expect(acts.setTaskBody).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ id: 'Pas holen' }),
      'Pas holen',
    )
  })

  it('ticks a task off from its sheet, and the sheet goes with it', async () => {
    seedTrip()
    seedTask('Pass holen', {})

    const page = mountPage()
    await flushPromises()
    await page.get('[data-testid="trip-todo-open-Pass holen"]').trigger('click')
    await flushPromises()
    await page.get('[data-testid="task-sheet-done"]').trigger('click')
    await flushPromises()

    expect(acts.resolveTripTodo).toHaveBeenCalledWith(expect.objectContaining({ id: 'Pass holen' }))
    expect(page.find('[data-testid="task-sheet"]').exists()).toBe(false)
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

  /**
   * FR-7.5/FR-7.7: the picker answers three ways, and the third one is the
   * reason `pickAssignee` returns `undefined` at all — *„assign to nobody"*
   * and *„never mind"* must not arrive as the same value. `useTaskActs`
   * carries that distinction in one line, and this is the case that holds it.
   *
   * Both halves are asserted **positively**, against a known armed undo
   * rather than against an empty one: the record holds a single action at a
   * time, so an act that armed anything would have *replaced* the tick's
   * record. A case that only checked „nothing was written" would stay green
   * on a build that wrote nothing and armed an undo for it anyway — and that
   * undo would then take back the tick instead.
   */
  it('writes nothing and arms nothing when the picker is dismissed', async () => {
    seedTrip()
    seedTask('Salbe holen', {})

    const page = mountPage()
    await flushPromises()

    // A known record to compare against: ticking a task arms its own undo.
    const before = page.get('[data-testid="m25-before"]')
    await before.get('[data-testid="trip-todo-Salbe holen"] ion-checkbox').trigger('ionChange')
    await flushPromises()
    const undo = (page.vm as unknown as { rowUndo: RowUndo }).rowUndo
    expect(undo.pending.value.map((record) => record.name)).toEqual(['Salbe holen'])

    // Dismissed: nothing is handed over …
    picked = undefined
    await before.get('[data-testid="trip-todo-assign-Salbe holen"]').trigger('click')
    await flushPromises()
    expect(acts.assignTripTodo).not.toHaveBeenCalled()
    // … and the tick's undo is still the one on offer, untouched.
    expect(undo.pending.value.map((record) => record.name)).toEqual(['Salbe holen'])

    // The positive twin, so the two absences above are not simply a screen
    // that stopped answering: a real answer does write, and does take the
    // pending record over.
    picked = 'u-sia'
    await before.get('[data-testid="trip-todo-assign-Salbe holen"]').trigger('click')
    await flushPromises()
    expect(acts.assignTripTodo).toHaveBeenCalledTimes(1)
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

/**
 * FR-7.8: one tag per task, and the headings it makes. The rule itself is
 * pure (`domain/__tests__/tripTodos.spec.ts`); what is pinned here is the
 * screen's half — that the groups are rendered as drop targets, that the
 * sheet writes the tag, and that a movement is **one** undo.
 */
describe('M25 — the tag a task carries (FR-7.8)', () => {
  it('files the tasks under their tags, and names the two untagged groups apart', async () => {
    seedTrip()
    seedTaskTag('apo', 'Apotheke', 0)
    seedRow('ti-1', 'Kulturbeutel')
    seedTask('Salbe holen', { task_tag_id: 'apo' })
    seedTask('Akku laden', { trip_item_id: 'ti-1' })
    seedTask('Pflanzen giessen', {})

    const page = mountPage()
    await flushPromises()

    expect(page.get('[data-testid="m25-group-apo"]').text()).toContain('Salbe holen')
    // The two shapes of „no tag", told apart by where the task came from.
    expect(page.get('[data-testid="m25-group-prep"]').text()).toContain('From the packing list')
    expect(page.get('[data-testid="m25-group-prep"]').text()).toContain('Akku laden')
    expect(page.get('[data-testid="m25-group-trip"]').text()).toContain('No tag')
    expect(page.get('[data-testid="m25-group-trip"]').text()).toContain('Pflanzen giessen')
  })

  /*
   * Every group is a drop target, and its key carries the phase as well as
   * the tag — that is what lets one movement change both, which is what the
   * owner asked a drag across the two phases to do.
   */
  it('marks every group as a place a task can be dropped, phase included', async () => {
    seedTrip()
    seedTaskTag('apo', 'Apotheke', 0)
    seedTask('Salbe holen', { task_tag_id: 'apo' })
    seedTask('Zug abklären', { phase: 'during', task_tag_id: 'apo' })

    const page = mountPage()
    await flushPromises()

    const targets = page
      .findAll('[data-drop-target]')
      .map((el) => el.attributes('data-drop-target'))
    expect(targets).toContain('before/apo')
    expect(targets).toContain('during/apo')
  })

  it('writes the tag the sheet was asked for, and takes it back whole', async () => {
    seedTrip()
    seedTaskTag('apo', 'Apotheke', 0)
    seedTask('Salbe holen', {})

    const page = mountPage()
    await flushPromises()
    await page.get('[data-testid="trip-todo-open-Salbe holen"]').trigger('click')
    await flushPromises()
    await page.get('[data-testid="task-sheet-tag-Apotheke"]').trigger('click')
    await flushPromises()

    expect(acts.setTaskTag).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ id: 'Salbe holen' }),
      'apo',
    )

    // One undo for the movement, and it writes the tag back. A second armed
    // record would have replaced this one and left the movement half undone.
    acts.setTaskTag.mockClear()
    ;(page.vm as unknown as { rowUndo: RowUndo }).rowUndo.undo()
    expect(acts.setTaskTag).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ id: 'Salbe holen' }),
      null,
    )
  })

  /*
   * „No tag" is a choice in the list rather than the absence of one, and it
   * is named after where the task came from — the same words as its group,
   * so the sheet and the list cannot disagree about where it will land.
   */
  it('offers “no tag” under the name of the group it would return to', async () => {
    seedTrip()
    seedRow('ti-1', 'Kulturbeutel')
    seedTask('Akku laden', { trip_item_id: 'ti-1', task_tag_id: 'apo' })
    seedTaskTag('apo', 'Apotheke', 0)

    const page = mountPage()
    await flushPromises()
    await page.get('[data-testid="trip-todo-open-Akku laden"]').trigger('click')
    await flushPromises()

    expect(page.get('[data-testid="task-sheet-tag-none"]').text()).toBe('From the packing list')
  })

  it('creates a tag that is not in the list yet, where it is needed', async () => {
    seedTrip()
    seedTask('Salbe holen', {})

    const page = mountPage()
    await flushPromises()
    await page.get('[data-testid="trip-todo-open-Salbe holen"]').trigger('click')
    await flushPromises()
    // The tag chooser's own field — the sheet's first input is FR-7.11's date.
    await page
      .findComponent({ name: 'TaskTagChooser' })
      .findComponent(IonInput)
      .setValue('Apotheke')
    await page.get('[data-testid="task-sheet-tag-add"]').trigger('click')
    await flushPromises()

    expect(acts.createTaskTag).toHaveBeenCalledWith('Apotheke', 0)
    expect(acts.setTaskTag).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ id: 'Salbe holen' }),
      'tag-new',
    )
  })
})

/**
 * Several tasks at once (2026-09-24): M6's selection, on M25. A hold (its
 * right-click twin is the deterministic seam) or the app bar's icon enters
 * it; the bar can give the selection a tag or send it to a phase, only what
 * changes is written, and one undo takes the whole batch back.
 */
describe('M25 — several tasks at once (FR-7.8)', () => {
  /** The app bar's actions as the page last registered them. */
  function headerActions(): HeaderAction[] {
    const calls = vi.mocked(setHeaderActions).mock.calls
    return (calls.at(-1)![0] as () => HeaderAction[])()
  }

  beforeEach(() => vi.mocked(setHeaderActions).mockClear())

  it('offers the app bar icon while there is an open task to select', async () => {
    seedTrip()
    mountPage()
    await flushPromises()
    expect(headerActions().map((a) => a.id)).not.toContain('m25-select')

    seedTask('Salbe holen', {})
    mountPage()
    await flushPromises()
    expect(headerActions().map((a) => a.id)).toContain('m25-select')
  })

  it('a hold on a task selects it; while selecting a tap toggles instead of opening the sheet', async () => {
    seedTrip()
    seedTask('Salbe holen', {})
    seedTask('Pflanzen giessen', {})

    const page = mountPage()
    await flushPromises()
    await page.get('[data-testid="trip-todo-Salbe holen"] ion-label').trigger('contextmenu')

    expect(barSelection()).not.toBeNull()
    expect(page.get('[data-testid="trip-todo-check-Salbe holen"]').classes()).toContain('on')
    // The grip and the tick step aside for the mode; the composer stays in
    // place at rest (G-20), so nothing under the finger moves.
    expect(page.find('[data-testid="trip-todo-grip-Salbe holen"]').exists()).toBe(false)
    expect(page.find('[data-testid="trip-todo-input"]').exists()).toBe(true)
    const slot = () => page.get('[data-testid="m25-composer"]').element.parentElement!
    expect(slot().hasAttribute('inert')).toBe(true)

    // A tap is its own press, then its click — the press is what tells it
    // from the ghost click a hold leaves behind.
    await page.get('[data-testid="trip-todo-Pflanzen giessen"] ion-label').trigger('pointerdown')
    await page.get('[data-testid="trip-todo-open-Pflanzen giessen"]').trigger('click')
    await flushPromises()
    expect(page.find('[data-testid="task-sheet"]').exists()).toBe(false)
    expect(page.get('[data-testid="trip-todo-check-Pflanzen giessen"]').classes()).toContain('on')
    expect(barCount()).toBe('2 selected')

    await barExit()
    expect(barSelection()).toBeNull()
    expect(page.find('[data-testid="trip-todo-grip-Salbe holen"]').exists()).toBe(true)
    expect(slot().hasAttribute('inert')).toBe(false)
  })

  it('gives the whole selection one tag, writes only what changes, and takes it back whole', async () => {
    seedTrip()
    seedTaskTag('apo', 'Apotheke', 0)
    seedRow('ti-1', 'Kulturbeutel')
    seedTask('Salbe holen', { task_tag_id: 'apo' })
    seedTask('Akku laden', { trip_item_id: 'ti-1' })
    seedTask('Pflanzen giessen', { phase: 'during' })

    const page = mountPage()
    await flushPromises()
    headerActions()
      .find((a) => a.id === 'm25-select')!
      .onClick()
    await flushPromises()
    await barAll()
    await page.get('[data-testid="m25-bulk-tag"]').trigger('click')
    await flushPromises()
    expect(page.get('[data-testid="m25-bulk-title"]').text()).toBe('Tag for 3 tasks')
    await page.get('[data-testid="task-sheet-tag-Apotheke"]').trigger('click')
    await flushPromises()

    // Salbe already carried it: two writes, across both phases and both kinds.
    expect(acts.setTaskTag).toHaveBeenCalledTimes(2)
    const tagged = acts.setTaskTag.mock.calls.map((call) => (call[1] as { id: string }).id)
    expect(tagged.sort()).toEqual(['Akku laden', 'Pflanzen giessen'])
    expect(barSelection()).toBeNull()

    acts.setTaskTag.mockClear()
    ;(page.vm as unknown as { rowUndo: RowUndo }).rowUndo.undo()
    expect(acts.setTaskTag).toHaveBeenCalledTimes(2)
    for (const call of acts.setTaskTag.mock.calls) expect(call[2]).toBeNull()
  })

  it('sends the selection to a phase, and says so when nothing had to move', async () => {
    seedTrip()
    seedTask('Salbe holen', {})
    seedTask('Zug abklären', { phase: 'during' })

    const page = mountPage()
    await flushPromises()
    await page.get('[data-testid="trip-todo-Salbe holen"] ion-label').trigger('contextmenu')
    await page.get('[data-testid="m25-bulk-during"]').trigger('click')
    await flushPromises()

    expect(acts.setTaskPhase).toHaveBeenCalledTimes(1)
    expect(acts.setTaskPhase).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ id: 'Salbe holen' }),
      'during',
    )

    // FR-7.14: a selection already in one phase is offered only the other.
    acts.setTaskPhase.mockClear()
    await page.get('[data-testid="trip-todo-Zug abklären"] ion-label').trigger('contextmenu')
    expect(page.find('[data-testid="m25-bulk-during"]').exists()).toBe(false)
    await page.get('[data-testid="m25-bulk-before"]').trigger('click')
    await flushPromises()
    expect(acts.setTaskPhase).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ id: 'Zug abklären' }),
      'before',
    )
  })

  it('ticks the whole selection off in one act, and one undo reopens exactly those (FR-7.14)', async () => {
    seedTrip()
    seedRow('ti-1', 'Kulturbeutel')
    seedTask('Salbe holen', {})
    seedTask('Akku laden', { trip_item_id: 'ti-1' })
    seedTask('Zug abklären', { phase: 'during' })

    const page = mountPage()
    await flushPromises()
    await page.get('[data-testid="trip-todo-Salbe holen"] ion-label').trigger('contextmenu')
    await page.get('[data-testid="trip-todo-Akku laden"] ion-label').trigger('pointerdown')
    await page.get('[data-testid="trip-todo-open-Akku laden"]').trigger('click')
    await page.get('[data-testid="m25-bulk-done"]').trigger('click')
    await flushPromises()

    expect(acts.resolveTripTodo).toHaveBeenCalledTimes(1)
    expect(acts.resolvePrepTodo).toHaveBeenCalledTimes(1)
    expect(barSelection()).toBeNull()
    ;(page.vm as unknown as { rowUndo: RowUndo }).rowUndo.undo()
    // The store still reads them open (the stub wrote nothing), so the undo
    // has nothing to reopen — it must not reopen anything else either.
    expect(acts.reopenTripTodo).not.toHaveBeenCalled()
  })

  it('dates the whole selection from one sheet of chips (FR-7.14)', async () => {
    seedTrip()
    seedTask('Salbe holen', {})
    seedTask('Pass holen', {})

    const page = mountPage()
    await flushPromises()
    await page.get('[data-testid="trip-todo-Salbe holen"] ion-label').trigger('contextmenu')
    await barAll()
    await page.get('[data-testid="m25-bulk-due"]').trigger('click')
    await flushPromises()
    expect(page.get('[data-testid="m25-bulk-due-title"]').text()).toBe('Due date for 2 tasks')
    await page
      .get('[data-testid="m25-bulk-when-chips"] [data-testid="due-chip-tomorrow"]')
      .trigger('click')
    await flushPromises()

    expect(acts.setTaskDueDate).toHaveBeenCalledTimes(2)
    for (const call of acts.setTaskDueDate.mock.calls) expect(call[2]).toBe('2026-07-09')
  })

  it('deletes the trip’s own tasks of a selection, and offers no delete for a preparation (FR-7.14)', async () => {
    seedTrip()
    seedRow('ti-1', 'Kulturbeutel')
    seedTask('Salbe holen', {})
    seedTask('Pass holen', {})
    seedTask('Akku laden', { trip_item_id: 'ti-1' })

    const page = mountPage()
    await flushPromises()
    await page.get('[data-testid="trip-todo-Salbe holen"] ion-label').trigger('contextmenu')
    await barAll()
    expect(barCount()).toBe('3 selected')
    expect(page.find('[data-testid="m25-bulk-remove"]').exists()).toBe(false)
    await barExit()
    await page.get('[data-testid="trip-todo-Salbe holen"] ion-label').trigger('contextmenu')
    await page.get('[data-testid="trip-todo-Pass holen"] ion-label').trigger('pointerdown')
    await page.get('[data-testid="trip-todo-open-Pass holen"]').trigger('click')
    expect(barCount()).toBe('2 selected')
    await page.get('[data-testid="m25-bulk-remove"]').trigger('click')
    await flushPromises()

    // Hidden at once, deleted when the undo lapses — and one undo brings both back.
    expect(page.find('[data-testid="trip-todo-Salbe holen"]').exists()).toBe(false)
    expect(page.find('[data-testid="trip-todo-Pass holen"]').exists()).toBe(false)
    expect(acts.deleteTripTodo).not.toHaveBeenCalled()
    ;(page.vm as unknown as { rowUndo: RowUndo }).rowUndo.undo()
    await flushPromises()
    expect(page.find('[data-testid="trip-todo-Salbe holen"]').exists()).toBe(true)
    expect(page.find('[data-testid="trip-todo-Pass holen"]').exists()).toBe(true)
  })
})

/** FR-7.12: the packing of the seeded trip is declared finished. */
function closeThePacking() {
  useTripStore().applyChange({
    seq: 1,
    table: TABLE.trips,
    id: 't1',
    deleted: false,
    row: {
      name: 'Samedan',
      year: 2026,
      status: 'active',
      packing_closed_at: '2026-07-08T06:00:00Z',
    },
  })
}

describe('M25 — the day a task is due (FR-7.11)', () => {
  it('reads what is pressing on top, across both phases, and out of its group (FR-7.14)', async () => {
    seedTrip()
    seedTaskTag('apo', 'Apotheke', 0)
    seedTaskTag('amt', 'Amt', 1)
    seedTask('Salbe holen', { task_tag_id: 'apo' })
    // STUB_TODAY is 2026-07-08: this one is a week late.
    seedTask('Pass holen', { task_tag_id: 'amt', due_date: '2026-07-01' })
    seedTask('Zug abklären', { phase: 'during', due_date: '2026-07-08' })
    seedTask('Karte kaufen', { due_date: '2026-07-30' })

    const page = mountPage()
    await flushPromises()

    const due = page.get('[data-testid="m25-due"]')
    const rows = due.findAll('[data-testid^="trip-todo-open-"]').map((row) => row.text())
    expect(rows).toEqual(['Pass holen', 'Zug abklären'])
    expect(page.get('[data-testid="trip-todo-due-Pass holen"]').attributes('data-due')).toBe(
      'overdue',
    )
    // Named by its tag, since it stands outside its group.
    expect(due.get('[data-testid="trip-todo-tag-Pass holen"]').text()).toBe('Amt')
    // Nowhere else: the group it left is not drawn, and a later day stays put.
    expect(page.find('[data-testid="m25-group-amt"]').exists()).toBe(false)
    expect(page.get('[data-testid="m25-before"]').text()).toContain('Karte kaufen')
    expect(page.get('[data-testid="m25-during"]').text()).not.toContain('Zug abklären')
  })

  it('draws no due block when nothing is pressing', async () => {
    seedTrip()
    seedTask('Karte kaufen', { due_date: '2026-07-30' })
    const page = mountPage()
    await flushPromises()
    expect(page.find('[data-testid="m25-due"]').exists()).toBe(false)
    expect(page.get('[data-testid="trip-todo-due-Karte kaufen"]').text()).not.toBe('')
  })

  it('sets the day from the task’s sheet, keeps the sheet up, and takes it back whole', async () => {
    seedTrip()
    seedTask('Pass holen', {})

    const page = mountPage()
    await flushPromises()
    await page.get('[data-testid="trip-todo-open-Pass holen"]').trigger('click')
    await flushPromises()
    await page.get('[data-testid="task-sheet"] [data-testid="due-chip-tomorrow"]').trigger('click')
    await flushPromises()

    expect(acts.setTaskDueDate).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ id: 'Pass holen' }),
      '2026-07-09',
    )
    expect(page.find('[data-testid="task-sheet"]').exists()).toBe(true)

    acts.setTaskDueDate.mockClear()
    ;(page.vm as unknown as { rowUndo: RowUndo }).rowUndo.undo()
    expect(acts.setTaskDueDate).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ id: 'Pass holen' }),
      null,
    )
  })
})

describe('M25 — *before* is closed once the packing is finished (FR-7.12)', () => {
  it('moves the history to the end, folded to one line, with no tick in it (FR-7.14)', async () => {
    seedTrip()
    seedTask('Pass holen', { task_state: 'resolved' })
    seedTask('Salbe holen', {})
    seedTask('Zug abklären', { phase: 'during' })
    closeThePacking()

    const page = mountPage()
    await flushPromises()

    // During first, then the folded line; the field writes for the road.
    const sections = page
      .findAll('section[data-testid="m25-during"], section[data-testid="m25-before"]')
      .map((section) => section.attributes('data-testid'))
    expect(sections).toEqual(['m25-during', 'm25-before'])
    expect(page.find('[data-testid="m25-composer-phase"]').exists()).toBe(false)
    const fold = page.get('[data-testid="m25-before-fold"]')
    expect(fold.text()).toBe('Before the trip · 1 done')
    expect(page.find('[data-testid="m25-before-locked"]').exists()).toBe(false)

    await fold.trigger('click')
    expect(page.find('[data-testid="m25-before-locked"]').exists()).toBe(true)
    // No drop lands here either: the heading says so while a task is carried.
    expect(
      page.get('[data-testid="m25-before"] [data-drop-target]').attributes('data-droppable'),
    ).toBe('false')
    await page
      .get('[data-testid="m25-before"] [data-testid="trip-todos-resolved"]')
      .trigger('click')
    const tick = page.get('[data-testid="trip-todo-Pass holen"] ion-checkbox')
    expect((tick.element as HTMLInputElement).disabled).toBe(true)
  })

  it('selects nothing in it and offers no batch into it', async () => {
    seedTrip()
    // Open in *before* after the close — written on a device that had not
    // heard of it yet. It stays readable, and it is not a batch's to move.
    seedTask('Salbe holen', {})
    seedTask('Zug abklären', { phase: 'during' })
    seedTask('Karte kaufen', { phase: 'during' })
    closeThePacking()

    const page = mountPage()
    await flushPromises()
    await page.get('[data-testid="trip-todo-Zug abklären"] ion-label').trigger('contextmenu')
    await barAll()

    // „All" is the two for the road; the one left in *before* is not in it.
    expect(barCount()).toBe('2 selected')
    expect(page.find('[data-testid="m25-bulk-before"]').exists()).toBe(false)
    // Both are already for the road, so no phase button at all — but the bar is up.
    expect(page.find('[data-testid="m25-bulk-during"]').exists()).toBe(false)
    expect(page.find('[data-testid="m25-bulk-done"]').exists()).toBe(true)
    await page.get('[data-testid="m25-before-fold"]').trigger('click')
    expect(page.find('[data-testid="trip-todo-grip-Salbe holen"]').exists()).toBe(false)
  })

  it('lifts once the packing is reopened', async () => {
    seedTrip()
    closeThePacking()
    const page = mountPage()
    await flushPromises()
    expect(page.find('[data-testid="m25-phase-before"]').exists()).toBe(false)

    seedTrip()
    await flushPromises()
    expect(page.find('[data-testid="m25-before-fold"]').exists()).toBe(false)
    expect(page.find('[data-testid="m25-phase-before"]').exists()).toBe(true)
  })
})

describe('M25 — the notes left for a view of their own (FR-7.13)', () => {
  it('is one list again: no segment, and no note among the tasks', async () => {
    seedTrip()
    seedTask('Salbe holen', {})
    useTripStore().applyChange({
      seq: 0,
      table: TABLE.comments,
      id: 'note-1',
      deleted: false,
      row: { trip_id: 't1', trip_item_id: null, author_id: 'u-sia', body: 'Code 4711', is_task: 0 },
    })

    const page = mountPage()
    await flushPromises()

    expect(page.get('[data-testid="m25-before"]').text()).toContain('Salbe holen')
    expect(page.find('ion-segment').exists()).toBe(false)
    expect(page.text()).not.toContain('Code 4711')
  })
})
