/**
 * Trip store — reactive state for trips and their items.
 *
 * Populated from pull responses. Mutations go through the SyncOutbox (G-5).
 * The store itself is a plain data cache; sync orchestration lives elsewhere.
 */

import { bucketedRows, bucketSink, keyedSink } from '@/sync/bucketedRows'
import { TABLE, type SyncTable } from '@/api/tables'
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  AppliedChange,
  GeneratedPosition,
  ShoppingMode,
  Trip,
  TripItem,
  TripKPIs,
  Traveler,
  Container,
  Excursion,
  ExcursionItem,
  ExcursionTrack,
  ExcursionTraveler,
  ItemComment,
  PrepTask,
  NoteAck,
  OwnTask,
  TripMember,
  TripTemplateSource,
} from '@/types/domain'
import { ITEM_MODE_BUY_BEFORE, ITEM_MODE_BUY_LOCAL, STATE_PACKED } from '@/types/domain'
import type { PullChange } from '@/api/types'
import { unitsOf } from '@/domain/packState'
import {
  encodedRow,
  KERNEL_TABLE_SPECS,
  prepTaskCodec,
  ownTaskCodec,
  type SyncRow,
} from '@/sync/tableRegistry'
import {
  applyToSink,
  currentRowIn,
  removeCascading,
  specifiedSinks,
  type RowSinks,
} from '@/sync/sinks'

