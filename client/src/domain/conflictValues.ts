/**
 * Reading a conflict-log value (NFR-4.2a).
 *
 * `conflict_log.losing_value` and `winning_value` hold the JSON text of one
 * mutation field, because that is the form the merge compared them in. What a
 * reader needs is the value, not its encoding: rendering the column verbatim
 * puts quotes around every name and shows a flag as `1`.
 *
 * Translation stays out of here on purpose — the caller turns a boolean into
 * the word its locale uses (NFR-4.12); this module only says which kind of
 * thing the column holds.
 */

/** One conflict-log column, decoded far enough to be rendered. */
export type ConflictValue =
  { kind: 'empty' } | { kind: 'boolean'; value: boolean } | { kind: 'text'; text: string }

/**
 * describeConflictValue decodes one stored column. Anything it cannot parse
 * is passed through as text rather than hidden: an unreadable value is still
 * evidence of what was overwritten, and the log is an audit before it is a
 * screen.
 *
 * Numbers are stringified rather than localized. A conflict column carries
 * years and ids as readily as quantities, and digit grouping turns a year
 * into a count.
 */
export function describeConflictValue(raw: string): ConflictValue {
  if (raw === '') return { kind: 'empty' }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { kind: 'text', text: raw }
  }

  if (parsed === null) return { kind: 'empty' }
  if (typeof parsed === 'boolean') return { kind: 'boolean', value: parsed }
  if (typeof parsed === 'string') {
    return parsed === '' ? { kind: 'empty' } : { kind: 'text', text: parsed }
  }
  if (typeof parsed === 'number') return { kind: 'text', text: String(parsed) }
  return { kind: 'text', text: raw }
}
