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
import { optimisticDelete } from '@/sync/optimistic'
import { cascadeChanges } from '@/sync/cascade'
import { TABLE } from '@/api/tables'
import type { TrackUpload } from '@/api/types'
import {
  MAX_TRACKS,
  nextTrackPosition,
  orderTracks,
  trackSettingsChanges,
  type TrackSettings,
} from '@/domain/shared/track'
import { newId } from '@/lib/ids'
import type { TrackFiles } from '@/sync/featureModule'
import { trackSettingsColumns } from '@/sync/rows'
import type { Excursion, ExcursionItem, ExcursionTrack, TripItem } from '@/types/domain'
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
import { beforeIsOver, standingOf } from '@/domain/shared/tripPhase'

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
  /** FR-29.13: the idea it is made from; absent for none. */
  ideaId?: string | null
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

/** Where an excursion's track files go (FR-31.15) — `trackFiles.ts`'s `createExcursionTracks`. */
export type ExcursionTrackFiles = TrackFiles<
  ExcursionTrack,
  Pick<ExcursionTrack, 'id' | 'trip_id' | 'excursion_id' | 'position'>
>

/** createExcursionActions binds the excursion group to one sync context. */
export function createExcursionActions(
  ctx: SyncContext,
  deps: { groups: GroupWrites; tracks: ExcursionTrackFiles },
) {
  const { mutations, write, tripStore, masterStore, today, nowIso, tripDataLoaded } = ctx

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

    for (const planned of plan.suitcase) {
      if (planned.kind === 'create') {
        const { mutation, id } = mutations.addGeneratedTripItem(
          tripId,
          planned.fields,
          planned.travelerId,
        )
        write(mutation)
        createdIds.set(planned.ref, id)
        created.push(id)
      } else {
        const item = planned.tripItem
        const mutation = mutations.setQuantity(
          item.id,
          planned.quantity,
          item.packed_count,
          item.state,
        )
        write(mutation)
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
        write({
          mutation,
          optimistic: [
            ...cascadeChanges(TABLE.tripItems, id, tripStore, masterStore),
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
        write(mutation)
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
      write(mutation)
      lineIds.push(id)
    }

    const undo = () => {
      for (const id of lineIds) removeRow(TABLE.excursionItems, id)
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
      updateLine(set[i]!, {
        source_item_id: itemId,
        trip_item_id: suitcase.tripItemIdOf(planned),
        not_in_luggage: planned.not_in_luggage,
      })
    })
    return () => {
      for (const before of set) {
        const now = tripStore.getExcursionItems(tripId).find((l) => l.id === before.id)
        if (now) {
          updateLine(now, {
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
    table: typeof TABLE.excursionItems | typeof TABLE.excursionTravelers,
    id: string,
  ) {
    const mutation =
      table === TABLE.excursionItems
        ? mutations.deleteExcursionItem(id)
        : mutations.removeExcursionTraveler(id)
    write(mutation)
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
      ideaId: draft.ideaId ?? null,
    })
    write(mutation)

    for (const travelerId of draft.travelerIds ?? []) {
      const row = mutations.addExcursionTraveler(tripId, id, travelerId)
      write(row.mutation)
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
    write(mutations.updateExcursion(excursion.id, changed))
  }

  /** FR-31.1: the excursion goes, with its participants, lines and tracks; the suitcase is untouched. */
  function deleteExcursion(tripId: string, excursionId: string): void {
    const trackIds = tripStore.getExcursionTracks(tripId, excursionId).map((track) => track.id)
    const mutation = mutations.deleteExcursion(excursionId)
    write({
      mutation,
      optimistic: [
        ...cascadeChanges(TABLE.excursions, excursionId, tripStore, masterStore),
        optimisticDelete(mutation),
      ],
    })
    void deps.tracks.forget(trackIds)
  }

  // --- GPX tracks (FR-31.15, ADR-089) ---

  /** An excursion's tracks, in their order. */
  function tracksOf(tripId: string, excursionId: string): ExcursionTrack[] {
    return orderTracks(tripStore.getExcursionTracks(tripId, excursionId))
  }

  /**
   * A GPX track on an excursion, behind its last one, from what the device
   * read from the file. Null when the excursion already carries five, so
   * nothing is sent; a failed upload rejects, and the screen says so.
   */
  async function addTrack(excursion: Excursion, upload: TrackUpload): Promise<string | null> {
    const tracks = tracksOf(excursion.trip_id, excursion.id)
    if (tracks.length >= MAX_TRACKS) return null
    const id = newId()
    await deps.tracks.add(
      {
        id,
        trip_id: excursion.trip_id,
        excursion_id: excursion.id,
        position: nextTrackPosition(tracks),
      },
      upload,
    )
    return id
  }

  /** „Durch andere Datei ersetzen": the file changes, what was set stays. */
  function replaceTrack(track: ExcursionTrack, upload: TrackUpload): Promise<void> {
    return deps.tracks.replace(track, upload)
  }

  /** Writes only the settings that changed. */
  function updateTrack(track: ExcursionTrack, settings: TrackSettings): void {
    const patch = trackSettingsColumns(trackSettingsChanges(track, settings))
    if (Object.keys(patch).length === 0) return
    write(mutations.make('upsert', TABLE.excursionTracks, track.id, patch))
  }

  function removeTrack(track: ExcursionTrack): void {
    write(mutations.make('delete', TABLE.excursionTracks, track.id))
    void deps.tracks.forget([track.id])
  }

  /** The file as it was uploaded, to download or to edit. */
  function trackFile(track: ExcursionTrack): Promise<Blob | null> {
    return deps.tracks.file(track)
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
    for (const r of removedRows) removeRow(TABLE.excursionTravelers, r.id)
    const addedRowIds: string[] = []
    for (const travelerId of travelerIds ?? []) {
      if (rows.some((r) => r.traveler_id === travelerId)) continue
      const { mutation, id } = mutations.addExcursionTraveler(tripId, excursionId, travelerId)
      write(mutation)
      addedRowIds.push(id)
    }

    const after = participants(tripId, excursionId)
    const lines = tripStore.getExcursionItems(tripId, excursionId)
    const change = planParticipantChange(lines, before, after)
    for (const line of change.remove) removeRow(TABLE.excursionItems, line.id)
    const written = writeLines(tripId, excursionId, change.add)

    return () => {
      written.undo()
      for (const id of addedRowIds) removeRow(TABLE.excursionTravelers, id)
      for (const travelerId of beforeIds) {
        if (!removedRows.some((r) => r.traveler_id === travelerId)) continue
        const { mutation } = mutations.addExcursionTraveler(tripId, excursionId, travelerId)
        write(mutation)
      }
      for (const line of change.remove) restoreLine(line)
    }
  }

  /** Puts a removed line back under its own id — an undo's other half. */
  function restoreLine(line: ExcursionItem): void {
    write(mutations.restoreExcursionItem(line))
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
  function setLineCount(line: ExcursionItem, packedCount: number): void {
    write(mutations.setExcursionItemCount(line.id, packedCount, line.quantity))
  }

  /** FR-31.6: a tap on the check — all of it in, or all of it out again. */
  function toggleLine(line: ExcursionItem): void {
    setLineCount(line, line.packed_count >= line.quantity ? 0 : line.quantity)
  }

  /** FR-31.6: a different amount; what is packed is clamped to it. */
  function setLineQuantity(line: ExcursionItem, quantity: number): void {
    write(mutations.setExcursionItemCount(line.id, line.packed_count, quantity))
  }

  /** FR-31.6: decided against for this outing. */
  function skipLine(line: ExcursionItem): void {
    write(mutations.skipExcursionItem(line.id))
  }

  /** FR-31.6: taken back into the list at one. */
  function unskipLine(line: ExcursionItem): void {
    write(mutations.setExcursionItemCount(line.id, 0, 1))
  }

  function removeLine(line: ExcursionItem): () => void {
    removeRow(TABLE.excursionItems, line.id)
    return () => restoreLine(line)
  }

  function updateLine(
    line: ExcursionItem,
    fields: Parameters<typeof mutations.updateExcursionItem>[1],
  ): void {
    write(mutations.updateExcursionItem(line.id, fields))
  }

  /**
   * FR-31.7: *Vor Ort besorgen* — a line not in the luggage becomes a
   * purchase on the spot, and so a line of M6's Vor-Ort list (FR-31.8).
   */
  function buyOnTheSpot(line: ExcursionItem): void {
    updateLine(line, { mode: ITEM_MODE_BUY_LOCAL, bought_at: null })
  }

  /**
   * FR-31.5 from the line's sheet: the thing becomes shared, *für alle*, or
   * named people's — open lines of others go, a packed one stays, new people
   * get a line linked into the suitcase like any other. One undo for all of it.
   */
  function setForWhom(tripId: string, line: ExcursionItem, target: LineFor): () => void {
    const set = lineSetOf(line, tripStore.getExcursionItems(tripId, line.excursion_id))
    const change = planForWhom(set, target, participants(tripId, line.excursion_id))
    for (const gone of change.remove) removeRow(TABLE.excursionItems, gone.id)
    for (const { line: kept, forAll } of change.reflag) {
      updateLine(kept, { for_all_participants: forAll })
    }
    const written = writeLines(tripId, line.excursion_id, change.add)
    return () => {
      written.undo()
      for (const gone of change.remove) restoreLine(gone)
      for (const { line: kept } of change.reflag) {
        const now = tripStore.getExcursionItems(tripId).find((l) => l.id === kept.id)
        if (now) updateLine(now, { for_all_participants: kept.for_all_participants })
      }
    }
  }

  /**
   * FR-31.8: how a line is had — packed, or bought on the spot. Back to packing
   * drops the purchase record, which only a vor-Ort line can carry.
   */
  function setLineMode(line: ExcursionItem, mode: ExcursionItem['mode']): void {
    if (mode === line.mode) return
    updateLine(line, mode === ITEM_MODE_BUY_LOCAL ? { mode } : { mode, bought_at: null })
  }

  /** FR-31.8: bought on the spot, or put back on the list. */
  function markBought(line: ExcursionItem, bought: boolean): void {
    updateLine(line, { bought_at: bought ? nowIso() : null })
  }

  /** FR-30.13: the line's place on M6's Vor-Ort list — not on the excursion's own. */
  function placeLineOnShopping(line: ExcursionItem, position: number): void {
    updateLine(line, { shopping_position: position })
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
    write(mutation)
    write(mutations.packItem(id, line.quantity, 'packed'))
    if (line.assigned_traveler_id !== null) {
      write(mutations.assignTraveler(id, line.assigned_traveler_id))
    }
    updateLine(line, { trip_item_id: id, source_item_id: itemId })

    return () => {
      const current = tripStore.getExcursionItems(tripId).find((l) => l.id === line.id)
      if (current) updateLine(current, { trip_item_id: null, source_item_id: line.source_item_id })
      const deletion = mutations.deleteTripItem(id)
      write({
        mutation: deletion,
        optimistic: [
          ...cascadeChanges(TABLE.tripItems, id, tripStore, masterStore),
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
    placeLineOnShopping,
    addToPackingList,
    adoptIntoInventory,
    unlistedNames,
    saveAsGroup,
    tracksOf,
    addTrack,
    replaceTrack,
    updateTrack,
    removeTrack,
    trackFile,
  }
}

/** Two optional days in calendar order; one alone is a one-day outing. */
function orderedDays(a: string | null, b: string | null): [string | null, string | null] {
  if (a === null && b === null) return [null, null]
  if (a === null) return [b, b]
  if (b === null) return [a, a]
  return a <= b ? [a, b] : [b, a]
}
