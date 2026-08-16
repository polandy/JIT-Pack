/**
 * Container weight budgets (FR-10.2/10.3) — pure, no I/O. Weights are
 * planned weights (item weight × quantity): the budget question ("does
 * the pannier stay under the airline limit?") is answered while
 * planning, before anything is packed.
 */

import type { Container, TripItem } from '@/types/domain'

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

/** One paired_container_id write the caller must persist. */
export interface PairingWrite {
  containerId: string
  paired_container_id: string | null
}

/**
 * pairWrites makes a↔b the only pair either side is in: both pointers are
 * set and any previous partner of either side is released. Pairing is
 * exclusive and symmetric by construction (M11) — a half-set pair would
 * render an imbalance against a container that does not consider itself
 * paired. Already-correct pointers are skipped, so the call is idempotent
 * and also repairs a legacy one-sided pair.
 */
export function pairWrites(containers: Container[], aId: string, bId: string): PairingWrite[] {
  if (aId === bId) return []
  const writes: PairingWrite[] = []
  const byId = new Map(containers.map((c) => [c.id, c]))
  for (const [ownId, partnerId] of [
    [aId, bId],
    [bId, aId],
  ] as const) {
    const previous = byId.get(ownId)?.paired_container_id
    if (previous && previous !== partnerId && byId.get(previous)?.paired_container_id === ownId) {
      writes.push({ containerId: previous, paired_container_id: null })
    }
    if (previous !== partnerId) {
      writes.push({ containerId: ownId, paired_container_id: partnerId })
    }
  }
  // Releases first: a freed partner must never overwrite the new pair.
  return writes.sort((a, b) =>
    a.paired_container_id === null === (b.paired_container_id === null)
      ? 0
      : a.paired_container_id === null
        ? -1
        : 1,
  )
}

/**
 * unpairWrites clears the container's own pointer and every pointer at it —
 * clearing one side always releases the other (M11), and a dangling inbound
 * pointer from a legacy one-sided write is swept with it.
 */
export function unpairWrites(containers: Container[], id: string): PairingWrite[] {
  const writes: PairingWrite[] = []
  const own = containers.find((c) => c.id === id)
  if (own?.paired_container_id) {
    writes.push({ containerId: id, paired_container_id: null })
  }
  for (const c of containers) {
    if (c.id !== id && c.paired_container_id === id) {
      writes.push({ containerId: c.id, paired_container_id: null })
    }
  }
  return writes
}

/** releasePartnersOnDelete frees every surviving container paired with the deleted one. */
export function releasePartnersOnDelete(containers: Container[], id: string): PairingWrite[] {
  return unpairWrites(containers, id).filter((w) => w.containerId !== id)
}

/** imbalanceThreshold reads the per-trip override, defaulting to 15 % (FR-10.3). */
export function imbalanceThreshold(attributes: Record<string, unknown> | null): number {
  const raw = attributes?.['imbalance_threshold']
  return typeof raw === 'number' && raw > 0 ? raw : 15
}
