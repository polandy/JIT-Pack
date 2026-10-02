/**
 * What M9 puts into the frame's app bar: the glyphs and the ⋮ words
 * (ADR-050), the selection's bar while it lasts (G-20) and the collection's
 * size under the title (FR-24.6).
 */
import { actionSheetController } from '@ionic/vue'
import {
  eyeOutline,
  pricetagsOutline,
  sparklesOutline,
  swapVerticalOutline,
  timeOutline,
} from 'ionicons/icons'
import { useRouter } from 'vue-router'

import { setHeaderActions, type HeaderAction } from '@/composables/useHeaderActions'
import { setHeaderSelection } from '@/composables/useHeaderSelection'
import { setHeaderTitle } from '@/composables/useHeaderTitle'
import { SELECTION_ICON } from '@/composables/useRowSelection'
import { t } from '@/i18n'
import { readMode } from '@/mode'
import { PATH } from '@/router/paths'
import { useMasterStore } from '@/stores/masterStore'

import { SORT_MODES, type InventoryCore, type SortMode } from './useInventoryCore'

/** Registers M9's app-bar content; call once, in the page's setup. */
export function useInventoryHeader(core: InventoryCore) {
  const masterStore = useMasterStore()
  const router = useRouter()
  const { props, sort, rows, selecting, selected, shownItems, endSelecting } = core

  setHeaderActions(() => {
    const eye: HeaderAction = {
      id: 'm9-properties',
      icon: eyeOutline,
      label: t('items.properties'),
      active: props.shownCount.value > 0,
      badge: props.shownCount.value,
      onClick: () => (core.propsOpen.value = true),
    }
    /*
     * The sort is a glyph in the cluster and not a fourth chip in the bar
     * (G-12). Measured at 390 px with this instance's vocabulary, a sort chip
     * beside the three tags and the sheet's opener wraps the bar to three rows
     * — and the bar is sticky, so that height is spent on every screen of a
     * fifteen-screen list. Which order is active is legible from the list
     * itself (tag headings, or one alphabetical run) and marked in the sheet.
     */
    const sortAction: HeaderAction = {
      id: 'm9-sort',
      icon: swapVerticalOutline,
      label: t('items.sort'),
      active: sort.value !== 'grouped',
      onClick: chooseSort,
    }
    /*
     * FR-24.9. Third and last glyph the bar renders before the ⋮ (ADR-050),
     * and it earns the place: it is the entrance to the only way out of a
     * 49-item „Diverses" that does not cost 49 round trips through M10.
     *
     * Absent while the inventory is empty — an action over a selection that
     * cannot exist is the same offer the sheets refuse to make, and it is what
     * kept `tab-items`' visual baseline from changing for a screen whose
     * content did not.
     */
    /*
     * FR-24.10. Deliberately *fourth*: ADR-050 renders three glyphs and turns
     * the rest into words in the ⋮, and managing tags is the rarest of the
     * four — a thing done when a name is wrong, not on every visit. Being a
     * word is also what lets it say „Tags verwalten" rather than leaving a
     * glyph to be guessed at.
     */
    const manageTags: HeaderAction = {
      id: 'm9-manage-tags',
      icon: pricetagsOutline,
      label: t('items.manageTags'),
      onClick: () => (core.tagsOpen.value = true),
    }
    /*
     * FR-24.12. A word behind the ⋮ like the tag manager, and for the same
     * reason: a cleanup pass is occasional. Offered whatever the count — „all
     * tidy" is an answer the screen gives, and the rule settings live there.
     */
    const cleanup: HeaderAction = {
      id: 'm9-cleanup',
      icon: sparklesOutline,
      label: t('items.cleanup'),
      overflow: true,
      onClick: () => void router.push(PATH.inventoryCleanup),
    }
    /*
     * FR-32.2. Who changed the inventory, behind the ⋮ like the cleanup. Only
     * where a server recorded it: Local Mode has no log to show (G-8).
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
    // An inventory with no tags has nothing to manage, exactly as it has
    // nothing to select — once it is known to hold none (ADR-033).
    if (core.knownEmpty.value) return [eye, sortAction]

    const select: HeaderAction = {
      id: 'm9-select',
      icon: SELECTION_ICON,
      label: t('items.select'),
      active: selecting.value,
      onClick: () => (selecting.value ? endSelecting() : rows.start()),
    }
    return masterStore.tagList.length > 0
      ? [eye, sortAction, select, manageTags, cleanup, ...activity]
      : [eye, sortAction, select, cleanup, ...activity]
  })

  /**
   * „Alle N" takes what is *on screen*, filter and search included — which is
   * what makes the mode worth having: narrow to „Diverses", take all 49, act
   * once. Pressing it again clears, so the same control undoes itself.
   */
  function toggleAll() {
    rows.toggleAll(shownItems.value.map((item) => item.id))
  }

  // G-20: the selection's bar is the app bar's while it lasts.
  setHeaderSelection(() =>
    selecting.value
      ? {
          count: selected.value.size,
          total: shownItems.value.length,
          testid: 'm9',
          onExit: endSelecting,
          onAll: toggleAll,
        }
      : null,
  )

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

  function sortLabel(mode: SortMode): string {
    return mode === 'grouped' ? t('items.sortGrouped') : t('items.sortAlphabetical')
  }

  /**
   * The sort, as an action sheet rather than a second segment: the tag axis is
   * already one, and two stacked segments is the restlessness G-12 removed from
   * M4. Both options are named as words, with the current one marked.
   */
  async function chooseSort() {
    const sheet = await actionSheetController.create({
      header: t('items.sort'),
      buttons: [
        ...SORT_MODES.map((mode) => ({
          text: sort.value === mode ? `✓ ${sortLabel(mode)}` : sortLabel(mode),
          data: mode,
        })),
        { text: t('common.cancel'), role: 'cancel' },
      ],
    })
    await sheet.present()
    const { data, role } = await sheet.onDidDismiss()
    if (role === 'cancel' || typeof data !== 'string') return
    sort.value = data as SortMode
  }
}
