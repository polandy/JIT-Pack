/**
 * The inventory's cleanup rules (FR-24.12) — what M24 lists, and what it
 * offers to do about each finding.
 *
 * **A rule finds, it never refuses.** „Every item carries at least one tag"
 * cannot be a constraint: an assignment is its own `item_tags` row, and under
 * field-level LWW a write refused for breaking a cross-row rule is a write the
 * outbox drops (the same argument that keeps `retired_at` free of CHECKs).
 * Untagged items also keep arriving by design — FR-24.11's quick create, the
 * spreadsheet import, M21. So the rule runs afterwards, over what is there.
 *
 * Pure and client-side (invariant 4): every input is a master-partition table
 * the device already holds, plus the trip rows it happens to hold — which is
 * where the one honesty clause lives, see {@link unusedItems}.
 *
 * Each finding is shaped for the one repair the screen offers beside it, and
 * every repair is an existing action (FR-24.9's give, FR-24.3's retire,
 * FR-24.10's merge): the rules add a way *in*, never a second way to write.
 */
import { foldName } from './nameCollision'

/** The rules, in the order the screen lists them. */
export const HYGIENE_RULE_UNTAGGED = 'untagged'
export const HYGIENE_RULE_UNUSED = 'unused'
export const HYGIENE_RULE_SINGLE_TAG = 'singleTag'

export const HYGIENE_RULES = [
  HYGIENE_RULE_UNTAGGED,
  HYGIENE_RULE_UNUSED,
  HYGIENE_RULE_SINGLE_TAG,
] as const

export type HygieneRule = (typeof HYGIENE_RULES)[number]

/** The thresholds „lange nicht gebraucht" may be set to, in months. */
export const UNUSED_MONTH_CHOICES = [6, 12, 24] as const
export type UnusedMonths = (typeof UNUSED_MONTH_CHOICES)[number]
export const DEFAULT_UNUSED_MONTHS: UnusedMonths = 12

/**
 * How long a shared name prefix has to be before it suggests a tag. Four
 * letters is „Zahn" — Zahnseide beside Zahnbürste — and three would already
 * pair „Sonnenhut" with „Sonde". A wrong offer costs a tap, but an offer that
 * is wrong often stops being read at all.
 */
export const NAME_PREFIX_MIN = 4

// --- The rows the rules read, reduced to what they need ---------------------

export interface HygieneItem {
  id: string
  name: string
}

export interface HygieneTag {
  id: string
  name: string
  sort_order: number
}

export interface HygieneAssignment {
  item_id: string
  tag_id: string
  position: number
}

export interface HygieneTemplate {
  id: string
  name: string
}

export interface HygienePosition {
  template_id: string
  item_id: string
}

export interface HygieneTrip {
  id: string
  year: number
  start_date: string | null
  end_date: string | null
}

export interface HygieneTripRow {
  trip_id: string
  source_item_id: string | null
}

// --- Ohne Tag ---------------------------------------------------------------

/** Why a tag is suggested — said beside the offer, never left to be guessed. */
export type TagSuggestionReason = { kind: 'name'; via: string } | { kind: 'template'; via: string }

export interface TagSuggestion {
  tagId: string
  reason: TagSuggestionReason
}

export interface UntaggedFinding {
  item: HygieneItem
  suggestion: TagSuggestion | null
}

/** The primary tag of every item that has one — position 0 or the lowest. */
function primaryTags(assignments: readonly HygieneAssignment[]): Map<string, string> {
  const best = new Map<string, HygieneAssignment>()
  for (const a of assignments) {
    const held = best.get(a.item_id)
    if (!held || a.position < held.position) best.set(a.item_id, a)
  }
  return new Map([...best].map(([itemId, a]) => [itemId, a.tag_id]))
}

function sharedPrefix(a: string, b: string): number {
  const n = Math.min(a.length, b.length)
  let i = 0
  while (i < n && a[i] === b[i]) i++
  return i
}

/**
 * The tag an untagged item most likely belongs under, and why — or null.
 *
 * Two reasons, in this order, because the first is the stronger claim:
 *
 *   1. **A Vorlage** — among the active Vorlagen holding the item, the primary
 *      tag most of its fellow positions carry; ties go to the axis order.
 *      Somebody put the item there beside those others on purpose.
 *   2. **A name neighbour** — the tagged item sharing the longest folded name
 *      prefix (at least {@link NAME_PREFIX_MIN} letters) lends its primary
 *      tag: Zahnseide „wie Zahnbürste".
 *
 * The Vorlage comes first: the other way round, a Reiseadapter filed in
 * „Strom & Laden" is offered „Bad", because it shares „Reise" with the
 * Reiseapotheke: German compounds make a shared first word common and
 * weak, and a Vorlage is a decision somebody made.
 *
 * No reason, no suggestion: an offer that cannot say why is a guess, and the
 * screen's „Tag wählen …" is right beside it.
 */
