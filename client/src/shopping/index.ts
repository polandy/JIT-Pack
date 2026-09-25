/**
 * The shopping module's public face (FR-30.3, ADR-066) — what the composition
 * root wires, and the only file outside code may reach into this directory
 * through (the router's lazy page import aside). The dev seed uses it too, to
 * write its entries through the module's own actions.
 */
import type { ShoppingSource } from '@/lib/shoppingSources'
import { SHOPPING_MODES } from '@/types/domain'
import { openCount } from './list'
import { shoppingFeatureStore, useShoppingStore } from './store'

export { shoppingFeatureStore, useShoppingStore }
export { createShoppingActions, shoppingCloseCrossing } from './actions'

/** FR-30.7: the trip's shopping card on the dashboard, handed to M1 by `App.vue`. */
export { default as ShoppingDashboardCard } from './ShoppingDashboardCard.vue'

/**
 * The trip switcher's shopping count: the list's own open entries plus every
 * source's open lines, on both lists (FR-21.21).
 */
export function shoppingCount(sources: readonly ShoppingSource[]): (tripId: string) => number {
  const shoppingStore = useShoppingStore()
  return (tripId) =>
    SHOPPING_MODES.reduce((n, list) => n + shoppingStore.openEntries(tripId, list).length, 0) +
    openCount(tripId, sources)
}
