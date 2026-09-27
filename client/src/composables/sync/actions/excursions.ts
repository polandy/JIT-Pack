/**
 * Excursion actions (FR-31, ADR-077): create one from a Gruppe or empty,
 * change who goes, add lines — borrowing from the suitcase while it is open —
 * tick, count, skip, buy on the spot, delete, and save the list as a Gruppe.
 *
 * Every rule is in `domain/excursions.ts`; this group only turns the plans
 * into mutations. An act the screen offers to undo returns its own undo, a
 * closure over the rows it wrote, so „Rückgängig" takes back exactly that act
 * and nothing a second device did meanwhile.
 */
import { excursionItemRow, excursionRow, itemRow } from '../rows'
import { optimisticDelete, optimisticInsert, optimisticUpdate } from '@/sync/optimistic'
import { cascadeChanges } from '@/sync/cascade'
import { TABLE } from '@/types/tables'
import type { Excursion, ExcursionItem, TripItem } from '@/types/domain'
import { ITEM_MODE_BUY_LOCAL } from '@/types/domain'
import type { SyncContext } from '../context'
import {
  canJoinPackingList,
  draftOf,
  isExcursionOnly,
  type LinkPlan,
  type PlannedLine,
  lineSetOf,
  planForWhom,
  type LineFor,
  draftLinesFromGroup,
  inventoryItemFor,
  participantsOf,
  planGroupFromExcursion,
  planLinks,
  planParticipantChange,
  type DraftLine,
} from '@/domain/excursions'
import { beforeIsOver, standingOf } from '@/lib/tripPhase'

/** What creating an excursion did, for the screen's one undo. */
export interface ExcursionCreation {
  excursionId: string
  /** Lines written. */
  lines: number
  /** Suitcase rows created for it (FR-31.4). */
  addedToSuitcase: number
  /** Lines with nothing in the luggage behind them (FR-31.7). */
  notInLuggage: number
  undo: () => void
}

/** The fields the create sheet asks for. */
export interface ExcursionDraft {
  name: string
  startsOn: string | null
  endsOn: string | null
  /** Who goes; null for everybody (FR-31.3). */
  travelerIds: readonly string[] | null
  /** The Gruppe to start from, or null to start empty (FR-31.2). */
  templateId: string | null
}

/** Only the master-data writes saving as a Gruppe needs (FR-31.11). */
export interface GroupWrites {
  createMasterItem(name: string): string
  /** FR-31.13's undo: the item it created goes again (or retires, if something names it). */
  deleteMasterItem(itemId: string): void
  createTemplate(name: string, kind: 'group'): string | null
  addTemplateItem(
    templateId: string,
    itemId: string,
    opts: { quantity: number; assignment: string; defaultMode: ExcursionItem['mode'] },
  ): string
}

