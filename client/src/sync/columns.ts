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
 * has always done. Two views — M8's position sheet and M16's series page —
 * hand over `null` instead, because they build the object out of form state,
 * where "no key set" is the user declining rather than an object that happens
 * to be empty. That difference is deliberate and stays with them: folding it
 * in here would make this function decide a question it cannot see the answer
 * to. They no longer call this function to say so — they pass the domain
 * value and `rowFrom` encodes it (C-10).
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

/**
 * rowFrom renders an edit patch as the sync row it writes: the keys the
 * caller actually set, each through the codec that key's column needs.
 *
 * Only present keys are copied, because a field-level upsert (NFR-4.2a) says
 * what changed and nothing else — restating a column the user did not touch
 * would hand back the value another device wrote meanwhile. A key set to
 * `undefined` is still a key, and `Object.entries` reports it; it is dropped
 * here so `{ name: undefined }` cannot blank a name.
 */
export function rowFrom<T extends object>(
  fields: T,
  codecs: Partial<{ [K in keyof T]: (value: T[K]) => unknown }> = {},
): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue
    const codec = codecs[key as keyof T] as ((v: unknown) => unknown) | undefined
    row[key] = codec ? codec(value) : value
  }
  return row
}
