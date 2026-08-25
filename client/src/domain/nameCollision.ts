/**
 * The device's own answer to the master partition's UNIQUE (name) spaces —
 * `templates.name` (FR-1.6) and `trip_series.name` (FR-13.1).
 *
 * Both constraints are instance-wide, and the client pulls the master
 * partition in full, so every device already knows every name that is taken.
 * Finding the collision here rather than letting the push be refused is what
 * keeps the answer at the point where the name was typed.
 */

/** A row that occupies one of those name spaces. Only the two fields the rule reads. */
export interface NamedRow {
  id: string
  name: string
}

/**
 * The one matching rule for a name space (FR-1.6/FR-13.1): trimmed and
 * case-insensitive, and **diacritics are kept**.
 *
 * It is deliberately a superset of what SQLite's `UNIQUE (name)` refuses and
 * nothing more. Case is not a distinction a person makes in a name — the
 * database would hold "Sommer" and "sommer" as two rows and no screen could
 * tell them apart — so folding it prevents what the constraint was for.
 * Diacritics are the opposite: "Frühling" and "Fruhling" are two names the
 * database accepts, so folding them would refuse a name the user is entitled
 * to. The FR-27.13 picker search folds them because recall is free in a
 * search; here a hit blocks a write, and precision wins.
 *
 * `toLowerCase` and not `toLocaleLowerCase`: the fold has to be the same on
 * every device, and a Turkish locale maps "I" to a different letter than the
 * Unicode default does. Two devices disagreeing about whether a name is free
 * is a worse failure than either answer.
 */
export function foldName(name: string): string {
  return name.trim().toLowerCase()
}

/**
 * findNameCollision returns the row already holding `name`, or `undefined`.
 *
 * `excludeId` is the row being renamed: renaming it to the name it already
 * has, or to a different capitalisation of it, is not a collision with
 * itself.
 */
export function findNameCollision<T extends NamedRow>(
  name: string,
  rows: readonly T[],
  excludeId?: string,
): T | undefined {
  const needle = foldName(name)
  if (!needle) return undefined
  return rows.find((row) => row.id !== excludeId && foldName(row.name) === needle)
}

/**
 * The column both name spaces are keyed on. It is read back out of a
 * mutation's `fields` patch to decide whether an edit is a rename at all,
 * which makes it a comparison rather than a serialization key (§4a).
 */
export const NAME_FIELD = 'name'

/**
 * renameTarget returns the new name an edit patch would write, or `null`
 * when the patch does not touch the name — setting a mark (FR-28.8) or a
 * scope must not be run past a name check it cannot fail.
 */
export function renameTarget(fields: Record<string, unknown>): string | null {
  const next = fields[NAME_FIELD]
  return typeof next === 'string' ? next : null
}
