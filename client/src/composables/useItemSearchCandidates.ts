import { computed, type ComputedRef } from 'vue'

import { MARK_INDEX } from '@/domain/itemMarks'
import type { ItemSearchCandidate } from '@/domain/itemSearch'
import { tagNamesByItem } from '@/domain/tags'
import { useMasterStore } from '@/stores/masterStore'

/** The mark's search keywords, by emoji — resolved once, not per keystroke. */
const MARK_KEYWORDS = new Map(MARK_INDEX.map((entry) => [entry.emoji, entry.keywords]))

/**
 * The active inventory as the FR-24.7 search reads it — one construction for
 * M9's field and for the add composer (FR-24.11), so a name, a tag or a mark
 * keyword finds the same item wherever it is typed.
 *
 * The tag names come from one pass over the assignments rather than a lookup
 * per row: asking each item for its tags is items × assignments, and this is
 * rebuilt whenever either feed moves (NFR-4.3).
 */
export function useItemSearchCandidates(): ComputedRef<ItemSearchCandidate[]> {
  const masterStore = useMasterStore()
  const tagNames = computed(() => tagNamesByItem(masterStore.itemTagList, masterStore.tagList))
  return computed(() =>
    masterStore.activeItemList.map((item) => ({
      id: item.id,
      name: item.name,
      tagNames: tagNames.value.get(item.id) ?? [],
      markKeywords: item.icon ? (MARK_KEYWORDS.get(item.icon) ?? []) : [],
    })),
  )
}
