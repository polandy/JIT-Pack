/**
 * FR-24.3 — bringing a retired master item or Vorlage back.
 *
 * The FR called this restore *free*, and the data half of it is: the marker
 * is an ordinary synced column, so clearing it is one field write (ADR-032).
 * What is not free is the name. Retiring deliberately **frees** the name —
 * `idx_items_active_name` and `idx_templates_active_name` are partial
 * indexes over `retired_at IS NULL`, because a name held by a row no screen
 * shows is a name taken by nothing, and re-creating what you just deleted is
 * the common case. So by the time a restore is asked for, an active row may
 * hold the name, and two active rows of one name is precisely what FR-16.3
 * and FR-1.6 exist to prevent.
 *
 * That collision is answered **here, before the mutation is enqueued**,
 * rather than by the push it would otherwise fail: the device holds the
 * whole master partition, so it already knows every active name — this is
 * the one FR-24.3 question the client can answer *completely* in all three
 * modes, unlike the reference count ADR-032 had to make advisory. Letting
 * the push refuse it instead would show the user an optimistic restore that
 * reverses itself a moment later (ADR-031), for a refusal the device could
 * have stated before the tap. In Local Mode there is no push at all, so this
 * check is the only guard there is.
 *
 * The way out is part of the same answer: a restore may carry a replacement
 * name, written in the *same* mutation as the cleared marker. Two writes —
 * clear, then rename — would leave a moment where the index is violated, and
 * the second of them can be the one the outbox drops.
 */
import { findNameCollision, type NamedRow } from './nameCollision'
import { isRetired, RETIRED_FIELD, type Retirable } from './masterDeletion'

/** The row can come back under the name it would carry. */
export const RESTORE_READY = 'ready'
/** An active row holds that name — restoring it would make two of them. */
export const RESTORE_NAME_TAKEN = 'name_taken'

/**
 * What a restore of one retired row would do. `name` is the name that would
 * be written, already trimmed, so the caller never re-derives it.
 */
export type RestoreVerdict<T> =
  { kind: typeof RESTORE_READY; name: string } | { kind: typeof RESTORE_NAME_TAKEN; holder: T }

/**
 * The retired rows of a list, order preserved — the exact complement of
 * `activeOnly`. Only the restore surface reads this: everywhere else a
 * retired row is either offered (wrong) or resolved (right, and then the
 * complete list is what is wanted).
 */
export function retiredOnly<T extends Retirable>(rows: T[]): T[] {
  return rows.filter((row) => isRetired(row))
}

/**
 * restoreVerdict answers whether `row` can come back, under `proposedName`
 * if one is given and under its own name otherwise.
 *
 * `active` is the *active* list on purpose. The partial index ranges over
 * those rows and no others, so two retired rows may share a name — and
 * restoring one of them therefore takes the name away from the other, which
 * this sees because the first restore put its row into `active`.
 */
export function restoreVerdict<T extends NamedRow & Retirable>(
  row: T,
  active: readonly T[],
  proposedName?: string,
): RestoreVerdict<T> {
  const name = (proposedName ?? row.name).trim()
  const holder = name ? findNameCollision(name, active, row.id) : undefined
  if (holder) return { kind: RESTORE_NAME_TAKEN, holder }
  // A blank replacement is refused rather than written: a nameless row is
  // unreachable on every surface, which is worse than staying hidden.
  if (!name) return { kind: RESTORE_NAME_TAKEN, holder: row }
  return { kind: RESTORE_READY, name }
}

/**
 * The patch a restore writes: the marker cleared, plus the replacement name
 * when the old one had to be given up. `null` for `name` means "keep it".
 */
export function restoreFields(name: string | null): Record<string, unknown> {
  return name === null ? { [RETIRED_FIELD]: null } : { [RETIRED_FIELD]: null, name }
}