export function suggestTag(
  item: HygieneItem,
  ctx: {
    items: readonly HygieneItem[]
    tags: readonly HygieneTag[]
    assignments: readonly HygieneAssignment[]
    templates: readonly HygieneTemplate[]
    positions: readonly HygienePosition[]
  },
): TagSuggestion | null {
  const primary = primaryTags(ctx.assignments)
  const known = new Set(ctx.tags.map((t) => t.id))
  return byTemplate(item, ctx, primary, known) ?? byName(item, ctx.items, primary, known)
}

function byTemplate(
  item: HygieneItem,
  ctx: {
    tags: readonly HygieneTag[]
    templates: readonly HygieneTemplate[]
    positions: readonly HygienePosition[]
  },
  primary: Map<string, string>,
  known: Set<string>,
): TagSuggestion | null {
  const holding = [...ctx.templates]
    .filter((tpl) => ctx.positions.some((p) => p.template_id === tpl.id && p.item_id === item.id))
    .sort((a, b) => a.name.localeCompare(b.name))
  const votes = new Map<string, { count: number; via: string }>()
  for (const tpl of holding) {
    for (const p of ctx.positions) {
      if (p.template_id !== tpl.id || p.item_id === item.id) continue
      const tagId = primary.get(p.item_id)
      if (!tagId || !known.has(tagId)) continue
      const vote = votes.get(tagId)
      if (vote) vote.count++
      else votes.set(tagId, { count: 1, via: tpl.name })
    }
  }
  const axis = new Map(ctx.tags.map((t) => [t.id, t.sort_order]))
  const winner = [...votes].sort(
    ([a, va], [b, vb]) => vb.count - va.count || (axis.get(a) ?? 0) - (axis.get(b) ?? 0),
  )[0]
  return winner ? { tagId: winner[0], reason: { kind: 'template', via: winner[1].via } } : null
}

function byName(
  item: HygieneItem,
  items: readonly HygieneItem[],
  primary: Map<string, string>,
  known: Set<string>,
): TagSuggestion | null {
  const own = foldName(item.name)
  let neighbour: { name: string; tagId: string; length: number } | null = null
  for (const other of items) {
    const tagId = primary.get(other.id)
    if (other.id === item.id || !tagId || !known.has(tagId)) continue
    const length = sharedPrefix(own, foldName(other.name))
    if (length < NAME_PREFIX_MIN) continue
    // Longest prefix wins; among equals the alphabetically first, so the
    // offer does not change with the order the rows happened to arrive in.
    if (
      !neighbour ||
      length > neighbour.length ||
      (length === neighbour.length && other.name.localeCompare(neighbour.name) < 0)
    ) {
      neighbour = { name: other.name, tagId, length }
    }
  }
  return neighbour
    ? { tagId: neighbour.tagId, reason: { kind: 'name', via: neighbour.name } }
    : null
}

/** Every active item carrying no tag, by name, each with its suggestion. */
export function untaggedItems(ctx: {
  items: readonly HygieneItem[]
  tags: readonly HygieneTag[]
  assignments: readonly HygieneAssignment[]
  templates: readonly HygieneTemplate[]
  positions: readonly HygienePosition[]
}): UntaggedFinding[] {
  const tagged = new Set(ctx.assignments.map((a) => a.item_id))
  return ctx.items
    .filter((item) => !tagged.has(item.id))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((item) => ({ item, suggestion: suggestTag(item, ctx) }))
}

// --- Lange nicht gebraucht --------------------------------------------------

export interface UnusedFinding {
  item: HygieneItem
  /** The last day of the last known trip it was on (YYYY-MM-DD). */
  lastUsed: string
}

/**
 * The day a trip counts as having used its items: its end, else its start,
 * else the last day of its year. The year-end fallback errs towards *recent*,
 * which errs towards not flagging — a dateless trip is not evidence that an
 * item has been forgotten.
 */
export function tripUseDay(trip: HygieneTrip): string {
  return trip.end_date ?? trip.start_date ?? `${trip.year}-12-31`
}

/** `today` moved back by whole months, as a YYYY-MM-DD string. */
export function monthsBefore(today: string, months: number): string {
  const [y, m, d] = today.split('-').map(Number) as [number, number, number]
  const date = new Date(Date.UTC(y, m - 1 - months, 1))
  // Clamp the day to the target month, so 31 March minus one month is the
  // last of February rather than rolling over into 3 March.
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
  date.setUTCDate(Math.min(d, last))
  return date.toISOString().slice(0, 10)
}

/**
 * Items that were packed once and have not been since (FR-24.12): in no
 * active Vorlage, and whose last known trip ended more than `months` ago.
 *
 * Three deliberate limits, each a false alarm the rule refuses to raise:
 *
 *   - **Never-used items are not flagged.** Items carry no creation date, so
 *     one created yesterday and one forgotten for years look the same; only
 *     a known *last* use says how long it has been.
 *   - **Untagged items are left to the untagged rule**, so one item is one
 *     finding and the list does not ask two questions about the same row.
 *   - **A Vorlage holding it is a use.** It will be generated onto the next
 *     trip, which is the opposite of forgotten.
 *
 * And one limit it cannot refuse, only admit: in Server Mode the device holds
 * only the trips that were opened (ADR-032), so a more recent use may sit in
 * a trip it has not seen. The screen says so where it applies — see
 * {@link unseenTrips} — and the repair is a retire, which M23 undoes.
 */
