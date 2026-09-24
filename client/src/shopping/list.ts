/**
 * How one shopping list reads (FR-30.2) — pure, no I/O, no Vue.
 *
 * A source's lines (today, only the packing list's) come first, combined
 * under one heading regardless of what category each row carries — the
 * packing list's own categories are not this list's tags, and giving each
 * one its own heading here read as more shopping-list structure than it
 * was (owner feedback 2026-09-23, revising the one-heading-per-category
 * cut this module first shipped with). The list's own entries follow,
 * under their own heading. No line is merged with another across the two
 * — „Brot" typed here and „Brot" on the packing list are two decisions,
 * and the list says so rather than guessing that they are one (ADR-066).
 */
import type { ShoppingLine, ShoppingSource } from '@/lib/shoppingSources'
import type { ShoppingMode } from '@/types/domain'
import { ITEM_MODE_BUY_BEFORE, ITEM_MODE_BUY_LOCAL, SHOPPING_MODES } from '@/types/domain'

/**
 * Which list a trip is on *now* (FR-30.8): the one still worth working.
 *
 * *Vor der Abreise* answers that only while departure is still ahead. Once
 * the trip has started — or the packing has been declared finished
 * (FR-5.10), which happens the evening before on a trip nobody has tapped
 * *Reise starten* on — the moment is past, and what is left to do is at the
 * destination. Nothing is hidden by it: the other tab carries its count.
 *
 * Both screens of the module ask, and they must not disagree — M6 opens on
 * this, and so does the dashboard card under each trip (FR-30.7).
 */
export function listInFocus(trip: { planned: boolean; packingClosed: boolean }): ShoppingMode {
  return trip.planned && !trip.packingClosed ? ITEM_MODE_BUY_BEFORE : ITEM_MODE_BUY_LOCAL
}

/** One heading of a shopping list and the lines under it. */
export interface ShoppingSection {
  key: string
  /** True for the list's own untagged entries, which the screen names itself. */
  own: boolean
  /** True for a section of the list's own entries filed under a tag (FR-30.9). */
  tagged: boolean
  /**
   * True for the one combined heading every source's lines are filed under
   * (revised 2026-09-23) — never more than one of these, and absent, not
   * empty, when no source has anything open.
   */
  packing: boolean
  /** The own entries' tag; null otherwise, the packing section included. */
  name: string | null
  lines: ShoppingLine[]
}

/** The own entries' section key — an absence of a heading, addressed like one. */
const OWN_SECTION = 'own'
/** Every source's lines, combined under this one heading. */
const PACKING_SECTION = 'packing'

/**
 * buildSections files the lines under their headings: every source's lines
 * first, combined under one heading regardless of category, since none of
 * them are this list's own tags to file separately by (revised 2026-09-23)
 * — then the own entries, a section per tag A–Z, then the untagged ones
 * (FR-30.9). A section is absent, not empty, when nothing is filed under it.
 */
export function buildSections(own: ShoppingLine[], sourced: ShoppingLine[]): ShoppingSection[] {
  const sections: ShoppingSection[] = []
  if (sourced.length > 0) {
    sections.push({
      key: PACKING_SECTION,
      own: false,
      tagged: false,
      packing: true,
      name: null,
      lines: sourced,
    })
  }
  const byTag = new Map<string, ShoppingLine[]>()
  const untagged: ShoppingLine[] = []
  for (const line of own) {
    if (!line.tag) {
      untagged.push(line)
      continue
    }
    byTag.set(line.tag, [...(byTag.get(line.tag) ?? []), line])
  }
  for (const tag of [...byTag.keys()].sort((a, b) => a.localeCompare(b))) {
    sections.push({
      key: `tag:${tag}`,
      own: false,
      tagged: true,
      packing: false,
      name: tag,
      lines: byTag.get(tag) ?? [],
    })
  }
  if (untagged.length > 0) {
    sections.push({
      key: OWN_SECTION,
      own: true,
      tagged: false,
      packing: false,
      name: null,
      lines: untagged,
    })
  }
  return sections
}

/**
 * dropTag says what a drag onto this section would set (FR-30.9's own
 * single-row retag): the section's tag, null for the untagged own section,
 * or undefined where the section cannot take a drop at all — the one
 * combined packing section, which files nothing under a tag and is never
 * one of this list's own sections.
 */
export function dropTag(section: ShoppingSection): string | null | undefined {
  if (section.own) return null
  if (section.tagged) return section.name
  return undefined
}

/**
 * openCount is what the trip switcher's pill says: the things still to buy on
 * both lists, across every source. Lines, not rows — a source has already
 * aggregated what is bought in one act (FR-25.6).
 */
export function openCount(tripId: string, sources: readonly ShoppingSource[]): number {
  return SHOPPING_MODES.reduce(
    (n, list: ShoppingMode) =>
      n + sources.reduce((m, source) => m + source.open(tripId, list).length, 0),
    0,
  )
}
