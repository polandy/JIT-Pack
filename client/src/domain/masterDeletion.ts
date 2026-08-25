/**
 * FR-24.3 — lifecycle-aware deletion of master items and Vorlagen.
 *
 * Deleting a row the rest of the data still points at is not the same act as
 * deleting one nothing has ever used. The first has to keep resolving for
 * archived trips, analytics (FR-8/FR-14) and attributions, so it is *retired*
 * — the row stays and carries a marker that every display surface honours.
 * The second is a mistake being taken back, and it is removed outright.
 *
 * **This is the client's half of a rule the server also runs, on purpose.**
 * The complete reference count exists only where all the data does: on the
 * server in Server Mode, and on the device in Local Mode, which holds every
 * trip it will ever have. In Server Mode the client sees the whole master
 * partition but only the trip partitions it has opened, so its count can be
 * short — and being short is safe, because the server answers a delete it
 * refuses to perform by retiring the row instead, and the next pull corrects
 * the device. What the client's count is *for* is stating the outcome before
 * the user confirms; the server decides what actually happens. See ADR-032.
 */
import type { MasterItem, Template, TemplateItem, TripItem } from '../types/domain'

/** The row is kept and hidden — something still resolves against it. */
export const DELETION_RETIRE = 'retire'
/** The row is removed outright — nothing has ever referenced it. */
export const DELETION_REMOVE = 'remove'

/** Which of FR-24.3's two deletions a row gets. */
export type DeletionKind = typeof DELETION_RETIRE | typeof DELETION_REMOVE

/** A row carrying FR-24.3's marker: `retired_at` absent or null means active. */
export interface Retirable {
  retired_at?: string | null
}

/** What can point at a master item and keep it alive (`blockingReferences`). */
export interface ItemReferenceSources {
  positions: TemplateItem[]
  tripItems: TripItem[]
}

/** What can point at a Vorlage and keep it alive — FR-9.2's provenance. */
export interface TemplateReferenceSources {
  tripItems: TripItem[]
}

/**
 * FR-24.3's whole decision. One reference is enough: the rule is about
 * whether anything at all resolves against the row, not about how much.
 */
export function deletionKind(references: number): DeletionKind {
  return references > 0 ? DELETION_RETIRE : DELETION_REMOVE
}

/** Whether the row has been retired (FR-24.3). Absent marker = active. */
export function isRetired(row: Retirable): boolean {
  return row.retired_at != null
}

/**
 * The active rows of a list, order preserved. Display surfaces call this;
 * resolution, export and backup deliberately do not — a retired row that is
 * missing where history reads it is data loss, while a retired row showing
 * in a picker is only noise (ADR-032).
 */
export function activeOnly<T extends Retirable>(rows: T[]): T[] {
  return rows.filter((row) => !isRetired(row))
}

/**
 * How many rows point at this master item: template positions (FR-27.1) and
 * trip rows generated from it (FR-9.2) — the same two `blockingReferences`
 * names on the server.
 */
export function countItemReferences(itemId: string, from: ItemReferenceSources): number {
  const positions = from.positions.filter((p) => p.item_id === itemId).length
  const generated = from.tripItems.filter((t) => t.source_item_id === itemId).length
  return positions + generated
}

/**
 * How many trip rows still name this Vorlage as where they came from
 * (FR-9.2). Group includes are not counted here: a group another Vorlage
 * includes is refused by M7 for FR-27.6's separate reason, before FR-24.3
 * is asked anything.
 */
export function countTemplateReferences(
  templateId: string,
  from: TemplateReferenceSources,
): number {
  return from.tripItems.filter((t) => t.source_template_id === templateId).length
}

/** Narrowing helpers exist only so callers read as what they filter. */
export type ActiveItems = MasterItem[]
export type ActiveTemplates = Template[]
