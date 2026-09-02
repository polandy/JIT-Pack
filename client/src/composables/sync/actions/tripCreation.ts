/**
 * Making a trip: the M3 wizard (FR-2.x), the FR-12 clone and the M15
 * spreadsheet import (FR-16.2). Three cascades, one shape — rows across
 * both partitions in the order the server's foreign keys dictate, then one
 * push at the end.
 *
 * They are together because that order is the whole difficulty: the trips
 * row and the creator's membership live in the master partition, everything
 * the trip contains lives in its own, and a trip-partition push that
 * overtakes the master one is refused (403/FK). Whatever else they build,
 * all three answer that same question, and a fourth cascade should be
 * written here rather than beside them.
 *
 * The trip *after* it exists — its fields, its status, its roster — is
 * `tripLifecycle`. This group hands over as soon as the rows are queued.
 */
import { optimisticInsert, optimisticUpdate } from '@/sync/optimistic'
import { CLIENT_ACTOR_PLACEHOLDER } from '@/composables/useMutations'
import { planClone, type CloneOptions } from '@/domain/clone'
import { durationDays, type GeneratedItem } from '@/domain/instantiate'
import type { ImportPlan } from '@/domain/spreadsheet'
import { t } from '@/i18n'
import type { ItemMode } from '@/types/domain'
import type { SyncContext } from '../context'

/** Everything the M3 wizard collected before "Create trip". */
export interface TripWizardDraft {
  name: string
  /** FR-2.1b: required, and the only temporal fact that is. */
  year: number
  startDate: string | null
  endDate: string | null
  attributes: Record<string, unknown> | null
  travelers: { name: string; linkedUserId?: string | null }[]
  /** Generated rows — template items, or companions without a template (FR-20.2). */
  items: (Omit<GeneratedItem, 'source_template_id'> & { source_template_id: string | null })[]
  /** Attach to an existing series (FR-13.1). */
  seriesId?: string | null
  /** Create a series inline; its defaults seed from the trip attributes. */
  newSeriesName?: string | null
  /** Accepted destination checklist items (FR-13.3) — become trip items. */
  checklistItems?: { label: string; mode: ItemMode }[]
  /** Share with user accounts (FR-4.5) — the creator's Owner row is server-made. */
  members?: { userId: string; role: 'admin' | 'editor' }[]
  /**
   * FR-27.4: the templates the user picked, registered as the trip's
   * sources so it keeps following them while it is being planned. Empty
   * for a trip generated from nothing — it then never moves, which is
   * correct rather than a gap.
   */
  sourceTemplateIds?: string[]
}

/** cloneTrip input (FR-12.2): fresh name/dates plus the carry-over options. */
export interface CloneDraft {
  name: string
  /** FR-2.1b: required on a clone too — a copy is a trip of its own year. */
  year: number
  startDate: string | null
  endDate: string | null
  options: CloneOptions
}

