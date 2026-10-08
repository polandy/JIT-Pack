/**
 * How one shopping list reads (FR-30.2) — pure, no I/O, no Vue.
 *
 * A source's lines (today, only the packing list's) come first, combined
 * under one heading regardless of what category each row carries — the
 * packing list's own categories are not this list's tags, and giving each
 * one its own heading here would read as more shopping-list structure than
 * there is. The list's own entries follow,
 * under their own heading. No line is merged with another across the two
 * — „Brot" typed here and „Brot" on the packing list are two decisions,
 * and the list says so rather than guessing that they are one (ADR-066).
 */
import { DUE_SOON_DAYS, daysBetween, pressingGroupsFirst, sortByDue } from '@/lib/dueDay'
import { byHand, dropInto, renumber, type Placement } from '@/lib/handOrder'
import type { ShoppingLine, ShoppingSource } from '@/kernel/shoppingSources'
import { beforeIsOver, type TripStanding } from '@/lib/tripPhase'
import type { ShoppingMode } from '@/types/domain'
import { ITEM_MODE_BUY_BEFORE, ITEM_MODE_BUY_LOCAL, SHOPPING_MODES } from '@/types/domain'

/**
 * Which list a trip is on *now* (FR-30.8): the one still worth working.
 *
 * *Vor der Reise* answers that only until the trip is under way — started,
 * its first day come, or its packing declared finished (FR-5.10), the kernel's
 * {@link beforeIsOver}, which M25 asks too. From then on what is left to do is
 * at the destination, and *Vor der Reise* takes nothing new. Nothing is
 * hidden by it: the other tab carries its count.
 *
 * Both screens of the module ask, and they must not disagree — M6 opens on
 * this, and so does the dashboard card under each trip (FR-30.7).
 */
export function listInFocus(trip: TripStanding, today: string): ShoppingMode {
  return beforeIsOver(trip, today) ? ITEM_MODE_BUY_LOCAL : ITEM_MODE_BUY_BEFORE
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
   * — never more than one of these, and absent, not
   * empty, when no source has anything open.
   */
  packing: boolean
  /**
   * FR-7.16: the heading of what the close of the packing carried here from
   * *before departure* — packing lines and own entries alike, unless a tag
   * or a source's own heading files them more precisely. Never a drop target.
   */
  carried: boolean
  /** The own entries' tag; null otherwise, the packing section included. */
  name: string | null
  lines: ShoppingLine[]
}

/** The own entries' section key — an absence of a heading, addressed like one. */
const OWN_SECTION = 'own'
/** Every source's lines, combined under this one heading. */
const PACKING_SECTION = 'packing'
/** FR-7.16: what the close carried from before departure. */
const CARRIED_SECTION = 'carried'

/** A line's due day, or null for none (FR-30.10). */
function dueDayOf(line: ShoppingLine): string | null {
  return line.dueDate ?? null
}

/**
 * Whether a line is one to look at now (FR-30.10): overdue, or due within the
 * days its source gives it — FR-30.10's two for an entry, none for a meal's
 * ingredient, which presses on its meal's day only (FR-33.3).
 */
export function isPressingLine(line: ShoppingLine, today: string): boolean {
  const day = dueDayOf(line)
  return day !== null && daysBetween(today, day) <= (line.pressingDays ?? DUE_SOON_DAYS)
}

/**
 * buildSections files the lines under their headings: every source's lines
 * first, combined under one heading regardless of category, since none of
 * them are this list's own tags to file separately by — then the own entries, a section per tag A–Z, then the untagged ones
 * (FR-30.9). A section is absent, not empty, when nothing is filed under it.
 *
 * FR-30.10, M25's rule for a task (FR-7.11): inside a section the dated lines
 * come first, earliest first, and a section holding something overdue, due
 * today or in the next two days moves above the others, keeping this order
 * inside both halves. Without `today` nothing moves.
 *
 * FR-30.13: a line placed by hand stands where it was put — after the lines
 * never placed, which keep the order above (ADR-083). Once a section has
 * been arranged, its hand order is all it has.
 */
export function buildSections(
  own: ShoppingLine[],
  sourced: ShoppingLine[],
  today?: string,
): ShoppingSection[] {
  const sections = fileSections(own, sourced).map((section) => ({
    ...section,
    lines: byHand(
      today === undefined ? section.lines : sortByDue(section.lines, today, dueDayOf),
      positionOf,
    ),
  }))
  if (today === undefined) return sections
  return pressingGroupsFirst(sections, (section) =>
    section.lines.some((line) => isPressingLine(line, today)),
  )
}

