/**
 * How one shopping list reads (FR-30.2) — pure, no I/O, no Vue.
 *
 * The list's own entries come first, under their own heading: they are what
 * somebody typed into *this* list, and the packing list's contribution is
 * filed after them by the headings its source chose. No line is merged with
 * another across the two — „Brot" typed here and „Brot" on the packing list
 * are two decisions, and the list says so rather than guessing that they are
 * one (ADR-066).
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
  /** A source's heading; null for the own entries and for a source's uncategorised bucket. */
  name: string | null
  lines: ShoppingLine[]
}

/** The own entries' section key — an absence of a heading, addressed like one. */
const OWN_SECTION = 'own'
/** A source's uncategorised bucket. */
const NO_SECTION = ''

/**
 * buildSections files the lines under their headings: the own entries first —
 * a section per tag, A–Z, then the untagged ones (FR-30.9) — then the
 * sources' lines by `section`, in the order they arrive, so the list does not
 * reshuffle under a purchase. A section is absent, not empty, when nothing is
 * filed under it.
 */
export function buildSections(own: ShoppingLine[], sourced: ShoppingLine[]): ShoppingSection[] {
  const sections: ShoppingSection[] = []
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
      name: tag,
      lines: byTag.get(tag) ?? [],
    })
  }
  if (untagged.length > 0) {
    sections.push({ key: OWN_SECTION, own: true, tagged: false, name: null, lines: untagged })
  }
  const byHeading = new Map<string, ShoppingSection>()
  for (const line of sourced) {
    const key = `section:${line.section ?? NO_SECTION}`
    let section = byHeading.get(key)
    if (!section) {
      section = { key, own: false, tagged: false, name: line.section, lines: [] }
      byHeading.set(key, section)
      sections.push(section)
    }
    section.lines.push(line)
  }
  return sections
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
