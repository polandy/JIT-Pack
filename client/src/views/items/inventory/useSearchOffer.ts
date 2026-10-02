/**
 * FR-24.11: what the search did not find, it offers to create — or, for a
 * retired name, to restore.
 */
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import { useOrchestrator } from '@/composables/useOrchestrator'
import { UNTAGGED_KEY } from '@/domain/tags'
import { searchOffer, OFFER_CREATE } from '@/domain/itemSearch'
import { t } from '@/i18n'
import { FAB_ANCHOR } from '@/lib/fabAnchors'
import { presentToast } from '@/lib/toast'
import { itemPath } from '@/router/paths'
import { useMasterStore } from '@/stores/masterStore'

import type { InventoryCore } from './useInventoryCore'

/** The offer, the creation sheet it opens and the row it marks; call once per screen. */
export function useSearchOffer(core: InventoryCore) {
  const masterStore = useMasterStore()
  const orchestrator = useOrchestrator()
  const router = useRouter()
  const { search, searching, itemsKnown, selecting, selection, hits } = core

  /**
   * The offer above the results. Not while the partition is still arriving
   * (ADR-033 — „no such item" is a claim about a list the device may not hold
   * yet) and not in the selection mode, where rows do not navigate and a
   * creation would drop the selection the user is building.
   */
  const offer = computed(() =>
    searching.value && itemsKnown.value && !selecting.value
      ? searchOffer(search.value, masterStore.activeItemList, masterStore.retiredItemList)
      : null,
  )

  const createOpen = ref(false)

  /**
   * The item this screen just created or restored, marked in the results until
   * the query changes: the row is the confirmation, and the list may hold a
   * dozen partial hits it has to be told apart from.
   */
  const freshId = ref<string | null>(null)
  watch(search, () => (freshId.value = null))

  /**
   * The tags the list is filtered by are the new item's from the start: without
   * them it would vanish from the filtered list the moment it exists, which
   * reads as a failed write. The untagged bucket is not a tag, so it assigns
   * nothing — and an untagged item is exactly what lands in it.
   */
  const createTagIds = computed(() => selection.value.filter((id) => id !== UNTAGGED_KEY))

  /**
   * The tags of the items the query found *by name*, in hit order: „Zelt" finds
   * the pegs and the groundsheet, so the tent is most likely „Camping" too.
   */
  const preferredTagIds = computed(() => {
    const ids: string[] = []
    for (const hit of hits.value) {
      if (hit.reason !== 'name') continue
      for (const tag of masterStore.getItemTags(hit.id)) if (!ids.includes(tag.id)) ids.push(tag.id)
    }
    return ids
  })

  async function takeOffer() {
    const current = offer.value
    if (!current) return
    if (current.kind === OFFER_CREATE) {
      createOpen.value = true
      return
    }
    if (!orchestrator.restoreMasterItem(current.id)) return
    freshId.value = current.id
    await presentToast({
      message: t('retired.restored', { name: current.name }),
      positionAnchor: FAB_ANCHOR.m9,
    })
  }

  /** Enter opens the sheet and never writes: a typo must not become an item. */
  function onSearchSubmit() {
    if (offer.value?.kind === OFFER_CREATE) createOpen.value = true
  }

  async function onCreated({ id, name, open }: { id: string; name: string; open: boolean }) {
    createOpen.value = false
    freshId.value = id
    if (open) {
      await router.push(itemPath(id))
      return
    }
    // Above the ＋, not over it: the tab bar is what the helper would clear, and
    // the FAB sits higher — measured on the rendered screen at 390 px.
    await presentToast({
      message: t('items.created', { name }),
      positionAnchor: FAB_ANCHOR.m9,
      buttons: [{ text: t('items.createdOpen'), handler: () => void router.push(itemPath(id)) }],
    })
  }

  return {
    offer,
    createOpen,
    freshId,
    createTagIds,
    preferredTagIds,
    takeOffer,
    onSearchSubmit,
    onCreated,
  }
}