/** A line's hand-set place (FR-30.13). */
function positionOf(line: ShoppingLine): number | null | undefined {
  return line.position
}

function fileSections(own: ShoppingLine[], sourced: ShoppingLine[]): ShoppingSection[] {
  const sections: ShoppingSection[] = []
  // FR-7.16: first, since what is left over from before departure is what
  // the reader most needs to find at the destination.
  const carried = [
    ...sourced.filter((line) => line.carriedOver && !line.section),
    ...own.filter((line) => line.carriedOver && !line.tag),
  ]
  if (carried.length > 0) {
    sections.push({
      key: CARRIED_SECTION,
      own: false,
      tagged: false,
      packing: false,
      carried: true,
      name: null,
      lines: carried,
    })
  }
  const combined = sourced.filter((line) => !line.section && !line.carriedOver)
  if (combined.length > 0) {
    sections.push({
      key: PACKING_SECTION,
      own: false,
      tagged: false,
      packing: true,
      carried: false,
      name: null,
      lines: combined,
    })
  }
  // FR-31.8: a source that names a heading gets it — after the combined one,
  // A–Z, and never a place to drop an entry (it is not one of this list's tags).
  const bySection = new Map<string, ShoppingLine[]>()
  for (const line of sourced) {
    if (line.section) bySection.set(line.section, [...(bySection.get(line.section) ?? []), line])
  }
  // FR-33.3: a source may rank its heading after the others — the meal plan's
  // stands last whatever its name, since a week of cooking is the bulk.
  const rankOf = (name: string) => bySection.get(name)?.[0]?.sectionRank ?? 0
  const named = [...bySection.keys()].sort((a, b) => rankOf(a) - rankOf(b) || a.localeCompare(b))
  for (const name of named) {
    sections.push({
      key: `source:${name}`,
      own: false,
      tagged: false,
      packing: false,
      carried: false,
      name,
      lines: bySection.get(name) ?? [],
    })
  }
  const byTag = new Map<string, ShoppingLine[]>()
  const untagged: ShoppingLine[] = []
  for (const line of own) {
    if (!line.tag) {
      if (!line.carriedOver) untagged.push(line)
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
      carried: false,
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
      carried: false,
      name: null,
      lines: untagged,
    })
  }
  return sections
}

/** One list of the board (M25's phase shelf): its sections, and what stands in them. */
export interface ListShelf {
  sections: ShoppingSection[]
  /** The open lines under this list's sections — the block above not counted. */
  open: number
}

/** What M6 draws, top to bottom (M25's reading). */
export interface ShoppingBoard {
  /** The *Fällig* block: pressing open lines of both lists, earliest first. */
  due: ShoppingLine[]
  lists: Record<ShoppingMode, ListShelf>
  /** The list a line stands on, by key — the block's lines included. */
  listOf(key: string): ShoppingMode | undefined
  /**
   * FR-30.13: each list's sections with every open line in them — the
   * block's too, which stand in their section's order while they are shown
   * above it. What a move renumbers: a line held in the block keeps its
   * place among its section's lines for when its day has passed.
   */
  whole: Record<ShoppingMode, ShoppingSection[]>
  /** The key of the section a line is filed under in `whole` — the block's lines included. */
  homeOf(key: string): string | undefined
}

/**
 * shoppingBoard files every open line in exactly one place, as `taskBoard`
 * does for M25: a line overdue, due today or in the next two days is read in
 * the one block on top across both lists and every tag, and **leaves its
 * section while it is there** — a line listed twice is a line bought in one
 * place and still open in the other.
 */
export function shoppingBoard(
  open: Record<ShoppingMode, { own: ShoppingLine[]; sourced: ShoppingLine[] }>,
  today: string,
): ShoppingBoard {
  const pressing = (line: ShoppingLine) => isPressingLine(line, today)
  const keyed = new Map<string, ShoppingMode>()
  const due: ShoppingLine[] = []
  const lists = {} as Record<ShoppingMode, ListShelf>
  const whole = {} as Record<ShoppingMode, ShoppingSection[]>
  const homes = new Map<string, string>()
  for (const list of SHOPPING_MODES) {
    const { own, sourced } = open[list]
    for (const line of [...own, ...sourced]) keyed.set(line.key, list)
    whole[list] = buildSections(own, sourced, today)
    for (const section of whole[list]) {
      for (const line of section.lines) homes.set(line.key, section.key)
    }
    due.push(...own.filter(pressing), ...sourced.filter(pressing))
    const standing = {
      own: own.filter((l) => !pressing(l)),
      sourced: sourced.filter((l) => !pressing(l)),
    }
    lists[list] = {
      sections: buildSections(standing.own, standing.sourced, today),
      open: standing.own.length + standing.sourced.length,
    }
  }
  return {
    due: sortByDue(due, today, dueDayOf),
    lists,
    listOf: (key) => keyed.get(key),
    whole,
    homeOf: (key) => homes.get(key),
  }
}

