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
import { taskGroups, tripTasks } from '@/domain/tripTasks'
import { IndexedDBPersistence } from '@/local/persistence'
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'

import { seedSampleMaster } from '../sampleMaster'
import { plannerModule, usePlannerStore } from '@/planner'
import { IDEA_STATES } from '@/planner/types'

import { SEED_IDEAS, SEED_MEALS, SEED_SHOPPING_ENTRIES, seedSampleTrip } from '../sampleTrip'
import { mealsModule, useMealStore } from '@/meals'
import { SAMPLE_ROUTES, sampleGpx } from '../sampleTracks'
import { decodeLine, defaultSource, readTrack } from '@/domain/shared/track'

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

/** The same, on a device that has loaded what it holds — the running app. */
async function seedConnected() {
  const orchestrator = useSyncOrchestrator({
    baseUrl: '',
    getToken: () => null,
    local: new IndexedDBPersistence(),
  })
  await orchestrator.connect()
  const master = seedSampleMaster(orchestrator)
  const tripId = seedSampleTrip(orchestrator, master.items)
  return { tripId, trip: useTripStore() }
}

describe('seedSampleTrip (dev)', () => {
  /*
   * §3.29: M28 has chips to show and segments to switch between only if the
   * seed spreads its ideas — a board of five alike ideas exercises none of it.
   */
  it('leaves the board ideas in three segments, with a vote and a comment (§3.29)', () => {
    // The module's rows reach its store only through the binding the app
    // shell makes (FR-29.9), so this device binds it as App.vue does.
    const orchestrator = useSyncOrchestrator({
      baseUrl: '',
      getToken: () => null,
      local: new IndexedDBPersistence(),
      features: [plannerModule.featureStore()],
    })
    const tripId = seedSampleTrip(orchestrator, seedSampleMaster(orchestrator).items)
    const planner = usePlannerStore()
    const ideas = planner.getIdeas(tripId)

    expect(ideas).toHaveLength(SEED_IDEAS.length)
    const used = IDEA_STATES.filter((state) => ideas.some((idea) => idea.state === state))
    expect(used).toEqual(['idea', 'shortlisted', 'dropped'])
    expect(ideas.some((idea) => idea.rain_proof)).toBe(true)
    expect(planner.getVotes(tripId).filter((vote) => vote.vote === 'up')).toHaveLength(1)
    expect(planner.getComments(tripId)).toHaveLength(1)
    // FR-29.14/29.15: M29 has a planned idea, one in its pool, an entry for everybody
    // and one for the child alone.
    const shortlisted = ideas.filter((idea) => idea.state === 'shortlisted')
    expect(shortlisted.filter((idea) => idea.planned_on !== null)).toHaveLength(1)
    expect(shortlisted.filter((idea) => idea.planned_on === null)).toHaveLength(1)
    expect(planner.getDayEntries(tripId)).toHaveLength(2)
    const leonardo = useTripStore()
      .getTravelers(tripId)
      .find((traveler) => traveler.name === 'Leonardo')
    expect(planner.getDayEntryTravelers(tripId).map((row) => row.traveler_id)).toEqual([
      leonardo?.id,
    ])
  })

  /*
   * FR-29.17: the seed's GPX routes are files the device can read — a hike and
   * a bike tour, both on the Landeskarte — or the idea that carries them
   * would show no map at all.
   */
  it('seeds two GPX routes that read as a hike and a bike tour in Switzerland (FR-29.17)', () => {
    const read = SAMPLE_ROUTES.map((route) => {
      const gpx = sampleGpx(route)
      return readTrack(gpx, route.fileName, gpx.length)
    })
    const uploads = read.map((r) => (r.ok ? r.upload : null))
    expect(uploads.map((u) => u?.kind)).toEqual(['hike', 'bike'])
    expect(defaultSource(uploads.map((u) => decodeLine(u!.line)))).toBe('swisstopo')
    expect(SEED_IDEAS.filter((idea) => idea.tracks)).toHaveLength(1)
  })

  it('leaves a fresh device with both kinds of task (FR-7.6)', () => {
    const { tripId, trip } = seed()

    const rows = trip.getItems(tripId).map((item) => ({
      id: item.id,
      name: item.name,
      icon: null,
    }))
    const tasks = tripTasks(trip.getOwnTasks(tripId), trip.getPrepTasks(tripId), rows)

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
    const tasks = tripTasks(trip.getOwnTasks(tripId), trip.getPrepTasks(tripId), rows)
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
      .getOwnTasks(tripId)
      .map((task) => dueStateOf(task, today))
      .filter((state) => state !== null)
    expect(states.sort()).toEqual(['overdue', 'soon'])
  })

  it('hangs its preparations off a row the trip actually carries', () => {
    const { tripId, trip } = seed()

    const prepared = trip.getPrepTasks(tripId)
    expect(prepared.length).toBeGreaterThan(0)
    const rowIds = new Set(trip.getItems(tripId).map((item) => item.id))
    for (const task of prepared) expect(rowIds.has(task.trip_item_id)).toBe(true)
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

  /**
   * FR-31: M27 opens with an excursion from a group — per-person lines, a
   * vor-Ort line, and, on this closed suitcase, something not in the luggage
   * — and an undated one, so both of M27's sections show.
   */
  it('leaves a fresh device with excursions to look at (FR-31)', async () => {
    // An excursion links into the suitcase, so it waits for the device's rows
    // to be loaded (ADR-016's guard) — as they are when the seed button runs.
    const { tripId, trip } = await seedConnected()

    const excursions = trip.getExcursions(tripId)
    expect(excursions.some((e) => e.starts_on !== null)).toBe(true)
    expect(excursions.some((e) => e.starts_on === null)).toBe(true)
    const lines = trip.getExcursionItems(tripId)
    expect(lines.some((l) => l.for_all_participants)).toBe(true)
    expect(lines.some((l) => l.mode === 'buy_local')).toBe(true)
    expect(lines.some((l) => l.not_in_luggage)).toBe(true)
  })

  /*
   * §3.33: M31 shows its fold, a meal eaten out, a half-bought dinner and the
   * picnic on the hut tour only if the seed spreads them so.
   */
  it('leaves a fresh device with a meal plan across the days, one picnic on the hut tour (§3.33)', async () => {
    const orchestrator = useSyncOrchestrator({
      baseUrl: '',
      getToken: () => null,
      local: new IndexedDBPersistence(),
      features: [mealsModule.featureStore()],
    })
    await orchestrator.connect()
    const tripId = seedSampleTrip(orchestrator, seedSampleMaster(orchestrator).items)
    const meals = useMealStore().getMeals(tripId)

    expect(meals).toHaveLength(SEED_MEALS.length)
    expect(meals.some((meal) => meal.kind === 'out')).toBe(true)
    expect(meals.filter((meal) => meal.excursion_id !== null)).toHaveLength(1)
    const ingredients = useMealStore().getIngredients(tripId)
    expect(ingredients.some((ingredient) => ingredient.bought)).toBe(true)
    expect(ingredients.some((ingredient) => !ingredient.bought)).toBe(true)
  })

  /*
   * FR-33.15: a plan longer than a phone's screen, with free days between, so
   * a meal dragged on M31 has days below the fold to reach — the edge scroll
   * is tried on the seed, not on a plan typed in by hand.
   */
  it('plans meals far enough across the trip that M31 runs past one screen (FR-33.15)', () => {
    const ahead = new Set(SEED_MEALS.filter((meal) => meal.day >= 0).map((meal) => meal.day))
    expect(ahead.size).toBeGreaterThanOrEqual(8)
    expect(Math.max(...ahead)).toBeGreaterThanOrEqual(11)
    const days = [...ahead].sort((a, b) => a - b)
    expect(days.some((day, n) => n > 0 && day - days[n - 1]! > 1)).toBe(true)
  })
})
