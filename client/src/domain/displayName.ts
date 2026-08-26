/**
 * The FR-17.13 display-name rule: 1–50 printable characters, no leading
 * or trailing whitespace. Wide enough for every name the system itself
 * hands out — the seeded "Demo User", IdP-sourced names with spaces or
 * diacritics. The server applies the same rule
 * (internal/store/singleuser.go); this is the client half of
 * "validated client- and server-side".
 */
const DISPLAY_NAME_PATTERN = /^[^\p{C}\s](?:[^\p{C}]{0,48}[^\p{C}\s])?$/u

/** True when `name` satisfies the FR-17.13 display-name rule. */
export function isValidDisplayName(name: string): boolean {
  return DISPLAY_NAME_PATTERN.test(name)
}
