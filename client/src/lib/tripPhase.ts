/**
 * Where a trip stands, as the kernel's own question.
 *
 * It lives here rather than beside the other trip predicates in
 * `domain/trips.ts` because both sides of the feature-module boundary ask it
 * (FR-30.3, ADR-066): the packing list decides what its ⋮ offers, and the
 * shopping module decides which list it opens on. A module cannot import
 * `domain/`, and the alternative — each side reading the column its own way —
 * is how two screens come to disagree about the same trip.
 */

/**
 * Whether the packing has been declared finished (FR-5.10).
 *
 * The *stamp*, never „nothing is open": the list stays open afterwards so a
 * thing that was packed but never listed can still be added (owner,
 * 2026-09-20), and a derived reading would be revoked by exactly that row.
 */
export function isPackingClosed(trip: { packing_closed_at: string | null } | null | undefined) {
  return (trip?.packing_closed_at ?? null) !== null
}
