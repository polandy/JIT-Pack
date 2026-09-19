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
import { SHOPPING_MODES } from '@/types/domain'

/** One heading of a shopping list and the lines under it. */
export interface ShoppingSection {
  key: string
  /** True for the list's own entries, which the screen names itself. */
  own: boolean
  /** A source's heading; null for the own entries and for a source's uncategorised bucket. */
  name: string | null
  lines: ShoppingLine[]
}

/** The own entries' section key — an absence of a heading, addressed like one. */
const OWN_SECTION = 'own'
/** A source's uncategorised bucket. */
const NO_SECTION = ''

/**
 * buildSections files the lines under their headings: the own entries first,
 * then the sources' lines by `section`, in the order they arrive — so the
 * list does not reshuffle under a purchase. A section is absent, not empty,
 * when nothing is filed under it.
 */
export function buildSections(own: ShoppingLine[], sourced: ShoppingLine[]): ShoppingSection[] {
  const sections: ShoppingSection[] = []
  if (own.length > 0) sections.push({ key: OWN_SECTION, own: true, name: null, lines: own })
  const byHeading = new Map<string, ShoppingSection>()
  for (const line of sourced) {
    const key = `section:${line.section ?? NO_SECTION}`
    let section = byHeading.get(key)
    if (!section) {
      section = { key, own: false, name: line.section, lines: [] }
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
