import { searchOutline } from 'ionicons/icons'
import { ref } from 'vue'

import type { HeaderAction } from '@/composables/useHeaderActions'
import { t } from '@/i18n'

/**
 * The app bar's magnifier, for whichever screen the user is on (G-12,
 * FR-25.11k).
 *
 * One mechanism per screen rather than one global search: the icon is
 * always in the same place and always searches *what is on screen*. The
 * failure this replaces was the opposite — M4's search stayed in the bar
 * after leaving M4 and went on filtering a list nobody was looking at.
 *
 * The field is collapsed until asked for, because a permanently open
 * search box costs a full row of a list that has to be readable at arm's
 * length, for something used occasionally. Closing it **closes** it
 * rather than only emptying it, or the row it just reclaimed is spent on
 * an empty box.
 */
export function useContextSearch(id = 'search') {
  const term = ref('')
  const isOpen = ref(false)
  /** Closing clears the term with it — see the note above. */
  function toggle(): void {
    isOpen.value = !isOpen.value
    if (!isOpen.value) term.value = ''
  }

  /** The header entry; pages put it in their own action list. */
  function action(): HeaderAction {
    return {
      id,
      icon: searchOutline,
      label: t('common.search'),
      active: isOpen.value || term.value !== '',
      onClick: toggle,
    }
  }

  /** Case-insensitive, trimmed; an all-whitespace term narrows nothing. */
  function matches(...fields: (string | null | undefined)[]): boolean {
    const needle = term.value.trim().toLowerCase()
    if (needle === '') return true
    return fields.some((field) => (field ?? '').toLowerCase().includes(needle))
  }

  return { term, isOpen, toggle, action, matches }
}
