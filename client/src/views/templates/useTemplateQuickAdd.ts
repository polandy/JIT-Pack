/**
 * M8's quick-add (FR-25.13): what an add writes on a template, and the
 * browse-sheet's scope. A template has no packing states and no travelers, so
 * its sheet offers the plain add alone (G-8) and that is the one action here.
 */
import { computed, type ComputedRef } from 'vue'

import { useOrchestrator } from '@/composables/shared/useOrchestrator'
import { plainBrowseScope, type BrowseAction, type BrowseAddition } from '@/domain/browseRows'
import { t } from '@/i18n'
import type { TemplateItem } from '@/types/domain'

/** Builds M8's quick-add bindings over the template's positions. */
export function useTemplateQuickAdd(
  templateId: string,
  positions: ComputedRef<readonly TemplateItem[]>,
  toast: (message: string) => Promise<void>,
) {
  const orchestrator = useOrchestrator()

  /** What the template already carries — out of the suggestions, "already in" in the sheet. */
  const scope = computed(() => plainBrowseScope(positions.value.map((pos) => pos.item_id)))

  /**
   * FR-25.13 in M8: a picked or just-created inventory item lands as a position
   * with the FR-25.7 defaults (qty 1, trip-global, Packen, dedup max). A name the
   * inventory does not know is created by the composer's FR-24.11 sheet before it
   * arrives here; a name the template already carries is reported, never added
   * twice.
   */
  async function onQuickAdd(entry: BrowseAddition) {
    if (positions.value.some((pos) => pos.item_id === entry.sourceItemId)) {
      await toast(t('templates.duplicate', { name: entry.name }))
      return
    }
    orchestrator.masterData.addTemplateItem(templateId, entry.sourceItemId, {
      assignment: 'trip_global',
    })
    await toast(t('templates.added', { name: entry.name }))
  }

  /** The sheet's add, the only verb a plain scope offers. */
  function onBrowse(action: BrowseAction<BrowseAddition>) {
    if (action.verb === 'add') void onQuickAdd(action.item)
  }

  return { scope, onQuickAdd, onBrowse }
}