/** What letting a line go over a section means (FR-30.9, FR-30.13). */
export interface ShoppingDrop {
  /** The tag the line takes, null for none; absent where it stays in its section. */
  retag?: string | null
  /** The places to write, the moved line's among them — the section renumbered. */
  placements: Placement<ShoppingLine>[]
}

/**
 * planDrop says what a line let go in gap `gap` of `section` (as the screen
 * shows it, on `list`) writes — or null where it writes nothing, or where
 * the section cannot hold the line at all.
 *
 * Any line may move inside its own section (FR-30.13); only an own entry may
 * leave it, and only for one of its own list's tag sections, which is a
 * retag (FR-30.9). The gap counts the rows the section shows, and the whole
 * section — its lines in the *Fällig* block too — is renumbered around it.
 */
export function planDrop(
  board: ShoppingBoard,
  line: ShoppingLine,
  list: ShoppingMode,
  section: ShoppingSection,
  gap: number | null,
): ShoppingDrop | null {
  if (!canDrop(board, line, list, section)) return null
  const home = board.homeOf(line.key) === section.key
  const retag = home ? undefined : dropTag(section)
  const group = board.whole[list].find((s) => s.key === section.key)?.lines ?? section.lines
  const ordered = dropInto(
    group,
    section.lines,
    line,
    gap ?? section.lines.length,
    (a, b) => a.key === b.key,
  )
  if (ordered === null && retag === undefined) return null
  return {
    ...(retag === undefined ? {} : { retag }),
    placements: ordered === null ? [] : renumber(ordered, positionOf),
  }
}

/**
 * canDrop is `planDrop`'s first half, which the gesture asks while the line
 * is still in the air: its own section, or — for an own entry — a tag
 * section of the list it stands on.
 */
export function canDrop(
  board: ShoppingBoard,
  line: ShoppingLine,
  list: ShoppingMode,
  section: ShoppingSection,
): boolean {
  if (board.listOf(line.key) !== list) return false
  if (board.homeOf(line.key) === section.key) return true
  return !!line.edit && dropTag(section) !== undefined
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

/** The key of the group that holds purchases with no readable moment (FR-30.15). */
export const UNDATED_BOUGHT_DAY = 'undated'

/** One day of a list's *gekauft* fold and what was bought on it (FR-30.15). */
export interface BoughtDay {
  /** The local calendar day as `YYYY-MM-DD`, or {@link UNDATED_BOUGHT_DAY}. */
  key: string
  /** Midnight of that day in local time; null for the undated group. */
  day: Date | null
  /** Whether the day is near enough to name rather than date. */
  relative: 'today' | 'yesterday' | null
  lines: ShoppingLine[]
}

function localDayKey(at: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`
}

/**
 * FR-30.15: a list's bought lines filed under the local calendar day they
 * were bought on (FR-30.4's `boughtAt`) — the latest day first and, within a
 * day, the latest purchase first. A purchase with no readable moment goes
 * to one undated group at the end, in the order it came.
 */
export function boughtByDay(lines: readonly ShoppingLine[], now: Date): BoughtDay[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
  const dated: { line: ShoppingLine; at: Date }[] = []
  const undated: ShoppingLine[] = []
  for (const line of lines) {
    const at = line.boughtAt ? new Date(line.boughtAt) : null
    if (at && !Number.isNaN(at.getTime())) dated.push({ line, at })
    else undated.push(line)
  }
  dated.sort((a, b) => b.at.getTime() - a.at.getTime())

  const days: BoughtDay[] = []
  for (const { line, at } of dated) {
    const key = localDayKey(at)
    let group = days.at(-1)
    if (group?.key !== key) {
      const day = new Date(at.getFullYear(), at.getMonth(), at.getDate())
      const relative =
        key === localDayKey(today) ? 'today' : key === localDayKey(yesterday) ? 'yesterday' : null
      group = { key, day, relative, lines: [] }
      days.push(group)
    }
    group.lines.push(line)
  }
  if (undated.length > 0) {
    days.push({ key: UNDATED_BOUGHT_DAY, day: null, relative: null, lines: undated })
  }
  return days
}
