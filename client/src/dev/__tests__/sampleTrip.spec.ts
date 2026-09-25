/**
 * The dev seed's trip, on the one property FR-7.6 gave it: a fresh device
 * must show **both** kinds of task, or the one list it now has cannot be
 * looked at without twenty minutes of typing.
 *
 * Like `sampleMaster.spec.ts`, this pins what the data exists for rather
 * than its contents — the row the preparations hang off is named by the
 * seed, so the case asks the seed which row it meant.
 */
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { describe, it, expect, beforeEach } from 'vitest'

import { installHarness } from '@/__tests__/harness'
import { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'
import { dueStateOf } from '@/domain/taskDue'
import { localIsoDate } from '@/domain/trips'
import { taskGroups, tripTasks } from '@/domain/tripTodos'
import { IndexedDBPersistence } from '@/local/persistence'
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'

import { seedSampleMaster } from '../sampleMaster'
import { SEED_SHOPPING_ENTRIES, seedSampleTrip } from '../sampleTrip'

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  installHarness()
})

/** Local Mode: the seed must work on a device with no server at all. */
function seed() {
  const orchestrator = useSyncOrchestrator({
    baseUrl: '',
    getToken: () => null,
    local: new IndexedDBPersistence(),
  })
  const master = seedSampleMaster(orchestrator)
  const tripId = seedSampleTrip(orchestrator, master.items)
  return { tripId, trip: useTripStore() }
}

describe('seedSampleTrip (dev)', () => {
  it('leaves a fresh device with both kinds of task (FR-7.6)', () => {
    const { tripId, trip } = seed()

    const rows = trip.getItems(tripId).map((item) => ({
      id: item.id,
      name: item.name,
      icon: null,
    }))
    const tasks = tripTasks(trip.getTripTodos(tripId), trip.getTodos(tripId), rows)

    // The trip's own chores (FR-7.4), and at least one that prepares a row.
    expect(tasks.filter((task) => task.item === null).length).toBeGreaterThan(0)
    const prepared = tasks.filter((task) => task.item !== null)
    expect(prepared.length).toBeGreaterThan(1)
    // All of a row's preparations name the same row, which is what the chip
    // on the seeded list will say.
    expect(new Set(prepared.map((task) => task.item?.name)).size).toBe(1)
  })

  /*
   * FR-30.9: M6 groups by tag, so the seed needs two tags and an untagged
   * entry or a fresh device shows a list with nothing to group.
   */
  it('names two shopping tags and one untagged entry (FR-30.9)', () => {
    // The entries themselves reach the module's store only once the app
    // shell has bound it (FR-30.3), so what the seed *offers* is what is pinned.
    const tags = SEED_SHOPPING_ENTRIES.map((entry) => entry.tag)
    expect(new Set(tags.filter((tag) => tag !== null)).size).toBe(2)
    expect(tags).toContain(null)
  })

  /* FR-30.10: a due entry and an undated one, so M6's pill and its order show on a fresh device. */
  it('dates one entry today and leaves most undated (FR-30.10)', () => {
    const dues = SEED_SHOPPING_ENTRIES.map((entry) => entry.due)
    expect(dues).toContain(0)
    expect(dues.filter((due) => due === null).length).toBeGreaterThan(dues.length / 2)
  })

  /*
   * FR-7.8: the seed has to show the grouping with all three shapes of
   * heading in it, because those are what a reader has to tell apart — a
   * tag, what came from the packing list, and what has neither. A seed that
   * tagged everything, or nothing, would leave two of the three unseen on a
   * fresh device, which is what the seed exists to prevent.
   */
  it('leaves a fresh device with a tagged task and both untagged headings (FR-7.8)', () => {
    const { tripId, trip } = seed()
    const master = useMasterStore()

    const rows = trip.getItems(tripId).map((item) => ({ id: item.id, name: item.name, icon: null }))
    const tasks = tripTasks(trip.getTripTodos(tripId), trip.getTodos(tripId), rows)
    const groups = taskGroups(tasks, master.taskTagList, localIsoDate(Date.now()))

    const byTag = groups.filter((group) => group.tag !== null)
    expect(byTag.length).toBeGreaterThan(0)
    // The tag the task names is one the master seed actually created — the
    // lookup is by name, so a renamed tag would silently file nothing.
    for (const group of byTag) {
      expect(master.taskTagList.map((tag) => tag.id)).toContain(group.tag!.id)
      expect(group.tasks.length).toBeGreaterThan(0)
    }
    expect(groups.map((group) => group.key)).toEqual(expect.arrayContaining(['prep', 'trip']))
  })

  // FR-7.11: a fresh device shows the due states — one overdue, one soon —
  // beside the undated tasks that are the normal case.
  it('dates two of its tasks: one overdue and one due tomorrow (FR-7.11)', () => {
    const { tripId, trip } = seed()
    const today = localIsoDate(Date.now())
    const states = trip
      .getTripTodos(tripId)
      .map((todo) => dueStateOf(todo, today))
      .filter((state) => state !== null)
    expect(states.sort()).toEqual(['overdue', 'soon'])
  })

  it('hangs its preparations off a row the trip actually carries', () => {
    const { tripId, trip } = seed()

    const prepared = trip.getTodos(tripId)
    expect(prepared.length).toBeGreaterThan(0)
    const rowIds = new Set(trip.getItems(tripId).map((item) => item.id))
    for (const todo of prepared) expect(rowIds.has(todo.trip_item_id)).toBe(true)
  })

  /**
   * FR-7.9/FR-7.13: M26 opens with more than one thread, hanging off the
   * trip itself rather than a row — `getTripComments` is exactly what a note
   * is (trip_item_id null, is_task 0), so this also pins that the seed does
   * not accidentally write them as tasks — and one of them titled, with
   * replies.
   */
  it('leaves a fresh device with trip notes, one a titled thread with replies (FR-7.13)', () => {
    const { tripId, trip } = seed()

    const notes = trip.getTripComments(tripId)
    for (const note of notes) expect(note.trip_item_id).toBeNull()
    const roots = notes.filter((note) => note.parent_id === null)
    expect(roots.length).toBeGreaterThan(1)
    const titled = roots.find((note) => note.title !== null)
    expect(titled).toBeDefined()
    expect(notes.filter((note) => note.parent_id === titled?.id).length).toBeGreaterThan(1)
  })
})
