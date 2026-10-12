/**
 * What M9 puts into the frame's app bar: the ⋮ words (G-12, ADR-050
 * amendment 1), the selection's bar while it lasts (G-20) and the collection's
 * size under the title (FR-24.6).
 */
import { pricetagsOutline, sparklesOutline, timeOutline } from 'ionicons/icons'
import { useRouter } from 'vue-router'

import { setHeaderActions, type HeaderAction } from '@/composables/shared/useHeaderActions'
import { setHeaderTitle } from '@/composables/shared/useHeaderTitle'
import { offerSelection } from '@/composables/shared/useRowSelection'
import { t } from '@/i18n'
import { readMode } from '@/mode'
import { PATH } from '@/router/paths'
import { useMasterStore } from '@/stores/masterStore'

import type { InventoryCore } from './useInventoryCore'

/** Registers M9's app-bar content; call once, in the page's setup. */
export function useInventoryHeader(core: InventoryCore) {
  const masterStore = useMasterStore()
  const router = useRouter()
  const { rows, shownItems } = core

  /*
   * Only ⋮ words: a tab root carries nothing before the ⋮ but search, and M9's
   * search is on the screen (G-12, ADR-050 amendment 1). The sort and the
   * shown properties are in the „Ansicht & Filter" sheet's head; the selection
   * starts on a row's hold (FR-24.9).
   */
  setHeaderActions(() => {
    // An inventory known to be empty has nothing to manage or tidy (ADR-033).
    if (core.knownEmpty.value) return []
    /*
     * FR-24.10. Managing tags is done when a name is wrong, not on every
     * visit — and as a word it can say „Tags verwalten" rather than leaving a
     * glyph to be guessed at. Absent while there is no tag to manage.
     */
    const manageTags: HeaderAction[] =
      masterStore.tagList.length > 0
        ? [
            {
              id: 'm9-manage-tags',
              icon: pricetagsOutline,
              label: t('items.manageTags'),
              overflow: true,
              onClick: () => (core.tagsOpen.value = true),
            },
          ]
        : []
    /*
     * FR-24.12. A cleanup pass is occasional. Offered whatever the count —
     * „all tidy" is an answer the screen gives, and the rule settings live there.
     */
    const cleanup: HeaderAction = {
      id: 'm9-cleanup',
      icon: sparklesOutline,
      label: t('items.cleanup'),
      overflow: true,
      onClick: () => void router.push(PATH.inventoryCleanup),
    }
    /*
     * FR-32.2. Who changed the inventory. Only where a server recorded it:
     * Local Mode has no log to show (G-8).
     */
    const activity: HeaderAction[] =
      readMode() === 'server'
        ? [
            {
              id: 'm9-activity',
              icon: timeOutline,
              label: t('activity.menu'),
              overflow: true,
              onClick: () => void router.push(PATH.inventoryActivity),
            },
          ]
        : []
    return [...manageTags, cleanup, ...activity]
  })

  /*
   * G-20: the selection's bar is the app bar's while it lasts. „Alle N" takes
   * what is *on screen*, filter and search included — which is what makes the
   * mode worth having: narrow to „Diverses", take all 49, act once. Pressing
   * it again clears, so the same control undoes itself. No icon: the
   * selection starts on a row's hold (FR-24.9).
   */
  offerSelection(rows, { testid: 'm9', keys: () => shownItems.value.map((item) => item.id) })

  setHeaderTitle(
    () => t('items.title'),
    () => {
      if (core.isEmpty.value) return null
      const total = masterStore.activeItemList.length
      // FR-24.6: the collection states its size, and says so differently once
      // something is narrowing it — „12 von 184" is the number a filter owes.
      return core.searching.value || core.filtering.value
        ? t('items.metaFiltered', { shown: core.shownCount.value, total })
        : t('items.metaAll', { items: total, tags: masterStore.tagList.length })
    },
  )
}
