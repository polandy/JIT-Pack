/**
 * The quick-add and its browse-sheet (FR-25.13): what an add writes on the
 * trip. What the sheet's verbs do to the rows a master item already has, and
 * the in-row undo for each, are `useBrowseVerbs`, shared with an excursion.
 */
import { SPREAD } from '@/app/actions/packing'
import type { BrowseAddition } from '@/domain/browseRows'
import { rowsCarryingContent } from '@/domain/membership'
import { t } from '@/i18n'
import { FAB_ANCHOR } from '@/lib/fabAnchors'
import { groupAdditionMessage } from '@/lib/groupAdditionMessage'
import { presentToast } from '@/composables/shared/toast'
import type { AddedItemDecision } from '@/sync/mutations'
import { STATE_PACKED, type TripItem } from '@/types/domain'

import { useBrowseVerbs } from './useBrowseVerbs'
import type { PackingCore } from './usePackingCore'
import type { RowFacts } from './useRowFacts'

/** Builds the quick-add's bindings over the page's core. */
export function useBrowseAdd(core: PackingCore, facts: RowFacts) {
  const { tripId, tripStore, orchestrator } = core
  const verbs = useBrowseVerbs(core.port, (item) =>
    core.locked(item) ? (facts.lockNote(item) ?? t('packing.lockedByUnknown')) : null,
  )
  const { rowsOfMasterItem, remember } = verbs

  /** The master item's own fields, as an add takes them (FR-25.7 defaults). */
  function quickAddOptions(item: BrowseAddition) {
    return {
      sourceItemId: item.sourceItemId,
      weightGrams: item.weightGrams,
      valueCents: item.valueCents,
      categoryName: item.categoryName,
    }
  }

  /**
   * FR-25.28: a composer add is for whoever the strip over the field names — no
   * traveler is a shared row, as it always was. It goes through the same action
   * FR-25.13h's avatar buttons use, called with no existing rows, so an add for
   * two people and a browse-sheet pick of the same two write identical rows. A
   * decided add (FR-25.13f) only ever comes from the browse-sheet, which answers
   * *for whom* per line and sends no travelers here.
   */
  function onQuickAdd(
    item: BrowseAddition & { travelerIds: string[] },
    decided?: AddedItemDecision,
  ) {
    const opts = quickAddOptions(item)
    // FR-5.10: while the packing is closed, a row typed here is a thing that
    // travelled and was never on the list — so it lands
    // *packed* rather than as the one open job on a finished list. An add for
    // named travelers keeps the open row it always wrote: a row per person is
    // a plan being made, not a bag being recorded.
    const decision: AddedItemDecision | undefined =
      decided ??
      (core.packingClosed.value && item.travelerIds.length === 0 ? STATE_PACKED : undefined)
    const { id: addedId, companions } = decision
      ? orchestrator.packing.addDecidedItem(tripId, item.name, opts, core.active.value, decision)
      : orchestrator.packing.setTravelerAssignment(
          tripId,
          item.name,
          opts,
          core.active.value,
          [],
          item.travelerIds,
        )
    remember(item.sourceItemId, () => orchestrator.packing.removeAddedItem(tripId, addedId))
    announceCompanions(companions)
  }

  /**
   * FR-20.4: say what came along. Named rather than counted, the way FR-20.2's
   * skip names what it took with it — a bare number sends the reader looking for
   * what changed, which is the complaint this answers.
   */
  function announceCompanions(companions: string[]) {
    if (companions.length === 0) return
    void presentToast({
      message: t('packing.companionsAdded', {
        n: companions.length,
        names: companions.join(', '),
      }),
      // Above the composer's own anchor, like every other M4 toast: this one
      // fires while the quick-add is still open for the next entry.
      positionAnchor: FAB_ANCHOR.m4,
    })
  }

  /**
   * FR-25.13g: the browse-sheet's „für alle" on a line the trip does not carry
   * yet — one tap adds the row and hands it to every traveler.
   *
   * The undo takes out **every** row the tap left behind, the re-pointed one
   * included: none of them existed before it.
   */
  function onAddForAll(item: BrowseAddition) {
    const result = orchestrator.packing.addItemForEveryTraveler(
      tripId,
      item.name,
      quickAddOptions(item),
      core.active.value,
    )
    if (item.sourceItemId) {
      const ids = result.ids
      remember(item.sourceItemId, () => {
        for (const id of ids) orchestrator.packing.removeAddedItem(tripId, id)
      })
    }
    if (result.outcome !== SPREAD.done) void reportSpreadRefused()
    announceCompanions(result.companions)
  }

  /**
   * FR-25.13h: the browse-sheet's avatar buttons / long-press pick — always
   * sent as the whole desired set of travelers, so a second tap adds a second
   * traveler to the row this run already wrote (or removes one, tapped again)
   * rather than starting a second, unrelated row for the same item.
   *
   * `rowsOfMasterItem` is read fresh rather than passed a cached id: the sheet
   * itself has no row ids to hand back after the first tap (it only ever sees
   * `BrowseAddition`s), and the undo has the same shape — recomputed live at
   * the moment it fires, so it always removes whatever this run currently has
   * for the item rather than a snapshot that a later toggle already changed.
   */
  function onAssignForTravelers(item: BrowseAddition, travelerIds: string[]) {
    const { companions } = orchestrator.packing.setTravelerAssignment(
      tripId,
      item.name,
      quickAddOptions(item),
      core.active.value,
      item.sourceItemId ? rowsOfMasterItem(item.sourceItemId) : [],
      travelerIds,
    )
    if (item.sourceItemId) {
      const itemId = item.sourceItemId
      remember(itemId, () => {
        for (const row of rowsOfMasterItem(itemId))
          orchestrator.packing.removeAddedItem(tripId, row.id)
      })
    }
    announceCompanions(companions)
  }

  /**
   * FR-25.13g on a line the trip already carries: the travelers without a row
   * for it get one, and what is already there keeps the amount somebody chose
   * (ADR-036 keep-and-repoint).
   */
  function onSpread(itemId: string) {
    const rows = rowsOfMasterItem(itemId)
    const result = orchestrator.packing.spreadOverEveryTraveler(tripId, rows, rowsWithContent(rows))
    if (result.outcome !== SPREAD.done || !result.restore) {
      void reportSpreadRefused()
      return
    }
    const restore = result.restore
    remember(itemId, () => orchestrator.packing.restoreMembership(tripId, restore))
  }

  /** What a delete of these rows would cost beyond the rows (FR-7.1/7.3). */
  function rowsWithContent(rows: TripItem[]): string[] {
    return rowsCarryingContent(rows, {
      hasComments: (rowId) => tripStore.getItemComments(tripId, rowId).length > 0,
      hasPrepTask: (rowId) => tripStore.getPrepTasks(tripId).some((t) => t.trip_item_id === rowId),
    })
  }

  /**
   * A spread declines rather than deletes: its own way back cannot recreate a
   * row, so a plan carrying a delete is refused and said out loud. Deciding it
   * belongs to the membership editor, which has the confirm for it (ADR-036).
   */
  function reportSpreadRefused() {
    return presentToast({
      message: t('packing.forAllRefused'),
      positionAnchor: FAB_ANCHOR.m4,
    })
  }

  /**
   * FR-27.10: one tap in the quick-add expands a whole group onto the trip.
   *
   * **The result is always reported** — which sentence, and why each outcome
   * needs its own, is `groupAdditionMessage`. A plain toast: there is no undo
   * to offer.
   */
  async function onAddGroup(templateId: string) {
    const report = orchestrator.tripLifecycle.addGroupToTrip(tripId, templateId)
    await presentToast({ message: groupAdditionMessage(report), positionAnchor: FAB_ANCHOR.m4 })
  }

  return {
    scope: verbs.scope,
    onQuickAdd,
    onBrowse: verbs.onBrowse({
      // A sheet add answers *for whom* per line (FR-25.13g/h), never through the strip.
      add: (item, decided) => onQuickAdd({ ...item, travelerIds: [] }, decided),
      addForAll: onAddForAll,
      assign: onAssignForTravelers,
      spread: onSpread,
    }),
    onAddGroup,
  }
}
