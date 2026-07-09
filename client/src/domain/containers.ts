/**
 * Container weight budgets (FR-10.2/10.3) — pure, no I/O. Weights are
 * planned weights (item weight × quantity): the budget question ("does
 * the pannier stay under the airline limit?") is answered while
 * planning, before anything is packed.
 */

import type { TripItem } from '@/types/domain'

/** containerWeight sums the planned weight assigned to one container. */
export function containerWeight(items: TripItem[], containerId: string): number {
  return items
    .filter((i) => i.container_id === containerId && i.state !== 'skipped')
    .reduce((sum, i) => sum + (i.weight_grams ?? 0) * i.quantity, 0)
}

/** unassignedItems is the dedicated FR-10.2 bucket. */
export function unassignedItems(items: TripItem[]): TripItem[] {
  return items.filter((i) => i.container_id === null && i.state !== 'skipped')
}

export type BudgetLevel = 'ok' | 'warn' | 'over'

/** budgetLevel grades a container against its max weight (FR-10.3): amber at 90 %, red beyond. */
export function budgetLevel(weightGrams: number, maxWeightGrams: number | null): BudgetLevel {
  if (maxWeightGrams === null || maxWeightGrams <= 0) return 'ok'
  if (weightGrams > maxWeightGrams) return 'over'
  if (weightGrams > maxWeightGrams * 0.9) return 'warn'
  return 'ok'
}

/** imbalancePercent measures a pair's weight difference relative to the heavier side. */
export function imbalancePercent(weightA: number, weightB: number): number {
  const heavier = Math.max(weightA, weightB)
  if (heavier === 0) return 0
  return Math.round((Math.abs(weightA - weightB) / heavier) * 100)
}

/** imbalanceThreshold reads the per-trip override, defaulting to 15 % (FR-10.3). */
export function imbalanceThreshold(attributes: Record<string, unknown> | null): number {
  const raw = attributes?.['imbalance_threshold']
  return typeof raw === 'number' && raw > 0 ? raw : 15
}
