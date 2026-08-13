import { airplaneOutline, cubeOutline, homeOutline, listOutline } from 'ionicons/icons'

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
  name: string
  href: string
  icon: string
}

export const NAV_ANCHORS: readonly NavAnchor[] = [
  { match: 'dashboard', name: 'Dashboard', href: '/tabs/dashboard', icon: homeOutline },
  { match: 'trips', name: 'Trips', href: '/tabs/trips', icon: airplaneOutline },
  { match: 'templates', name: 'Templates', href: '/tabs/templates', icon: listOutline },
  { match: 'items', name: 'Items', href: '/tabs/items', icon: cubeOutline },
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
