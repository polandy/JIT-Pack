/**
 * The shopping module's public face (FR-30.3, ADR-066) — what the composition
 * root wires, and the only file outside code may reach into this directory
 * through (the router's lazy page import aside). The dev seed uses it too, to
 * write its entries through the module's own actions.
 */
import { dueTally } from '@/domain/shared/dueDay'
import { IDEA_RESULT_SHOPPING, type IdeaResultSource } from '@/domain/shared/ideaBridge'
import { tripSubPath } from '@/router/paths'
import type { ShoppingSource } from '@/kernel/shoppingSources'
import type { DuePurchases } from '@/kernel/tripCards'
import { SHOPPING_MODES } from '@/types/domain'
import { openCount } from './list'
import { shoppingFeatureStore, useShoppingStore } from './store'

export { shoppingFeatureStore, useShoppingStore }
export { createShoppingActions, shoppingCloseCrossing } from './actions'
export { shoppingActivityReaders } from './activity'

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

/**
 * FR-30.10: the trip's lines still to buy, on either list, that are due by
 * tomorrow — the overdue ones counted apart — for M1's due line. The own
 * entries and every source's lines, so the line names what the card's badges
 * show: a meal's ingredient bought today is due today too (FR-33.3).
 */
export function duePurchases(sources: readonly ShoppingSource[]): DuePurchases {
  const shoppingStore = useShoppingStore()
  return (tripId, today) =>
    dueTally(
      SHOPPING_MODES.flatMap((list) => [
        ...shoppingStore.openEntries(tripId, list).map((entry) => entry.due_date),
        ...sources.flatMap((source) =>
          source.open(tripId, list).map((line) => line.dueDate ?? null),
        ),
      ]),
      today,
    )
}

/**
 * FR-29.13: the list's own entries made from an idea, for the idea's *Daraus
 * gemacht* — the shopping module's half of `domain/shared/ideaBridge.ts`.
 */
export function shoppingIdeaResults(): IdeaResultSource {
  const shoppingStore = useShoppingStore()
  return {
    results: (tripId, ideaId) =>
      shoppingStore
        .getEntries(tripId)
        .filter((entry) => entry.idea_id === ideaId)
        .map((entry) => ({
          key: `shopping:${entry.id}`,
          kind: IDEA_RESULT_SHOPPING,
          title: entry.name,
          done: entry.bought,
          path: tripSubPath(tripId, 'shopping'),
        })),
  }
}

/** The module's rows and their vocabulary, for the composition root and the dev seed. */
export * from './types'
