/**
 * M21 — a finished trip folded back into templates (§3.27, FR-27.5). Pure, no I/O.
 *
 * This is the closing half of the FR-27.1 round-trip: M3 instantiates a
 * composed Vorlage into a trip, M21 recognises what that trip was made of and
 * writes it back. The naive "save as template" would copy the trip flat, which
 * forks every group it came from — next year two divergent camera lists exist.
 * Recognition is what prevents that, and it is a fact of the data
 * (`source_template_id` provenance) rather than a question put to the user.
 */

import type { MasterItem, Template, TemplateItem, TripItem } from '@/types/domain'

/** Everything recognition reads — plain arrays, the stores shape them. */
export interface RecognitionInput {
  /** The source trip's rows. Never modified by this screen (FR-27.5). */
  tripItems: TripItem[]
  templates: Template[]
  /** Positions across all templates; only the recognised ones are read. */
  positions: TemplateItem[]
  /** Needed to name a group's positions, which sync by id, not by name. */
  masterItems: MasterItem[]
}

/** One group the trip's rows trace back to, with how the two have drifted. */
export interface RecognisedGroup {
  group: Template
  /** Rows of this trip that carry the group as provenance. */
  tripItems: TripItem[]
  /**
   * Rows carrying the group's provenance that the group no longer contains —
   * "auf der Reise ergänzt". The drift is real whichever end moved: the user
   * added it under the group, or the group lost the position afterwards. From
   * the group's side both read the same, and the offer is the same too.
   */
  added: TripItem[]
  /**
   * Positions of the group the trip did not carry, by name. Reported, never
   * acted on: a skipped tripod is trip history, and pruning the group over it
   * would let every incomplete trip erode the master data (FR-27.5).
   */
  absent: string[]
}

/** Why a row has no group to fold into — the screen turns it into words. */
export type LooseReason = 'ad-hoc' | 'from-template'

/** A row that becomes an own position of the new Vorlage, unless unchecked. */
export interface LooseRow {
  tripItem: TripItem
  reason: LooseReason
  /**
   * The Ferien-Vorlage the row came from, when that is why it is loose.
   * Null for a genuine ad-hoc row.
   */
  sourceTemplate: Template | null
}

export interface TripComposition {
  /** Recognised groups, ordered by name so two devices agree (FR-27.2). */
  groups: RecognisedGroup[]
  loose: LooseRow[]
}

/**
 * recogniseTripComposition sorts a trip's rows into the groups they came from
 * and the rows that belong to no group.
 *
 * **Only a Gruppe can be recognised.** A row generated from the old Vorlage's
 * *own* positions carries that Vorlage as provenance, and FR-27.1 fixes the
 * hierarchy at two levels — a Ferien-Vorlage cannot include another one, so
 * there is nothing to reference. Such a row is loose, and says so differently
 * from a genuine ad-hoc one: it was planned, just not by a reusable building
 * block. A row whose provenance names a template this device does not have is
 * loose too — an unresolvable id is not a group, and guessing would fabricate
 * a reference (the M12 honesty rule).
 */
export function recogniseTripComposition(input: RecognitionInput): TripComposition {
  const byId = new Map(input.templates.map((t) => [t.id, t]))
  const itemNames = new Map(input.masterItems.map((i) => [i.id, i.name]))

  const rowsByGroup = new Map<string, TripItem[]>()
  const loose: LooseRow[] = []
  for (const row of input.tripItems) {
    const source = row.source_template_id ? byId.get(row.source_template_id) : undefined
    if (source?.kind === 'group') {
      const rows = rowsByGroup.get(source.id)
      if (rows) rows.push(row)
      else rowsByGroup.set(source.id, [row])
      continue
    }
    loose.push({
      tripItem: row,
      reason: source ? 'from-template' : 'ad-hoc',
      sourceTemplate: source ?? null,
    })
  }

  const groups: RecognisedGroup[] = []
  for (const [groupId, tripItems] of rowsByGroup) {
    const group = byId.get(groupId)!
    const positionNames = input.positions
      .filter((p) => p.template_id === groupId)
      .map((p) => itemNames.get(p.item_id))
      .filter((n): n is string => n !== undefined)

    groups.push({
      group,
      tripItems,
      added: tripItems.filter((row) => !positionNames.some((n) => namesMatch(n, row.name))),
      absent: positionNames.filter((n) => !tripItems.some((row) => namesMatch(n, row.name))),
    })
  }

  // By name for the same reason includedTemplatesOf sorts by name: the rows
  // arrive in whatever order the sync produced, and this list is read.
  groups.sort((a, b) => a.group.name.localeCompare(b.group.name))
  return { groups, loose }
}

/**
 * namesMatch decides whether a trip row and a template position are the same
 * thing. Deliberately name-based rather than by `source_item_id`: an ad-hoc
 * row typed on the trip has no master item yet, and the whole point of the
 * comparison is to notice it is the tripod the group already knows about.
 * Case- and whitespace-tolerant only — the FR-16.3 fuzzy matcher belongs to
 * the master-item fold, where a wrong guess is reviewable, not here, where it
 * would silently swallow a deviation.
 */
function namesMatch(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/**
 * suggestTemplateName guesses the name of next year's run from the trip's own.
 *
 * A trip name usually carries its year ("Samedan Sommer 2026"), and the
 * template that outlives it wants the next one. Where no year is in the name
 * there is nothing to bump, so the trip name stands as-is rather than growing
 * a year the user did not write — it is a prefilled field, and a wrong guess
 * costs a correction either way.
 */
export function suggestTemplateName(tripName: string): string {
  const name = tripName.trim()
  const year = /\b(\d{4})\b/.exec(name)
  if (!year) return name
  const bumped = String(Number(year[1]) + 1)
  return name.slice(0, year.index) + bumped + name.slice(year.index + year[1]!.length)
}
