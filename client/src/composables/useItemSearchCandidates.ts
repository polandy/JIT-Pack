import { computed, type ComputedRef } from 'vue'

import { MARK_INDEX } from '@/domain/itemMarks'
import type { ItemSearchCandidate } from '@/domain/itemSearch'
import { tagNamesByItem } from '@/domain/tags'
import { useIdentityStore } from '@/stores/identityStore'
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
 *
 * The **default assignee** (FR-1.9) joins as a fourth field, by display name.
 * It is what M9 offers instead of a filter by account, and the directory is
 * empty in Local and Single-User Mode, so the field simply is not there where
 * FR-1.9 is not (G-8).
 */
export function useItemSearchCandidates(): ComputedRef<ItemSearchCandidate[]> {
  const masterStore = useMasterStore()
  const identityStore = useIdentityStore()
  const tagNames = computed(() => tagNamesByItem(masterStore.itemTagList, masterStore.tagList))
  const nameOfAccount = computed(
    () => new Map(identityStore.directory.map((user) => [user.user_id, user.display_name])),
  )
  return computed(() =>
    masterStore.activeItemList.map((item) => ({
      id: item.id,
      name: item.name,
      tagNames: tagNames.value.get(item.id) ?? [],
      markKeywords: item.icon ? (MARK_KEYWORDS.get(item.icon) ?? []) : [],
      assigneeName: item.default_assignee_id
        ? nameOfAccount.value.get(item.default_assignee_id)
        : undefined,
    })),
  )
}