export function unusedItems(ctx: {
  items: readonly HygieneItem[]
  assignments: readonly HygieneAssignment[]
  positions: readonly HygienePosition[]
  trips: readonly HygieneTrip[]
  tripRows: readonly HygieneTripRow[]
  today: string
  months: number
}): UnusedFinding[] {
  const tagged = new Set(ctx.assignments.map((a) => a.item_id))
  const inTemplate = new Set(ctx.positions.map((p) => p.item_id))
  const useDay = new Map(ctx.trips.map((trip) => [trip.id, tripUseDay(trip)]))

  const lastUse = new Map<string, string>()
  for (const row of ctx.tripRows) {
    const day = useDay.get(row.trip_id)
    if (!row.source_item_id || !day) continue
    const held = lastUse.get(row.source_item_id)
    if (!held || day > held) lastUse.set(row.source_item_id, day)
  }

  const cutoff = monthsBefore(ctx.today, ctx.months)
  return ctx.items
    .filter((item) => tagged.has(item.id) && !inTemplate.has(item.id))
    .flatMap((item) => {
      const lastUsed = lastUse.get(item.id)
      return lastUsed && lastUsed < cutoff ? [{ item, lastUsed }] : []
    })
    .sort((a, b) => a.lastUsed.localeCompare(b.lastUsed) || a.item.name.localeCompare(b.item.name))
}

/**
 * How many trips inside the window this device holds no rows for — the
 * number the „lange nicht gebraucht" card has to admit in Server Mode.
 * Zero in Local Mode, where every trip is on the device.
 */
export function unseenTrips(
  trips: readonly HygieneTrip[],
  loaded: (tripId: string) => boolean,
  today: string,
  months: number,
): number {
  const cutoff = monthsBefore(today, months)
  return trips.filter((trip) => tripUseDay(trip) >= cutoff && !loaded(trip.id)).length
}

// --- Tag mit nur einem Artikel ----------------------------------------------

export interface SingleTagFinding {
  tag: HygieneTag
  item: HygieneItem
}

/**
 * Tags that exactly one active item carries, in axis order. A tag that
 * groups one item groups nothing; it is usually a typo of another or a
 * category that never caught on, and the repair is FR-24.10's merge.
 */
export function singleItemTags(ctx: {
  items: readonly HygieneItem[]
  tags: readonly HygieneTag[]
  assignments: readonly HygieneAssignment[]
}): SingleTagFinding[] {
  const active = new Map(ctx.items.map((item) => [item.id, item]))
  const holders = new Map<string, Set<string>>()
  for (const a of ctx.assignments) {
    if (!active.has(a.item_id)) continue
    const set = holders.get(a.tag_id) ?? new Set<string>()
    set.add(a.item_id)
    holders.set(a.tag_id, set)
  }
  return [...ctx.tags]
    .sort((a, b) => a.sort_order - b.sort_order)
    .flatMap((tag) => {
      const set = holders.get(tag.id)
      if (!set || set.size !== 1) return []
      return [{ tag, item: active.get([...set][0]!)! }]
    })
}

// --- The whole report -------------------------------------------------------

/** What the screen lets a device decide about the rules (FR-24.12). */
export interface HygieneSettings {
  enabled: Record<HygieneRule, boolean>
  unusedMonths: number
  /** Items „Behalten" was pressed on — the unused rule asks about them no more. */
  keptItems: readonly string[]
  /** Tags „Behalten" was pressed on — the single-tag rule asks no more. */
  keptTags: readonly string[]
}

export interface HygieneReport {
  untagged: UntaggedFinding[]
  unused: UnusedFinding[]
  singleTag: SingleTagFinding[]
  /** Findings across the enabled rules — the count M9 carries. */
  total: number
}

/**
 * Every enabled rule over the inventory, with what the device chose to keep
 * taken out. A disabled rule reports nothing rather than being hidden with
 * its findings still counted — the count in M9 has to match the screen.
 */
export function hygieneReport(
  ctx: {
    items: readonly HygieneItem[]
    tags: readonly HygieneTag[]
    assignments: readonly HygieneAssignment[]
    templates: readonly HygieneTemplate[]
    positions: readonly HygienePosition[]
    trips: readonly HygieneTrip[]
    tripRows: readonly HygieneTripRow[]
    today: string
  },
  settings: HygieneSettings,
): HygieneReport {
  const keptItems = new Set(settings.keptItems)
  const keptTags = new Set(settings.keptTags)
  const untagged = settings.enabled[HYGIENE_RULE_UNTAGGED] ? untaggedItems(ctx) : []
  const unused = settings.enabled[HYGIENE_RULE_UNUSED]
    ? unusedItems({ ...ctx, months: settings.unusedMonths }).filter(
        (f) => !keptItems.has(f.item.id),
      )
    : []
  const singleTag = settings.enabled[HYGIENE_RULE_SINGLE_TAG]
    ? singleItemTags(ctx).filter((f) => !keptTags.has(f.tag.id))
    : []
  return {
    untagged,
    unused,
    singleTag,
    total: untagged.length + unused.length + singleTag.length,
  }
}