/** createTripCreationActions binds the three cascades to one sync context. */
export function createTripCreationActions(ctx: SyncContext) {
  const { mutations, enqueue, drainPartitions, tripStore, masterStore, tripDataLoaded } = ctx

  /**
   * createTripFromWizard commits an M3 draft: the trips row goes to the
   * master partition, travelers and generated items to the new trip's
   * partition. The master partition drains first — the server creates
   * the trip row and the creator's owner membership there, without
   * which the trip-partition push would be rejected (403/FK).
   */
  function createTripFromWizard(draft: TripWizardDraft): string {
    // An inline-created series must precede the trip in the same master
    // queue — a separate drain could race and push the trip's series_id
    // reference before the series row exists.
    let seriesId = draft.seriesId ?? null
    if (draft.newSeriesName) {
      const { mutation, id } = mutations.createSeries(draft.newSeriesName, draft.attributes)
      enqueue('master', null, { mutation, optimistic: optimisticInsert(mutation) })
      seriesId = id
    }

    const { mutation: tripMut, id: tripId } = mutations.createTrip(
      draft.name,
      draft.year,
      draft.startDate,
      draft.endDate,
      { attributes: draft.attributes, seriesId },
    )
    enqueue('master', null, { mutation: tripMut, optimistic: optimisticInsert(tripMut) })

    // Member grants follow the trips insert in the same master queue —
    // the server authorizes them against the freshly created trip.
    for (const member of draft.members ?? []) {
      const { mutation } = mutations.addTripMember(tripId, member.userId, member.role)
      enqueue('master', null, { mutation, optimistic: optimisticInsert(mutation) })
    }

    const travelerIds = draft.travelers.map((tr) => {
      const { mutation, id } = mutations.addTraveler(tripId, tr.name, tr.linkedUserId ?? null)
      enqueue('trip', tripId, { mutation, optimistic: optimisticInsert(mutation) })
      return id
    })

    for (const item of draft.items) {
      const assignedTravelerId =
        item.traveler_index === null ? null : (travelerIds[item.traveler_index] ?? null)
      const { mutation, id } = mutations.addGeneratedTripItem(tripId, item, assignedTravelerId)
      enqueue('trip', tripId, { mutation, optimistic: optimisticInsert(mutation) })

      // FR-27.7: a position's preparation tasks become ordinary FR-7.3 todos
      // on the row they were generated for — no new flag, so "an item with an
      // open prep todo is not done" applies without a second mechanism.
      // Enqueued inside this loop so each todo follows the trip_items row it
      // references; pushed ahead of it, the server rejects the foreign key.
      for (const taskBody of item.tasks) {
        const { mutation: todoMut } = mutations.addTodo(
          tripId,
          id,
          CLIENT_ACTOR_PLACEHOLDER,
          taskBody,
        )
        enqueue('trip', tripId, { mutation: todoMut, optimistic: optimisticInsert(todoMut) })
      }
    }

    // FR-27.4: what the trip follows from here on. Registered after the
    // trips row and in the same master queue — the server resolves the FK
    // against a trip it has already created.
    for (const templateId of draft.sourceTemplateIds ?? []) {
      const { mutation } = mutations.registerTripSource(tripId, templateId)
      enqueue('master', null, { mutation, optimistic: optimisticInsert(mutation) })
    }

    for (const chk of draft.checklistItems ?? []) {
      const { mutation } = mutations.addTripItem(tripId, chk.label, { mode: chk.mode })
      enqueue('trip', tripId, { mutation, optimistic: optimisticInsert(mutation) })
    }

    drainPartitions([tripId])
    return tripId
  }

  /**
   * cloneTrip duplicates an archived trip per FR-12.1/12.2: the plan
   * comes from the pure domain (`planClone`), the cascade mirrors
   * createTripFromWizard — trips row to the master partition first,
   * then travelers, containers (pairing as a second pass, a forward
   * pair reference would violate the FK), then items with remapped
   * links. Returns the new trip id, or null when the source is unknown
   * or its rows are not on the device — "not pulled yet" must never be
   * read as "empty trip" (ADR-033), or the clone silently carries nothing.
   */
  function cloneTrip(sourceTripId: string, draft: CloneDraft): string | null {
    const source = tripStore.getTrip(sourceTripId)
    if (!source) return null
    if (!tripDataLoaded(sourceTripId)) return null

    const plan = planClone(
      {
        trip: source,
        items: tripStore.getItems(sourceTripId),
        travelers: tripStore.getTravelers(sourceTripId),
        containers: tripStore.getContainers(sourceTripId),
      },
      draft.options,
      {
        templateItem: (templateId, itemId) =>
          masterStore.getTemplateItems(templateId).find((ti) => ti.item_id === itemId),
        masterItem: (id) => masterStore.getItem(id),
      },
      durationDays(draft.startDate, draft.endDate),
    )

    const { mutation: tripMut, id: tripId } = mutations.createTrip(
      draft.name,
      draft.year,
      draft.startDate,
      draft.endDate,
      { seriesId: source.series_id, attributes: source.attributes },
    )
    enqueue('master', null, { mutation: tripMut, optimistic: optimisticInsert(tripMut) })

    const travelerIds = plan.travelers.map((tr) => {
      const { mutation, id } = mutations.addTraveler(tripId, tr.name, null)
      enqueue('trip', tripId, { mutation, optimistic: optimisticInsert(mutation) })
      return id
    })

    const containerIds = plan.containers.map((c) => {
      const { mutation, id } = mutations.addContainer(tripId, c.name, {
        carrierTravelerId:
          c.carrier_traveler_index === null
            ? null
            : (travelerIds[c.carrier_traveler_index] ?? null),
        maxWeightGrams: c.max_weight_grams,
      })
      enqueue('trip', tripId, { mutation, optimistic: optimisticInsert(mutation) })
      return id
    })
    plan.containers.forEach((c, i) => {
      if (c.paired_container_index === null) return
      const mutation = mutations.updateContainer(containerIds[i]!, {
        paired_container_id: containerIds[c.paired_container_index],
      })
      const base = plan.containers[i]!
      enqueue('trip', tripId, {
        mutation,
        optimistic: optimisticUpdate(mutation, {
          trip_id: tripId,
          name: base.name,
          carrier_traveler_id:
            base.carrier_traveler_index === null
              ? null
              : (travelerIds[base.carrier_traveler_index] ?? null),
          max_weight_grams: base.max_weight_grams,
        }),
      })
    })

    for (const item of plan.items) {
      const { mutation } = mutations.addClonedTripItem(
        tripId,
        item,
        item.traveler_index === null ? null : (travelerIds[item.traveler_index] ?? null),
        item.container_index === null ? null : (containerIds[item.container_index] ?? null),
      )
      enqueue('trip', tripId, { mutation, optimistic: optimisticInsert(mutation) })
    }

    drainPartitions([tripId])
    return tripId
  }

  /**
   * commitImport lands an M15 import plan (FR-16.2): categories and
   * master items on the master partition (merging where the dedup step
   * decided), then one archived `imported` trip per selected column with
   * its original quantities as packed rows; '?' noise becomes an open
   * task on the affected row (NFR-4.7). NFR-4.7's transactional rollback
   * is approximated client-side: the plan is fully validated before any
   * mutation is enqueued, parents precede children in the queues, and
   * mutation replay is idempotent — there is no server-side transaction
   * across a push batch.
   */
  /**
   * Record one item↔tag assignment on the import path, which enqueues
   * directly rather than through enqueueAndDrain: an import lands many
   * mutations and drains once at the end.
   */
  function assignTagLocally(itemId: string, tagId: string, position: number): void {
    const { mutation } = mutations.assignTag(itemId, tagId, position)
    enqueue('master', null, { mutation, optimistic: optimisticInsert(mutation) })
  }

  function commitImport(plan: ImportPlan): { tripIds: string[] } {
    // The spreadsheet's category column becomes a tag (FR-24.1): reuse by
    // (case-insensitive) name, create the rest.
    const tagIDs = new Map<string, string>()
    for (const tag of masterStore.tagList) {
      tagIDs.set(tag.name.toLowerCase(), tag.id)
    }
    for (const name of plan.newCategories) {
      if (tagIDs.has(name.toLowerCase())) continue
      const { mutation, id } = mutations.createTag(name)
      enqueue('master', null, { mutation, optimistic: optimisticInsert(mutation) })
      tagIDs.set(name.toLowerCase(), id)
    }

    const itemIDs: (string | null)[] = plan.items.map((item) => {
      if (item.existingItemId) return item.existingItemId
      const { mutation, id } = mutations.createMasterItem(item.name)
      enqueue('master', null, { mutation, optimistic: optimisticInsert(mutation) })
      // Only now: the imported category becomes the item's primary tag
      // (FR-24.2), and a tag assignment names its item by foreign key. Sent
      // first, every one of them is refused by a server that has not seen the
      // item yet — invisibly, because this device already holds both.
      const tagID = item.categoryName ? tagIDs.get(item.categoryName.toLowerCase()) : undefined
      if (tagID) assignTagLocally(id, tagID, 0)
      return id
    })

    const tripIds: string[] = []
    for (const trip of plan.trips) {
      const { mutation: tripMut, id: tripId } = mutations.createImportedTrip(
        trip.name,
        trip.year,
        trip.endDate,
        trip.seriesId,
      )
      enqueue('master', null, { mutation: tripMut, optimistic: optimisticInsert(tripMut) })
      tripIds.push(tripId)

      for (const entry of trip.items) {
        // buildImportPlan only emits in-range item indexes.
        const item = plan.items[entry.itemIndex]!
        const { mutation, id } = mutations.addImportedTripItem(tripId, {
          name: item.name,
          sourceItemId: itemIDs[entry.itemIndex] ?? null,
          categoryName: item.categoryName,
          quantity: entry.quantity,
        })
        enqueue('trip', tripId, { mutation, optimistic: optimisticInsert(mutation) })

        if (item.hasOpenTask) {
          // Author placeholder — the server stamps author_id on insert.
          // NFR-4.12: resolved at write time, never a module constant — a
          // finished string is unreachable by a language switch (ADR-037).
          const todo = mutations.addTodo(
            tripId,
            id,
            'import',
            t('import.wizard.noiseTodo', { name: item.name }),
          )
          enqueue('trip', tripId, {
            mutation: todo.mutation,
            optimistic: optimisticInsert(todo.mutation),
          })
        }
      }
    }

    drainPartitions(tripIds)
    return { tripIds }
  }

  return { createTripFromWizard, cloneTrip, commitImport }
}
