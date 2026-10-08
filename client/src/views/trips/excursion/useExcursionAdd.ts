/**
 * M4's quick-add on an excursion's list (FR-31.5): what an add writes — lines
 * for the people going, or one for nobody in particular — and the browse
 * sheet's *für wen* over them. The sheet's pack, skip, reopen and in-row undo
 * are M4's own (`useBrowseVerbs`).
 */
import type { ComputedRef } from 'vue'

import type { BrowseAddition } from '@/components/global/QuickAddItem.vue'
import { presentToast } from '@/composables/shared/toast'
import { useOrchestrator } from '@/composables/shared/useOrchestrator'
import { draftLinesFor, lineForOf, type LineFor } from '@/domain/excursionLines'
import { t } from '@/i18n'
import { FAB_ANCHOR } from '@/lib/fabAnchors'
import { groupAdditionMessage } from '@/lib/groupAdditionMessage'
import { useMasterStore } from '@/stores/masterStore'
import { ITEM_MODE_PACK, type ExcursionItem, type Traveler } from '@/types/domain'

import type { BrowseVerbs } from '../packing/useBrowseVerbs'

/** What {@link useExcursionAdd} writes to and remembers in. */
export interface ExcursionAddTarget {
  tripId: string
  excursionId: string
  lines: ComputedRef<ExcursionItem[]>
  participants: ComputedRef<Traveler[]>
  verbs: Pick<BrowseVerbs, 'remember' | 'remembers'>
}

/** Builds the excursion's add handlers for `QuickAddItem`. */
export function useExcursionAdd(target: ExcursionAddTarget) {
  const orchestrator = useOrchestrator()
  const masterStore = useMasterStore()
  const { tripId, excursionId, participants, verbs } = target

  function linesOfItem(itemId: string): ExcursionItem[] {
    return target.lines.value.filter((line) => line.source_item_id === itemId)
  }

  function addFrom(item: BrowseAddition, lineFor: LineFor) {
    const written = orchestrator.addLines(
      tripId,
      excursionId,
      draftLinesFor(
        {
          source_item_id: item.sourceItemId,
          name: item.name,
          category_name: item.categoryName,
          quantity: 1,
          mode: ITEM_MODE_PACK,
          weight_grams: item.weightGrams,
          value_cents: item.valueCents,
          source_template_id: null,
        },
        lineFor,
        participants.value,
      ),
    )
    if (item.sourceItemId) verbs.remember(item.sourceItemId, written.undo)
  }

  function onQuickAdd(item: BrowseAddition & { travelerIds: string[] }) {
    addFrom(item, lineForOf(item.travelerIds, participants.value.length))
  }

  /** FR-31.14: *Nur für diesen Ausflug* — a line no inventory item names, kept out of the suitcase. */
  function onQuickAddLocal(item: { name: string; travelerIds: string[] }) {
    orchestrator.addLines(
      tripId,
      excursionId,
      draftLinesFor(
        {
          source_item_id: null,
          name: item.name,
          category_name: null,
          quantity: 1,
          mode: ITEM_MODE_PACK,
          weight_grams: null,
          value_cents: null,
          source_template_id: null,
        },
        lineForOf(item.travelerIds, participants.value.length),
        participants.value,
      ),
    )
  }

  function onQuickAddForAll(item: BrowseAddition) {
    addFrom(item, { kind: 'all' })
  }

  /**
   * FR-25.13h: the browse sheet's people for one thing — always the whole set,
   * so a second tap changes the lines this run wrote rather than adding more.
   */
  function onAssignForTravelers(item: BrowseAddition, travelerIds: string[]) {
    const first = item.sourceItemId ? linesOfItem(item.sourceItemId)[0] : undefined
    if (!first) {
      addFrom(item, lineForOf(travelerIds, participants.value.length))
      return
    }
    const undo = orchestrator.setForWhom(
      tripId,
      first,
      lineForOf(travelerIds, participants.value.length),
    )
    if (item.sourceItemId && !verbs.remembers(item.sourceItemId))
      verbs.remember(item.sourceItemId, undo)
  }

  /** FR-25.13g: a carried thing becomes one for everybody going. */
  function onSpread(itemId: string) {
    const first = linesOfItem(itemId)[0]
    if (!first) return
    verbs.remember(itemId, orchestrator.setForWhom(tripId, first, { kind: 'all' }))
  }

  async function onAddGroup(templateId: string) {
    const written = orchestrator.addGroupLines(tripId, excursionId, templateId)
    const group = masterStore.getTemplate(templateId)
    if (!written || !group) return
    await presentToast({
      message: groupAdditionMessage({
        groupName: group.name,
        added: written.lines,
        alreadyPresent: [],
        unassignable: [],
      }),
      positionAnchor: FAB_ANCHOR.m27Excursion,
      buttons: [{ text: t('packing.undo'), handler: written.undo }],
    })
  }

  return {
    onQuickAdd,
    onQuickAddLocal,
    onQuickAddForAll,
    onAssignForTravelers,
    onSpread,
    onAddGroup,
  }
}
