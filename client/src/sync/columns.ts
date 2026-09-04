/**
 * How a value crosses the row boundary.
 *
 * A sync row is SQLite's shape, not the domain's: there is no boolean column
 * (so a flag is `1` or `0`) and no object column (so an attribute set is a
 * JSON string). Both conversions were written at every site that builds or
 * reads a row — sixteen `? 1 : 0` and thirteen `JSON.stringify`/`parse` —
 * and each one is a place to write `0` where `null` was meant, or to let a
 * malformed string throw where an empty value was recoverable.
 *
 * They are three functions here so a row codec states the *column's* type
 * once and every caller gets the same answer for the same edge cases.
 */

/**
 * dbBool renders a domain flag as the integer column SQLite keeps. `null`
 * and `undefined` are false: a flag nobody has set is a flag that is off,
 * and writing `null` into an integer column would make "unset" a third
 * state the merge has no rule for.
 */
export function dbBool(value: boolean | null | undefined): number {
  return value ? 1 : 0
}

/**
 * jsonColumn renders a domain object as the text column that carries it.
 * Absent is `null`, never `"null"`.
 *
 * An *empty* object still renders as `"{}"`, which is what every row builder
 * has always done. Two view-side callers drop it to `null` instead — they
 * build the object out of form state, where "no key set" is the user
 * declining rather than an object that happens to be empty. That difference
 * is deliberate and stays at those two sites: folding it in here would make
 * this function decide a question it cannot see the answer to.
 */
export function jsonColumn(value: object | null | undefined): string | null {
  return value ? JSON.stringify(value) : null
}

/**
 * parseJsonColumn reads such a column back. A malformed value yields
 * `fallback` rather than throwing: a snapshot is applied inside the pull
 * loop, so one unparseable row would otherwise take the whole page — and
 * with it every other row's update — down with it.
 */
export function parseJsonColumn<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string' || raw === '') return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}
