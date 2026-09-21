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
import { taskGroups, tripTasks } from '@/domain/tripTodos'
import { IndexedDBPersistence } from '@/local/persistence'
import { useShoppingStore } from '@/shopping/store'
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'

import { seedSampleMaster } from '../sampleMaster'
import { seedSampleTrip } from '../sampleTrip'

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
  it('leaves a fresh device with two shopping tags and an untagged entry (FR-30.9)', () => {
    const { tripId } = seed()
    const tags = useShoppingStore()
      .getEntries(tripId)
      .map((entry) => entry.tag)
    expect(new Set(tags.filter((tag) => tag !== null)).size).toBe(2)
    expect(tags).toContain(null)
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
    const groups = taskGroups(tasks, master.taskTagList)

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

  it('hangs its preparations off a row the trip actually carries', () => {
    const { tripId, trip } = seed()

    const prepared = trip.getTodos(tripId)
    expect(prepared.length).toBeGreaterThan(0)
    const rowIds = new Set(trip.getItems(tripId).map((item) => item.id))
    for (const todo of prepared) expect(rowIds.has(todo.trip_item_id)).toBe(true)
  })
})