export const useTripStore = defineStore(TABLE.trips, () => {
  const trips = ref<Map<string, Trip>>(new Map())
  const tripItems = ref<Map<string, TripItem[]>>(new Map())
  const travelers = ref<Map<string, Traveler[]>>(new Map())
  const containers = ref<Map<string, Container[]>>(new Map())
  const prepTasks = ref<Map<string, PrepTask[]>>(new Map())
  const comments = ref<Map<string, ItemComment[]>>(new Map())
  // FR-7.9: a note's per-person ticks, bucketed by trip_id like every other
  // trip-partition row (note_acks carries its own, rather than only a
  // comment_id — see schema.sql).
  const noteAcks = ref<Map<string, NoteAck[]>>(new Map())
  // FR-7.4: a separate bucket rather than a filter over `prepTasks`, so that
  // every packing figure reading `prepTasks` cannot count a trip task by mistake.
  const ownTasks = ref<Map<string, OwnTask[]>>(new Map())
  // FR-31 (ADR-077): an excursion, who goes on it, and its own lines —
  // three trip-partition tables, bucketed by trip_id like the rest.
  const excursions = ref<Map<string, Excursion[]>>(new Map())
  const excursionTravelers = ref<Map<string, ExcursionTraveler[]>>(new Map())
  const excursionItems = ref<Map<string, ExcursionItem[]>>(new Map())
  // FR-31.15: an excursion's GPX tracks, the row of each (ADR-089).
  const excursionTracks = ref<Map<string, ExcursionTrack[]>>(new Map())
  const members = ref<Map<string, TripMember[]>>(new Map())
  // FR-27.4. Flat maps keyed by row id rather than per trip: all three are
  // read for one trip at a time, and a per-trip bucket would have to be
  // rebuilt on every tombstone.
  const templateSources = ref<Map<string, TripTemplateSource>>(new Map())
  const generatedPositions = ref<Map<string, GeneratedPosition>>(new Map())
  const appliedChanges = ref<Map<string, AppliedChange>>(new Map())

  // The twelve per-trip buckets, all one shape (see bucketedRows).
  const itemRows = bucketedRows(tripItems, (r) => r.trip_id)
  const travelerRows = bucketedRows(travelers, (r) => r.trip_id)
  const containerRows = bucketedRows(containers, (r) => r.trip_id)
  const memberRows = bucketedRows(members, (r) => r.trip_id)
  const commentRows = bucketedRows(comments, (r) => r.trip_id)
  const noteAckRows = bucketedRows(noteAcks, (r) => r.trip_id)
  const prepTaskRows = bucketedRows(prepTasks, (r) => r.trip_id)
  const ownTaskRows = bucketedRows(ownTasks, (r) => r.trip_id)
  const excursionRows = bucketedRows(excursions, (r) => r.trip_id)
  const excursionTravelerRows = bucketedRows(excursionTravelers, (r) => r.trip_id)
  const excursionItemRows = bucketedRows(excursionItems, (r) => r.trip_id)
  const excursionTrackRows = bucketedRows(excursionTracks, (r) => r.trip_id)

  // --- Getters ---

  const tripList = computed(() => [...trips.value.values()])

  function getTrip(id: string): Trip | undefined {
    return trips.value.get(id)
  }

  function getItems(tripId: string): TripItem[] {
    return tripItems.value.get(tripId) ?? []
  }

  /**
   * getShoppingItems derives the M6 procurement lists (FR-3.2): open
   * BUY_BEFORE and BUY_LOCAL items. Purchased BUY_BEFORE items flip to
   * PACK (FR-3.3) and thereby leave the list.
   *
   * Beside each open list is what was bought from it (FR-25.11j), found two
   * ways. `bought_from` is the record M6's own check-off writes, and for a
   * BUY_BEFORE row it is the only way back, because the purchase changed the
   * mode. A BUY_LOCAL purchase is different: it *is* a packing act, so the
   * ordinary FR-25.17 path records it in `state` and `packed_at` and writes
   * no `bought_from` at all — which is what a row checked off on M4 rather
   * than in the shop looks like. Reading only the column drops such a row off
   * both tabs, present in the data and on no screen.
   *
   * The two are disjoint by construction rather than by a second condition: a
   * row still on the open list is never also reported as bought, so an
   * actionable row can never hide under the reveal — the failure FR-25.11a
   * names.
   */
  function getShoppingItems(tripId: string): {
    buyBefore: TripItem[]
    buyLocal: TripItem[]
    boughtBefore: TripItem[]
    boughtLocal: TripItem[]
  } {
    const items = getItems(tripId)
    const open = items.filter((i) => i.state !== STATE_PACKED && i.state !== 'skipped')
    const buyBefore = open.filter((i) => i.mode === ITEM_MODE_BUY_BEFORE)
    const buyLocal = open.filter((i) => i.mode === ITEM_MODE_BUY_LOCAL)
    const stillOpen = new Set([...buyBefore, ...buyLocal].map((i) => i.id))
    // A BUY_LOCAL row that is packed and still in its own mode was bought,
    // whether or not the act that packed it went through M6.
    const packedLocally = (i: TripItem) =>
      i.mode === ITEM_MODE_BUY_LOCAL && i.state === STATE_PACKED
    const bought = (from: ShoppingMode) =>
      items.filter(
        (i) =>
          !stillOpen.has(i.id) &&
          (i.bought_from === from || (from === ITEM_MODE_BUY_LOCAL && packedLocally(i))),
      )
    return {
      buyBefore,
      buyLocal,
      boughtBefore: bought(ITEM_MODE_BUY_BEFORE),
      boughtLocal: bought(ITEM_MODE_BUY_LOCAL),
    }
  }

  function getTravelers(tripId: string): Traveler[] {
    return travelers.value.get(tripId) ?? []
  }

  function getContainers(tripId: string): Container[] {
    return containers.value.get(tripId) ?? []
  }

  /** The trip's synced roster (FR-4.5). */
  function getMembers(tripId: string): TripMember[] {
    return members.value.get(tripId) ?? []
  }

  /** The templates this trip follows (FR-27.4) — empty for a trip created before the registry. */
  function getTemplateSources(tripId: string): TripTemplateSource[] {
    return [...templateSources.value.values()].filter((s) => s.trip_id === tripId)
  }

  /** What generation last produced for this trip, per position (FR-27.4). */
  function getGeneratedPositions(tripId: string): GeneratedPosition[] {
    return [...generatedPositions.value.values()].filter((g) => g.trip_id === tripId)
  }

  /**
   * The applied-changes log behind M2's chip (FR-27.4), newest first — a
   * list of what changed under you reads backwards, like history.
   */
  /**
   * M2's FR-27.4 log, newest first — with the id as a tiebreak, because a
   * whole plan is applied in one pass and its entries share a millisecond.
   * Timestamp alone leaves those to arrival order, so the same log reads
   * differently on two devices; the id is synced, so this order is the same
   * everywhere.
   */
  function getAppliedChanges(tripId: string): AppliedChange[] {
    return [...appliedChanges.value.values()]
      .filter((c) => c.trip_id === tripId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id))
  }

  function getPrepTasks(tripId: string): PrepTask[] {
    return prepTasks.value.get(tripId) ?? []
  }

  function getRowPrepTasks(tripId: string, tripItemId: string): PrepTask[] {
    return getPrepTasks(tripId).filter((t) => t.trip_item_id === tripItemId)
  }

  /**
   * The trip's own tasks (FR-7.4), open first, each half by text — an order
   * that survives a reload, which the store's insertion order does not.
   */
  function getOwnTasks(tripId: string): OwnTask[] {
    return [...(ownTasks.value.get(tripId) ?? [])].sort(
      (a, b) =>
        Number(a.task_state === 'resolved') - Number(b.task_state === 'resolved') ||
        a.body.localeCompare(b.body) ||
        a.id.localeCompare(b.id),
    )
  }

  /** Every comment of a trip, row-anchored and trip-level alike (FR-7.1). */
  function getComments(tripId: string): ItemComment[] {
    return comments.value.get(tripId) ?? []
  }

  /** Plain comments anchored to one item (FR-7.1). */
  function getItemComments(tripId: string, tripItemId: string): ItemComment[] {
    return (comments.value.get(tripId) ?? []).filter((c) => c.trip_item_id === tripItemId)
  }

  /** Plain comments anchored to the trip itself (FR-7.1). */
  function getTripComments(tripId: string): ItemComment[] {
    return (comments.value.get(tripId) ?? []).filter((c) => c.trip_item_id === null)
  }

  /** FR-31.1: a trip's excursions. */
  function getExcursions(tripId: string): Excursion[] {
    return excursions.value.get(tripId) ?? []
  }

  /** FR-31.3: the participant rows of a trip's excursions — none means everybody. */
  function getExcursionTravelers(tripId: string): ExcursionTraveler[] {
    return excursionTravelers.value.get(tripId) ?? []
  }

  /** FR-31.4: the lines of a trip's excursions — of one excursion when it is named. */
  function getExcursionItems(tripId: string, excursionId?: string): ExcursionItem[] {
    const all = excursionItems.value.get(tripId) ?? []
    return excursionId === undefined ? all : all.filter((l) => l.excursion_id === excursionId)
  }

  /** FR-31.15: the GPX tracks of a trip's excursions — of one excursion when it is named. */
  function getExcursionTracks(tripId: string, excursionId?: string): ExcursionTrack[] {
    const all = excursionTracks.value.get(tripId) ?? []
    return excursionId === undefined ? all : all.filter((t) => t.excursion_id === excursionId)
  }

  /** FR-7.9: every tick of a trip's notes — who has seen which one. */
  function getNoteAcks(tripId: string): NoteAck[] {
    return noteAcks.value.get(tripId) ?? []
  }

  /** Items that are packed but still have an open preparation. */
  function itemsWithOpenPrep(tripId: string): Array<{ item: TripItem; openPrepTasks: PrepTask[] }> {
    const items = getItems(tripId)
    const prepared = getPrepTasks(tripId)
    const result: Array<{ item: TripItem; openPrepTasks: PrepTask[] }> = []

    for (const item of items) {
      const openPrepTasks = prepared.filter(
        (t) => t.trip_item_id === item.id && t.task_state === 'open',
      )
      if (openPrepTasks.length > 0) {
        result.push({ item, openPrepTasks })
      }
    }
    return result
  }

  /**
   * `hidden` names rows the caller no longer shows although they are still
   * stored — FR-25.31's removals waiting for their undo to lapse. A hidden
   * trip item takes its own preparations out of the count with it.
   */
  function kpis(tripId: string, hidden: ReadonlySet<string> = new Set()): TripKPIs {
    const items = getItems(tripId).filter((item) => !hidden.has(item.id))
    const prepared = getPrepTasks(tripId).filter(
      (task) => !hidden.has(task.id) && !(task.trip_item_id && hidden.has(task.trip_item_id)),
    )
    let totalItems = 0
    let packedItems = 0
    let totalWeight = 0
    let packedWeight = 0
    let totalValue = 0
    let packedValue = 0

    for (const item of items) {
      // FR-25.22: the same units M4's group and cluster heads count, so the
      // trip line is the sum of the fractions drawn under it.
      const units = unitsOf(item)
      totalItems += units.total
      packedItems += units.done
      if (item.weight_grams) {
        totalWeight += item.weight_grams * item.quantity
        packedWeight += item.weight_grams * item.packed_count
      }
      if (item.value_cents) {
        totalValue += item.value_cents * item.quantity
        packedValue += item.value_cents * item.packed_count
      }
    }

    const totalPrepTasks = prepared.length
    const resolvedPrepTasks = prepared.filter((t) => t.task_state === 'resolved').length

    return {
      totalItems,
      packedItems,
      totalWeight,
      packedWeight,
      totalValue,
      packedValue,
      totalPrepTasks,
      resolvedPrepTasks,
    }
  }

  // --- Mutations ---

  function setTrip(trip: Trip): void {
    trips.value.set(trip.id, trip)
  }

  /** The sinks, one per table this store holds. */
  const sinks: RowSinks = specifiedSinks(KERNEL_TABLE_SPECS, {
    [TABLE.trips]: keyedSink(trips),
    [TABLE.tripItems]: bucketSink(itemRows),
    [TABLE.travelers]: bucketSink(travelerRows),
    [TABLE.containers]: bucketSink(containerRows),
    [TABLE.tripMembers]: bucketSink(memberRows),
    [TABLE.tripTemplateSources]: keyedSink(templateSources),
    [TABLE.tripGeneratedPositions]: keyedSink(generatedPositions),
    [TABLE.tripAppliedChanges]: keyedSink(appliedChanges),
    // FR-7.2/7.4: one table feeds three lists, told apart by `is_task` and
    // the anchor. A remove has to clear all of them, because the row's id is
    // in whichever list its last state put it in — and it clears nothing
    // else, since an edit re-files the row through it: a note's ticks go
    // with its delete through the cascade, never with its edit.
    [TABLE.comments]: {
      set: (c: ItemComment) => commentRows.upsert(c),
      get: (id) => commentRows.find(id),
      rows: () => [...commentRows.all(), ...prepTaskRows.all(), ...ownTaskRows.all()],
      remove: (id) => {
        commentRows.remove(id)
        prepTaskRows.remove(id)
        ownTaskRows.remove(id)
      },
    },
    [TABLE.noteAcks]: bucketSink(noteAckRows),
    [TABLE.excursions]: bucketSink(excursionRows),
    [TABLE.excursionTravelers]: bucketSink(excursionTravelerRows),
    [TABLE.excursionItems]: bucketSink(excursionItemRows),
    [TABLE.excursionTracks]: bucketSink(excursionTrackRows),
  })

  function applyChange(change: PullChange): void {
    const table = change.table as SyncTable
    const sink = Object.hasOwn(sinks, table) ? sinks[table] : undefined
    if (!sink) return
    if (change.deleted) {
      removeCascading(sinks, table, change.id)
      return
    }
    if (!change.row) return
    const row = change.row as SyncRow
    // FR-7.2/7.4 again, on the read side: which of the three types a comment
    // row becomes is decided by `is_task` and the anchor, and flagging moves a
    // row between the lists — so every list drops it before one takes it.
    if (table === TABLE.comments) {
      sinks[TABLE.comments]?.remove(change.id)
      if (!row['is_task']) {
        commentRows.upsert(KERNEL_TABLE_SPECS[TABLE.comments].parse(change.id, row))
      } else if (row['trip_item_id'] == null) {
        // FR-7.4: a task with no row is the trip's own.
        ownTaskRows.upsert(ownTaskCodec.parse(change.id, row))
      } else {
        prepTaskRows.upsert(prepTaskCodec.parse(change.id, row))
      }
      return
    }
    applyToSink(sinks, table, sink.spec.parse(change.id, row))
  }

  function applyChanges(changes: PullChange[]): void {
    for (const c of changes) {
      applyChange(c)
    }
  }

  /**
   * One row in its wire shape, or undefined where this store does not hold
   * it. A `comments` row is encoded by whichever of FR-7.2/7.4's three lists
   * holds it, since each reading drops the columns the others carry.
   */
  function currentRow(table: string, id: string): SyncRow | undefined {
    if (table !== TABLE.comments) return currentRowIn(sinks, table, id)
    const comment = commentRows.find(id)
    if (comment) return encodedRow(KERNEL_TABLE_SPECS[TABLE.comments], comment)
    const prepTask = prepTaskRows.find(id)
    if (prepTask) return (prepTaskCodec.encode as (t: PrepTask) => SyncRow)(prepTask)
    const ownTask = ownTaskRows.find(id)
    return ownTask && (ownTaskCodec.encode as (t: OwnTask) => SyncRow)(ownTask)
  }

  return {
    currentRow,
    trips,
    tripList,
    getTrip,
    getItems,
    getShoppingItems,
    getTravelers,
    getContainers,
    getMembers,
    getTemplateSources,
    getGeneratedPositions,
    getAppliedChanges,
    getPrepTasks,
    getRowPrepTasks,
    getOwnTasks,
    getComments,
    getItemComments,
    getTripComments,
    getNoteAcks,
    getExcursions,
    getExcursionTravelers,
    getExcursionItems,
    getExcursionTracks,
    itemsWithOpenPrep,
    kpis,
    setTrip,
    sinks,
    applyChange,
    applyChanges,
  }
})