/** createExcursionActions binds the excursion group to one sync context. */
export function createExcursionActions(ctx: SyncContext, deps: { groups: GroupWrites }) {
  const { mutations, enqueueAndDrain, tripStore, masterStore, today, nowIso, tripDataLoaded } = ctx

  /** Whether the suitcase still takes things (FR-31.7) — *before* is not over. */
  function suitcaseOpen(tripId: string): boolean {
    const trip = tripStore.getTrip(tripId)
    return trip !== undefined && !beforeIsOver(standingOf(trip), today())
  }

  function participants(tripId: string, excursionId: string) {
    return participantsOf(
      excursionId,
      tripStore.getExcursionTravelers(tripId),
      tripStore.getTravelers(tripId),
    )
  }

  /**
   * writeLines settles where each draft comes from and writes it, with what
   * the suitcase gains for it (FR-31.4): created rows first, so a line never
   * reaches the server naming a row it has not seen, then raised amounts,
   * then the lines. Returns the undo of all of it.
   */
  /**
   * The suitcase half of a link plan (FR-31.4): created rows first, so a line
   * never reaches the server naming a row it has not seen, then raised
   * amounts. Returns where each planned line points and the undo of it all.
   */
  function applySuitcase(tripId: string, plan: LinkPlan) {
    const createdIds = new Map<string, string>()
    const created: string[] = []
    const raised: Array<{ item: TripItem; quantity: number }> = []

    for (const write of plan.suitcase) {
      if (write.kind === 'create') {
        const { mutation, id } = mutations.addGeneratedTripItem(
          tripId,
          write.fields,
          write.travelerId,
        )
        enqueueAndDrain('trip', tripId, { mutation, optimistic: optimisticInsert(mutation) })
        createdIds.set(write.ref, id)
        created.push(id)
      } else {
        const item = write.tripItem
        const mutation = mutations.setQuantity(
          item.id,
          write.quantity,
          item.packed_count,
          item.state,
        )
        enqueueAndDrain('trip', tripId, {
          mutation,
          optimistic: optimisticUpdate(mutation, itemRow(item)),
        })
        raised.push({ item, quantity: item.quantity })
      }
    }

    const tripItemIdOf = (planned: PlannedLine): string | null => {
      const link = planned.link
      if (link === null) return null
      return 'existing' in link ? link.existing : (createdIds.get(link.created) ?? null)
    }

    const undo = () => {
      for (const id of created) {
        const mutation = mutations.deleteTripItem(id)
        enqueueAndDrain('trip', tripId, {
          mutation,
          optimistic: [
            ...cascadeChanges(TABLE.tripItems, id, { tripStore, masterStore }),
            optimisticDelete(mutation),
          ],
        })
      }
      for (const { item, quantity } of raised) {
        const current = tripStore.getItems(tripId).find((i) => i.id === item.id)
        if (!current) continue
        const mutation = mutations.setQuantity(
          current.id,
          quantity,
          current.packed_count,
          current.state,
        )
        enqueueAndDrain('trip', tripId, {
          mutation,
          optimistic: optimisticUpdate(mutation, itemRow(current)),
        })
      }
    }
    return { tripItemIdOf, created: created.length, undo }
  }

  /**
   * writeLines settles where each draft comes from and writes it, with what
   * the suitcase gains for it (FR-31.4). Returns the undo of all of it.
   */
  function writeLines(tripId: string, excursionId: string, drafts: readonly DraftLine[]) {
    const plan = planLinks(drafts, tripStore.getItems(tripId), suitcaseOpen(tripId))
    const suitcase = applySuitcase(tripId, plan)

    const lineIds: string[] = []
    for (const planned of plan.lines) {
      const { mutation, id } = mutations.addExcursionItem(tripId, excursionId, {
        ...planned.draft,
        trip_item_id: suitcase.tripItemIdOf(planned),
        not_in_luggage: planned.not_in_luggage,
      })
      enqueueAndDrain('trip', tripId, { mutation, optimistic: optimisticInsert(mutation) })
      lineIds.push(id)
    }

    const undo = () => {
      for (const id of lineIds) removeRow(tripId, TABLE.excursionItems, id)
      suitcase.undo()
    }
    return {
      lines: lineIds.length,
      addedToSuitcase: suitcase.created,
      notInLuggage: plan.lines.filter((l) => l.not_in_luggage).length,
      undo,
    }
  }

  /**
   * FR-31.14: a line of the excursion alone joins the inventory — as the item
   * of that name, or a new one — and from then on is linked like any line:
   * into the suitcase while it is open, marked *nicht im Gepäck* once it is
   * not. Every line of the same thing goes along. Returns the undo.
   */
  function adoptIntoInventory(tripId: string, line: ExcursionItem): (() => void) | null {
    if (!isExcursionOnly(line)) return null
    const set = lineSetOf(line, tripStore.getExcursionItems(tripId, line.excursion_id))
    const target = inventoryItemFor(line, masterStore.activeItemList)
    const createdItem = 'create' in target ? deps.groups.createMasterItem(target.create) : null
    const itemId = 'itemId' in target ? target.itemId : createdItem!
    const plan = planLinks(
      set.map((l) => ({ ...draftOf(l), source_item_id: itemId })),
      tripStore.getItems(tripId),
      suitcaseOpen(tripId),
    )
    const suitcase = applySuitcase(tripId, plan)
    plan.lines.forEach((planned, i) => {
      updateLine(tripId, set[i]!, {
        source_item_id: itemId,
        trip_item_id: suitcase.tripItemIdOf(planned),
        not_in_luggage: planned.not_in_luggage,
      })
    })
    return () => {
      for (const before of set) {
        const now = tripStore.getExcursionItems(tripId).find((l) => l.id === before.id)
        if (now) {
          updateLine(tripId, now, {
            source_item_id: null,
            trip_item_id: before.trip_item_id,
            not_in_luggage: before.not_in_luggage,
          })
        }
      }
      suitcase.undo()
      if (createdItem !== null) deps.groups.deleteMasterItem(createdItem)
    }
  }

  function removeRow(
    tripId: string,
    table: typeof TABLE.excursionItems | typeof TABLE.excursionTravelers,
    id: string,
  ) {
    const mutation =
      table === TABLE.excursionItems
        ? mutations.deleteExcursionItem(id)
        : mutations.removeExcursionTraveler(id)
    enqueueAndDrain('trip', tripId, { mutation, optimistic: optimisticDelete(mutation) })
  }

  /**
   * FR-31.1/31.2: a new excursion, its participants and — from a Gruppe —
   * its lines, linked into the suitcase. Null where the trip's rows are not
   * on the device yet: linking against a list not pulled would create the
   * whole Gruppe a second time (ADR-016's guard).
   */
  function createExcursion(tripId: string, draft: ExcursionDraft): ExcursionCreation | null {
    const trip = tripStore.getTrip(tripId)
    if (!trip || !tripDataLoaded(tripId)) return null
    const [startsOn, endsOn] = orderedDays(draft.startsOn, draft.endsOn)
    const { mutation, id } = mutations.createExcursion(tripId, {
      name: draft.name.trim(),
      startsOn,
      endsOn,
      sourceTemplateId: draft.templateId,
    })
    enqueueAndDrain('trip', tripId, { mutation, optimistic: optimisticInsert(mutation) })

    for (const travelerId of draft.travelerIds ?? []) {
      const row = mutations.addExcursionTraveler(tripId, id, travelerId)
      enqueueAndDrain('trip', tripId, {
        mutation: row.mutation,
        optimistic: optimisticInsert(row.mutation),
      })
    }

    const drafts =
      draft.templateId === null
        ? []
        : draftLinesFromGroup({
            templateId: draft.templateId,
            templates: masterStore.templateList,
            includes: masterStore.includeList,
            templateItems: masterStore.positionList,
            templateItemTasks: masterStore.templateItemTaskList,
            masterItems: masterStore.categorisedItemList,
            attributes: trip.attributes,
            participants: participants(tripId, id),
          })
    const written = writeLines(tripId, id, drafts)
    return {
      excursionId: id,
      lines: written.lines,
      addedToSuitcase: written.addedToSuitcase,
      notInLuggage: written.notInLuggage,
      undo: () => {
        written.undo()
        deleteExcursion(tripId, id)
      },
    }
  }

  /** FR-31.1: rename or re-date; a reversed pair is written in order. */
  function updateExcursion(
    tripId: string,
    excursion: Excursion,
    fields: { name?: string; startsOn?: string | null; endsOn?: string | null },
  ): void {
    const [startsOn, endsOn] = orderedDays(
      fields.startsOn === undefined ? excursion.starts_on : fields.startsOn,
      fields.endsOn === undefined ? excursion.ends_on : fields.endsOn,
    )
    const changed: Partial<Pick<Excursion, 'name' | 'starts_on' | 'ends_on'>> = {}
    if (fields.name !== undefined && fields.name.trim() !== excursion.name)
      changed.name = fields.name.trim()
    if (startsOn !== excursion.starts_on) changed.starts_on = startsOn
    if (endsOn !== excursion.ends_on) changed.ends_on = endsOn
    if (Object.keys(changed).length === 0) return
    const mutation = mutations.updateExcursion(excursion.id, changed)
    enqueueAndDrain('trip', tripId, {
      mutation,
      optimistic: optimisticUpdate(mutation, excursionRow(excursion)),
    })
  }

  /** FR-31.1: the excursion goes, with its participants and lines; the suitcase is untouched. */
  function deleteExcursion(tripId: string, excursionId: string): void {
    const mutation = mutations.deleteExcursion(excursionId)
    enqueueAndDrain('trip', tripId, {
      mutation,
      optimistic: [
        ...cascadeChanges(TABLE.excursions, excursionId, { tripStore, masterStore }),
        optimisticDelete(mutation),
      ],
    })
  }

  /**
   * FR-31.3/31.5: who goes now — null for everybody. The list follows: a
   * joiner gets a line of every *für alle* set, a leaver's open lines go and
   * their packed ones stay. One undo takes back the people and the lines.
   */
  function setParticipants(
    tripId: string,
    excursionId: string,
    travelerIds: readonly string[] | null,
  ): () => void {
    const before = participants(tripId, excursionId)
    const rows = tripStore
      .getExcursionTravelers(tripId)
      .filter((r) => r.excursion_id === excursionId)
    const beforeIds = rows.map((r) => r.traveler_id)
    const wanted = new Set(travelerIds ?? [])

    const removedRows = rows.filter((r) => travelerIds === null || !wanted.has(r.traveler_id))
    for (const r of removedRows) removeRow(tripId, TABLE.excursionTravelers, r.id)
    const addedRowIds: string[] = []
    for (const travelerId of travelerIds ?? []) {
      if (rows.some((r) => r.traveler_id === travelerId)) continue
      const { mutation, id } = mutations.addExcursionTraveler(tripId, excursionId, travelerId)
      enqueueAndDrain('trip', tripId, { mutation, optimistic: optimisticInsert(mutation) })
      addedRowIds.push(id)
    }

    const after = participants(tripId, excursionId)
    const lines = tripStore.getExcursionItems(tripId, excursionId)
    const change = planParticipantChange(lines, before, after)
    for (const line of change.remove) removeRow(tripId, TABLE.excursionItems, line.id)
    const written = writeLines(tripId, excursionId, change.add)

    return () => {
      written.undo()
      for (const id of addedRowIds) removeRow(tripId, TABLE.excursionTravelers, id)
      for (const travelerId of beforeIds) {
        if (!removedRows.some((r) => r.traveler_id === travelerId)) continue
        const { mutation } = mutations.addExcursionTraveler(tripId, excursionId, travelerId)
        enqueueAndDrain('trip', tripId, { mutation, optimistic: optimisticInsert(mutation) })
      }
      for (const line of change.remove) restoreLine(tripId, line)
    }
  }

  /** Puts a removed line back under its own id — an undo's other half. */
  function restoreLine(tripId: string, line: ExcursionItem): void {
    const mutation = mutations.restoreExcursionItem(line)
    enqueueAndDrain('trip', tripId, { mutation, optimistic: optimisticInsert(mutation) })
  }

  /**
   * FR-31.2 on an excursion that exists: the quick-add's group, expanded over
   * its participants and linked like the lines it started with. Things the
   * list already carries are left out, by master item (FR-27.10's rule).
   */
  function addGroupLines(tripId: string, excursionId: string, templateId: string) {
    const trip = tripStore.getTrip(tripId)
    if (!trip || !tripDataLoaded(tripId)) return null
    const carried = new Set(
      tripStore
        .getExcursionItems(tripId, excursionId)
        .map((l) => l.source_item_id)
        .filter((id): id is string => id !== null),
    )
    const drafts = draftLinesFromGroup({
      templateId,
      templates: masterStore.templateList,
      includes: masterStore.includeList,
      templateItems: masterStore.positionList,
      templateItemTasks: masterStore.templateItemTaskList,
      masterItems: masterStore.categorisedItemList,
      attributes: trip.attributes,
      participants: participants(tripId, excursionId),
    }).filter((d) => d.source_item_id === null || !carried.has(d.source_item_id))
    return writeLines(tripId, excursionId, drafts)
  }

  /** FR-31.4/31.5: lines typed or picked in the composer, linked like a Gruppe's. */
  function addLines(tripId: string, excursionId: string, drafts: readonly DraftLine[]) {
    return writeLines(tripId, excursionId, drafts)
  }

  /** FR-31.6: how many of a line are in the rucksack. */
  function setLineCount(tripId: string, line: ExcursionItem, packedCount: number): void {
    const mutation = mutations.setExcursionItemCount(line.id, packedCount, line.quantity)
    enqueueAndDrain('trip', tripId, {
      mutation,
      optimistic: optimisticUpdate(mutation, excursionItemRow(line)),
    })
  }

  /** FR-31.6: a tap on the check — all of it in, or all of it out again. */
  function toggleLine(tripId: string, line: ExcursionItem): void {
    setLineCount(tripId, line, line.packed_count >= line.quantity ? 0 : line.quantity)
  }

  /** FR-31.6: a different amount; what is packed is clamped to it. */
  function setLineQuantity(tripId: string, line: ExcursionItem, quantity: number): void {
    const mutation = mutations.setExcursionItemCount(line.id, line.packed_count, quantity)
    enqueueAndDrain('trip', tripId, {
      mutation,
      optimistic: optimisticUpdate(mutation, excursionItemRow(line)),
    })
  }

  /** FR-31.6: decided against for this outing. */
  function skipLine(tripId: string, line: ExcursionItem): void {
    const mutation = mutations.skipExcursionItem(line.id)
    enqueueAndDrain('trip', tripId, {
      mutation,
      optimistic: optimisticUpdate(mutation, excursionItemRow(line)),
    })
  }

  /** FR-31.6: taken back into the list at one. */
  function unskipLine(tripId: string, line: ExcursionItem): void {
    const mutation = mutations.setExcursionItemCount(line.id, 0, 1)
    enqueueAndDrain('trip', tripId, {
      mutation,
      optimistic: optimisticUpdate(mutation, excursionItemRow(line)),
    })
  }

  function removeLine(tripId: string, line: ExcursionItem): () => void {
    removeRow(tripId, TABLE.excursionItems, line.id)
    return () => restoreLine(tripId, line)
  }

  function updateLine(
    tripId: string,
    line: ExcursionItem,
    fields: Parameters<typeof mutations.updateExcursionItem>[1],
  ): void {
    const mutation = mutations.updateExcursionItem(line.id, fields)
    enqueueAndDrain('trip', tripId, {
      mutation,
      optimistic: optimisticUpdate(mutation, excursionItemRow(line)),
    })
  }

  /**
   * FR-31.7: *Vor Ort besorgen* — a line not in the luggage becomes a
   * purchase on the spot, and so a line of M6's Vor-Ort list (FR-31.8).
   */
  function buyOnTheSpot(tripId: string, line: ExcursionItem): void {
    updateLine(tripId, line, { mode: ITEM_MODE_BUY_LOCAL, bought_at: null })
  }

  /**
   * FR-31.5 from the line's sheet: the thing becomes shared, *für alle*, or
   * named people's — open lines of others go, a packed one stays, new people
   * get a line linked into the suitcase like any other. One undo for all of it.
   */
  function setForWhom(tripId: string, line: ExcursionItem, target: LineFor): () => void {
    const set = lineSetOf(line, tripStore.getExcursionItems(tripId, line.excursion_id))
    const change = planForWhom(set, target, participants(tripId, line.excursion_id))
    for (const gone of change.remove) removeRow(tripId, TABLE.excursionItems, gone.id)
    for (const { line: kept, forAll } of change.reflag) {
      updateLine(tripId, kept, { for_all_participants: forAll })
    }
    const written = writeLines(tripId, line.excursion_id, change.add)
    return () => {
      written.undo()
      for (const gone of change.remove) restoreLine(tripId, gone)
      for (const { line: kept } of change.reflag) {
        const now = tripStore.getExcursionItems(tripId).find((l) => l.id === kept.id)
        if (now) updateLine(tripId, now, { for_all_participants: kept.for_all_participants })
      }
    }
  }

  /**
   * FR-31.8: how a line is had — packed, or bought on the spot. Back to packing
   * drops the purchase record, which only a vor-Ort line can carry.
   */
  function setLineMode(tripId: string, line: ExcursionItem, mode: ExcursionItem['mode']): void {
    if (mode === line.mode) return
    updateLine(tripId, line, mode === ITEM_MODE_BUY_LOCAL ? { mode } : { mode, bought_at: null })
  }

  /** FR-31.8: bought on the spot, or put back on the list. */
  function markBought(tripId: string, line: ExcursionItem, bought: boolean): void {
    updateLine(tripId, line, { bought_at: bought ? nowIso() : null })
  }

  /**
   * FR-31.13: something bought on the spot joins the trip — a suitcase row,
   * packed (it is in hand), linked to the inventory item it is, which is
   * created where the inventory has none of that name. The line keeps its
   * record of the purchase and now borrows the row. Returns the undo, or null
   * where the line is no bought vor-Ort line off the list.
   */
  function addToPackingList(tripId: string, line: ExcursionItem): (() => void) | null {
    if (!canJoinPackingList(line)) return null
    const target = inventoryItemFor(line, masterStore.activeItemList)
    const createdItem = 'create' in target ? deps.groups.createMasterItem(target.create) : null
    const itemId = 'itemId' in target ? target.itemId : createdItem!
    const { mutation, id } = mutations.addTripItem(tripId, line.name, {
      sourceItemId: itemId,
      categoryName: line.category_name,
      quantity: line.quantity,
    })
    enqueueAndDrain('trip', tripId, { mutation, optimistic: optimisticInsert(mutation) })
    // Each write repaints the whole row as the store now holds it — a paint
    // built from the insert's fields alone would blank the rest (rows.ts).
    const rowNow = () => itemRow(tripStore.getItems(tripId).find((i) => i.id === id)!)
    const pack = mutations.packItem(id, line.quantity, 'packed')
    enqueueAndDrain('trip', tripId, {
      mutation: pack,
      optimistic: optimisticUpdate(pack, rowNow()),
    })
    if (line.assigned_traveler_id !== null) {
      const assign = mutations.assignTraveler(id, line.assigned_traveler_id)
      enqueueAndDrain('trip', tripId, {
        mutation: assign,
        optimistic: optimisticUpdate(assign, rowNow()),
      })
    }
    updateLine(tripId, line, { trip_item_id: id, source_item_id: itemId })

    return () => {
      const current = tripStore.getExcursionItems(tripId).find((l) => l.id === line.id)
      if (current)
        updateLine(tripId, current, { trip_item_id: null, source_item_id: line.source_item_id })
      const deletion = mutations.deleteTripItem(id)
      enqueueAndDrain('trip', tripId, {
        mutation: deletion,
        optimistic: [
          ...cascadeChanges(TABLE.tripItems, id, { tripStore, masterStore }),
          optimisticDelete(deletion),
        ],
      })
      if (createdItem !== null) deps.groups.deleteMasterItem(createdItem)
    }
  }

  /**
   * FR-31.14: the names a Gruppe saved from this excursion would add to the
   * inventory — what the screen asks about before saving.
   */
  function unlistedNames(tripId: string, excursionId: string): string[] {
    return planGroupFromExcursion(
      tripStore.getExcursionItems(tripId, excursionId),
      masterStore.activeItemList,
    ).newMasterItems
  }

  /**
   * FR-31.11: *Als Gruppe speichern* — master items for names the inventory
   * lacks, then the Gruppe, then its positions. Null where the name is taken.
   */
  function saveAsGroup(
    tripId: string,
    excursionId: string,
    name: string,
    includeUnlisted = true,
  ): string | null {
    const plan = planGroupFromExcursion(
      tripStore.getExcursionItems(tripId, excursionId),
      masterStore.activeItemList,
      includeUnlisted,
    )
    const groupId = deps.groups.createTemplate(name.trim(), 'group')
    if (groupId === null) return null
    const invented = new Map<string, string>()
    for (const itemName of plan.newMasterItems)
      invented.set(itemName, deps.groups.createMasterItem(itemName))
    for (const position of plan.positions) {
      const itemId = position.itemId ?? invented.get(position.name)
      if (!itemId) continue
      deps.groups.addTemplateItem(groupId, itemId, {
        quantity: position.quantity,
        assignment: position.assignment,
        defaultMode: position.default_mode,
      })
    }
    return groupId
  }

  return {
    createExcursion,
    updateExcursion,
    deleteExcursion,
    setParticipants,
    addLines,
    addGroupLines,
    setLineCount,
    toggleLine,
    setLineQuantity,
    skipLine,
    unskipLine,
    removeLine,
    buyOnTheSpot,
    setLineMode,
    updateLine,
    setForWhom,
    markBought,
    addToPackingList,
    adoptIntoInventory,
    unlistedNames,
    saveAsGroup,
  }
}

/** Two optional days in calendar order; one alone is a one-day outing. */
function orderedDays(a: string | null, b: string | null): [string | null, string | null] {
  if (a === null && b === null) return [null, null]
  if (a === null) return [b, b]
  if (b === null) return [a, a]
  return a <= b ? [a, b] : [b, a]
}
