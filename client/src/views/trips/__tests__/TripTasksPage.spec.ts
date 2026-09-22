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
import { IonInput, IonTextarea } from '@ionic/vue'
import { flushPromises, mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { RouterLinkStub } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

import TripTasksPage from '../TripTasksPage.vue'
import TripTaskSheet from '@/components/trips/TripTaskSheet.vue'
import TripTodoList from '@/components/trips/TripTodoList.vue'
import { identityStub } from '@/composables/__tests__/identityStub'
import { tripScreenStub } from '@/composables/__tests__/tripScreenStub'
import { ORCHESTRATOR } from '@/composables/useOrchestrator'
import type { RowUndo } from '@/composables/useRowUndo'
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'
import { TABLE } from '@/types/tables'

vi.mock('@/composables/useHeaderTitle', () => ({ setHeaderTitle: vi.fn() }))

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
  // FR-7.9
  addComment: vi.fn(() => 'new-note'),
  deleteComment: vi.fn(),
  toggleNoteTick: vi.fn(),
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

/** FR-7.9: a note — a trip-level comment, `is_task = 0`. */
function seedNote(id: string, authorId: string, body: string) {
  useTripStore().applyChange({
    seq: 0,
    table: TABLE.comments,
    id,
    deleted: false,
    row: { trip_id: 't1', trip_item_id: null, author_id: authorId, body, is_task: 0 },
  })
}

/**
 * FR-7.9: `ion-segment`'s `ionChange` is a custom event a plain DOM click
 * does not raise under jsdom — `ShoppingPage.spec.ts`'s M6 tabs read the
 * same way, through the component rather than the element.
 */
async function switchToNotes(page: VueWrapper): Promise<void> {
  await page.findComponent({ name: 'IonSegment' }).vm.$emit('ionChange', {
    detail: { value: 'notes' },
  })
  await flushPromises()
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
    await page.findComponent({ name: 'TripTaskSheet' }).findComponent(IonInput).setValue('Apotheke')
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
 * FR-7.9: the second segment. `mountPage`'s `fetchMe` answers `u-andy`, so a
 * note by `u-sia` is new and a note by `u-andy` is mine.
 */
describe('M25 — the notes segment (FR-7.9)', () => {
  it('switches from tasks to notes, and lists a note there', async () => {
    seedTrip()
    seedTask('Salbe holen', {})
    seedNote('note-1', 'u-sia', 'Schlüsselfach: 4711')

    const page = mountPage()
    await flushPromises()

    expect(page.get('[data-testid="m25-before"]').text()).toContain('Salbe holen')
    expect(page.find('[data-testid="m25-notes"]').exists()).toBe(false)

    await switchToNotes(page)
    await flushPromises()

    expect(page.find('[data-testid="m25-before"]').exists()).toBe(false)
    expect(page.get('[data-testid="m25-notes"]').text()).toContain('Schlüsselfach: 4711')
  })

  it('marks a note by someone else as new, and counts it on the segment', async () => {
    seedTrip()
    seedNote('note-1', 'u-sia', 'Schlüsselfach: 4711')

    const page = mountPage()
    await flushPromises()

    expect(page.get('[data-testid="m25-segment-notes"]').text()).toContain('1')

    await switchToNotes(page)
    await flushPromises()

    const row = page.get('[data-testid="trip-note-note-1"]')
    expect(row.find('[data-testid="trip-note-new"]').exists()).toBe(true)
    expect(row.find('ion-checkbox.tick').exists()).toBe(true)
  })

  it('never marks or ticks my own note (decision 4)', async () => {
    seedTrip()
    seedNote('note-1', 'u-andy', 'Schlüsselfach: 4711')

    const page = mountPage()
    await flushPromises()

    // The segment's own count is new notes, never the list's total.
    expect(page.get('[data-testid="m25-segment-notes"]').text()).not.toContain('1')

    await switchToNotes(page)
    await flushPromises()

    const row = page.get('[data-testid="trip-note-note-1"]')
    expect(row.find('[data-testid="trip-note-new"]').exists()).toBe(false)
    expect(row.find('ion-checkbox.tick').exists()).toBe(false)
  })

  it('ticks a note that is not mine, from the list', async () => {
    seedTrip()
    seedNote('note-1', 'u-sia', 'Schlüsselfach: 4711')

    const page = mountPage()
    await flushPromises()
    await switchToNotes(page)
    await flushPromises()

    await page.get('[data-testid="trip-note-tick-note-1"]').trigger('ionChange')

    // No existing ack row yet — the caller (myAckFor) decides insert vs.
    // upsert from it, so `null` here is what a first tick looks like.
    expect(acts.toggleNoteTick).toHaveBeenCalledWith('t1', 'note-1', expect.any(String), null)
  })

  it('writes a note from the composer', async () => {
    seedTrip()

    const page = mountPage()
    await flushPromises()
    await switchToNotes(page)
    await flushPromises()

    await page.findComponent(IonTextarea).setValue('Pizzakurier: 044 555 01 00')
    await page.get('[data-testid="trip-note-add"]').trigger('click')

    expect(acts.addComment).toHaveBeenCalledWith(
      't1',
      null,
      expect.any(String),
      'Pizzakurier: 044 555 01 00',
    )
  })

  it('opens a note’s sheet and deletes it', async () => {
    seedTrip()
    seedNote('note-1', 'u-sia', 'Schlüsselfach: 4711')

    const page = mountPage()
    await flushPromises()
    await switchToNotes(page)
    await flushPromises()
    await page.get('[data-testid="trip-note-open-note-1"]').trigger('click')
    await flushPromises()

    expect(page.get('[data-testid="note-sheet-body"]').text()).toContain('Schlüsselfach: 4711')
    await page.get('[data-testid="note-sheet-remove"]').trigger('click')

    expect(acts.deleteComment).toHaveBeenCalledWith('t1', 'note-1')
  })
})
