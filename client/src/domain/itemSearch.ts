/**
 * The inventory search (FR-24.7) — pure, no I/O.
 *
 * M9 compared `item.name.toLowerCase().includes(term)` and nothing else,
 * which made the one route into a 184-row database narrower than the data
 * behind it in two measured ways: „guertel" and „gurtel" both missed
 * „Gürtel", and a tag every row already carries could not be typed at all.
 *
 * Two rules, and both of them are why this is a domain module rather than a
 * computed property in the page:
 *
 * - **The fold is the app's** (`domain/search.ts`), widened there so that both
 *   spellings of an umlaut reach the same row — „gurtel" and „guertel" are
 *   one person looking for one belt.
 * - **A hit says why it matched.** M9 renders the results grouped by reason
 *   („Treffer im Namen" before „Treffer im Tag"), because a row that arrives
 *   under a query it does not visibly contain reads as a bug — the same
 *   finding the FR-27.13 group search paid for with its `via` field.
 */
import { foldSearch, searchEquals, searchMatches } from './search'
import type { NamedRow } from './nameCollision'

/** Why a row is in the result. Ordered: this is also the ranking. */
export const MATCH_REASONS = ['name', 'tag', 'mark', 'assignee'] as const

/** Why a row is in the result (FR-24.7). */
export type MatchReason = (typeof MATCH_REASONS)[number]

/** One item as the search reads it — resolution (tags, mark) already done. */
export interface ItemSearchCandidate {
  id: string
  name: string
  /** Every tag of the item, primary or not: the axis groups, the search reaches. */
  tagNames: string[]
  /**
   * The §3.28 mark's keywords, already resolved from the index — empty for an
   * item carrying no mark. Passed in rather than looked up here so this module
   * stays independent of the mark index's shape.
   */
  markKeywords?: string[]
  /**
   * Who the item is usually somebody's job for (FR-1.9), by display name —
   * absent where there is no account to name, which is every row in Local
   * and Single-User Mode. It is the inventory's answer to „was ist
   * üblicherweise meins?": FR-24.2's axis is tags and an account is not one,
   * so the question is asked of the search instead of a second filter axis.
   */
  assigneeName?: string
}

/** One search result, in the order M9 renders. */
export interface ItemSearchHit {
  id: string
  reason: MatchReason
  /**
   * What carried the match when it was not the name — the tag's name, the
   * mark's keyword, the account's display name. `null` for a name hit,
   * where the row itself shows it.
   */
  via: string | null
}

/**
 * Whether a query is one the search will act on at all.
 *
 * A single character is a real query here, unlike in the mark picker: the
 * inventory is the user's own list of a few hundred names, so "S" narrowing
 * to forty rows is a narrowing, while one letter against the mark index would
 * return half of it.
 */
export function isSearchQuery(query: string): boolean {
  return query.trim().length > 0
}

/**
 * searchItems answers M9's field (FR-24.7).
 *
 * Ranking is derived, never incidental, so two devices answer one query the
 * same way: name hits before tag hits before mark hits before assignee hits
 * (FR-1.9, the weakest reason: a name that is a person's rather than the
 * item's); within the name hits
 * a row whose name *starts* with the query before one that merely contains
 * it; alphabetical by name inside each rank. An item is reported **once**,
 * under the strongest reason it has — a row that appeared twice would break
 * the same promise FR-24.2 buys for the grouped list.
 */
export function searchItems(
  candidates: readonly ItemSearchCandidate[],
  query: string,
): ItemSearchHit[] {
  const needle = query.trim()
  if (!needle) return []
  const folded = foldSearch(needle)

  const scored: { hit: ItemSearchHit; rank: number; order: number; name: string }[] = []

  for (const candidate of candidates) {
    if (searchMatches(candidate.name, needle)) {
      scored.push({
        hit: { id: candidate.id, reason: 'name', via: null },
        rank: foldSearch(candidate.name).startsWith(folded) ? 0 : 1,
        order: 0,
        name: candidate.name,
      })
      continue
    }

    const tag = candidate.tagNames.find((t) => searchMatches(t, needle))
    if (tag !== undefined) {
      scored.push({
        hit: { id: candidate.id, reason: 'tag', via: tag },
        rank: 0,
        order: 1,
        name: candidate.name,
      })
      continue
    }

    const keyword = (candidate.markKeywords ?? []).find((k) => searchMatches(k, needle))
    if (keyword !== undefined) {
      scored.push({
        hit: { id: candidate.id, reason: 'mark', via: keyword },
        rank: 0,
        order: 2,
        name: candidate.name,
      })
      continue
    }

    if (candidate.assigneeName && searchMatches(candidate.assigneeName, needle)) {
      scored.push({
        hit: { id: candidate.id, reason: 'assignee', via: candidate.assigneeName },
        rank: 0,
        order: 3,
        name: candidate.name,
      })
    }
  }

  return scored
    .sort((a, b) => a.order - b.order || a.rank - b.rank || a.name.localeCompare(b.name))
    .map((entry) => entry.hit)
}

/**
 * The hits grouped by reason, in {@link MATCH_REASONS} order and skipping a
 * reason nothing matched — an empty „Treffer im Tag" heading is a heading
 * over nothing, which is the rule the grouped list already follows.
 */
export function hitsByReason(hits: readonly ItemSearchHit[]): [MatchReason, ItemSearchHit[]][] {
  return MATCH_REASONS.map(
    (reason) =>
      [reason, hits.filter((hit) => hit.reason === reason)] as [MatchReason, ItemSearchHit[]],
  ).filter(([, group]) => group.length > 0)
}

/** FR-24.11: the query names no item — offer to create it. */
export const OFFER_CREATE = 'create'
/** FR-24.11: the query names a retired item — offer it back instead. */
export const OFFER_RESTORE = 'restore'

/**
 * What M9 offers above its results for a query (FR-24.11), or `null` when the
 * query already names an item on screen.
 */
export type SearchOffer =
  | { kind: typeof OFFER_CREATE; name: string }
  | { kind: typeof OFFER_RESTORE; id: string; name: string }
  | null

/**
 * searchOffer decides whether the inventory search offers to create what it
 * did not find (FR-24.11).
 *
 * The test is **no active item of exactly this name**, not „no hits": „Zelt"
 * finds *Zeltheringe* and *Zeltunterlage* and the tent is still missing, which
 * is the common case an offer made only in the empty state would never reach.
 * „Exactly" is {@link searchEquals}, the search's own fold, so neither keyboard
 * spelling of an umlaut invites a second „Gürtel" beside the one listed.
 *
 * A **retired** item of that name is offered back rather than a new one made:
 * retiring frees the name (ADR-034), so a new row would be allowed — but it
 * would start without the tags, weight and history the hidden one still has.
 */
export function searchOffer(
  query: string,
  active: readonly NamedRow[],
  retired: readonly NamedRow[],
): SearchOffer {
  const name = query.trim()
  if (!name) return null
  if (active.some((row) => searchEquals(row.name, name))) return null
  const hidden = retired.find((row) => searchEquals(row.name, name))
  if (hidden) return { kind: OFFER_RESTORE, id: hidden.id, name: hidden.name }
  return { kind: OFFER_CREATE, name }
}
