/**
 * The app's one matching fold for *searching* — pure, no I/O.
 *
 * It lived twice, privately: once in `itemMarks.ts` for the FR-28.2 picker
 * and once in `templates.ts` for the FR-27.13 group search, with identical
 * bodies and one of the two doc comments claiming to be the app's only copy.
 * A third caller (FR-24.7, the inventory search) is what made the drift worth
 * paying for now rather than later, so the rule is named once here and the
 * two older callers read it.
 *
 * **Searching folds diacritics; naming does not.** `nameCollision.foldName`
 * is deliberately a different rule and stays one: a hit there blocks a write,
 * so „Frühling" and „Fruhling" must remain two names the user is entitled to.
 * Here a fold only widens recall, which costs nothing and is what a Swiss
 * keyboard needs — „guertel" and „gurtel" both have to reach „Gürtel".
 *
 * `toLowerCase` and not `toLocaleLowerCase`, for the same reason the naming
 * rule gives: the fold has to be the same on every device, and a Turkish
 * locale maps "I" to a different letter than the Unicode default does.
 */
export function foldSearch(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

/**
 * The German keyboard spellings of the umlauts, as text typed without them.
 *
 * Stripping the diacritic gets „gurtel" to „Gürtel"; it does not get
 * **„guertel"** there, and that is the spelling a Swiss keyboard produces
 * when the umlaut is not reached for. Both are one person looking for one
 * belt, so both have to arrive — see {@link searchMatches} for how the two
 * folds are used together rather than merged.
 */
const UMLAUT_SPELLINGS: [RegExp, string][] = [
  [/ä/g, 'ae'],
  [/ö/g, 'oe'],
  [/ü/g, 'ue'],
  [/ß/g, 'ss'],
]

/** The same text with the umlauts written out: „Gürtel" → „guertel". */
export function spellOutUmlauts(text: string): string {
  return UMLAUT_SPELLINGS.reduce(
    (acc, [pattern, spelling]) => acc.replace(pattern, spelling),
    text.toLowerCase(),
  )
}

/**
 * searchMatches answers whether a needle is present in a haystack, under both
 * spellings of an umlaut — the app's search rule for free text.
 *
 * Two comparisons rather than one canonical form, because no single form has
 * both: folded to „gurtel" the haystack cannot contain „guertel", and spelled
 * out to „guertel" it cannot contain „gurtel". Running both is what makes the
 * rule symmetric, which is the only version a person typing either way
 * experiences as working.
 *
 * Both arguments are raw text; the folding happens here, so no caller can
 * fold one side and forget the other.
 */
export function searchMatches(haystack: string, needle: string): boolean {
  if (!needle) return true
  return (
    foldSearch(haystack).includes(foldSearch(needle)) ||
    spellOutUmlauts(haystack).includes(spellOutUmlauts(needle))
  )
}

/**
 * searchEquals answers whether two names are the *same* name under the search
 * rule — {@link searchMatches} with equality in place of containment.
 *
 * It exists for FR-24.11, which offers to create what a search did not find:
 * „gurtel" typed while „Gürtel" is in the list is the belt, not a new item, and
 * the naming rule (`nameCollision.foldName`) would call it a different name.
 * Offering a near-duplicate is the one answer that cannot be right, so the
 * wider fold decides here — and only here, because this blocks an *offer*,
 * never a write.
 */
export function searchEquals(a: string, b: string): boolean {
  const left = a.trim()
  const right = b.trim()
  return foldSearch(left) === foldSearch(right) || spellOutUmlauts(left) === spellOutUmlauts(right)
}

/**
 * The already-folded text split into words — anything that is not a letter or
 * a digit is a boundary.
 *
 * Its one caller today is the marks index's short-keyword rule, which is also
 * where it was written; it sits beside the fold because a caller that needs
 * one usually needs both, and because splitting *unfolded* text is the bug
 * this pairing prevents.
 */
export function searchWords(folded: string): string[] {
  return folded.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
}
