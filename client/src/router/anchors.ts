import { cubeOutline, homeOutline, listOutline, trainOutline } from 'ionicons/icons'

import type { MessageKey } from '@/i18n'

/**
 * The four navigation anchors (G-1/G-9), in one place.
 *
 * The rail and the tab bar are two presentations of the same idea — one
 * for each side of the 900 px breakpoint — so they read the list from
 * here. Two copies drift: the tab bar and the rail already disagreed on
 * which entry counted as active.
 */
export interface NavAnchor {
  /** Route path segment under `/tabs/`, and the test-id suffix. */
  match: string
  /**
   * Catalogue key of the label, not the label: the rail and the bar render
   * in the active locale, and a stored string would freeze whichever one
   * happened to be active when this module was first evaluated.
   */
  nameKey: MessageKey
  href: string
  icon: string
}

export const NAV_ANCHORS: readonly NavAnchor[] = [
  { match: 'dashboard', nameKey: 'nav.dashboard', href: '/tabs/dashboard', icon: homeOutline },
  // A train, not a plane: this household's trips are ground travel, and
  // the icon is the first thing that says what the app is about.
  { match: 'trips', nameKey: 'nav.trips', href: '/tabs/trips', icon: trainOutline },
  { match: 'templates', nameKey: 'nav.templates', href: '/tabs/templates', icon: listOutline },
  { match: 'items', nameKey: 'nav.items', href: '/tabs/items', icon: cubeOutline },
] as const

/**
 * Whether an anchor is the one the current path belongs to.
 *
 * Exact rather than a substring test: `/tabs/items` used to light up on
 * `/trips/:id/items/:itemId` because the old check asked whether the path
 * merely *contained* the segment, which pointed the user at the master
 * inventory while they were inside a trip.
 */
export function isAnchorActive(path: string, match: string): boolean {
  return path === `/tabs/${match}`
}
