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
import { findDuplicates } from './spreadsheet'

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

/** What happens to a group's on-trip deviations (FR-27.5). */
export type DeviationChoice = 'update' | 'own'

/**
 * The default is *update* — deliberately, and it matches M14's stance: a
 * change made while packing is treated as learned truth rather than as an
 * accident. Naming it once keeps the screen and the plan from disagreeing.
 */
export const DEFAULT_DEVIATION_CHOICE: DeviationChoice = 'update'

export interface WritePlanInput {
  composition: TripComposition
  /** The user's name for the new Ferien-Vorlage. */
  templateName: string
  /** Per group id; a group missing here takes DEFAULT_DEVIATION_CHOICE. */
  choices: Record<string, DeviationChoice>
  /** Trip-item ids of the loose rows still checked — pre-checked by default. */
  checkedLooseIds: string[]
  /** "Als neue Gruppe speichern": bundles the checked loose rows instead. */
  bundleName: string | null
  /** The inventory the ad-hoc names are folded onto (FR-16.3-style). */
  masterItems: MasterItem[]
}

/**
 * One position to write. `itemId` is null exactly when the master item has to
 * be created first — the FR-9.2 mechanics M14 already uses, kept as a separate
 * step so the caller writes items before the positions that reference them.
 */
export interface PositionDraft {
  name: string
  itemId: string | null
}

/** A recognised group gaining the deviations the user let flow back. */
export interface GroupUpdate {
  groupId: string
  groupName: string
  positions: PositionDraft[]
}

/**
 * The whole write, ordered as FR-27.5 specifies: master items, then group
 * updates, then the bundle group, then the composed Vorlage itself. Returned
 * as data rather than executed so the rule is testable without a store, and
 * so Local Mode runs the identical path (invariant 4).
 */
export interface TemplateFromTripWrites {
  /** Names with no master item yet — created first, in this order. */
  newMasterItems: string[]
  groupUpdates: GroupUpdate[]
  newGroup: { name: string; positions: PositionDraft[] } | null
  template: {
    name: string
    /** Own positions: the local-only deviations, plus the loose rows unless bundled. */
    positions: PositionDraft[]
    /** Referenced, never copied — the point of the whole screen (FR-27.5). */
    includeGroupIds: string[]
  }
}

/**
 * planTemplateFromTrip turns the recognised composition plus the user's
 * answers into the exact set of writes M21 performs.
 *
 * The source trip appears nowhere in the result: M21 reads a trip and writes
 * templates, and an archived trip is a record (FR-27.5). Every recognised
 * group is referenced whether or not it deviated — membership is a fact of the
 * data, so there is no per-group opt-out to honour here.
 */
export function planTemplateFromTrip(input: WritePlanInput): TemplateFromTripWrites {
  const fold = masterFold(input.masterItems)

  const groupUpdates: GroupUpdate[] = []
  const ownPositions: PositionDraft[] = []
  for (const group of input.composition.groups) {
    if (group.added.length === 0) continue
    const choice = input.choices[group.group.id] ?? DEFAULT_DEVIATION_CHOICE
    const positions = group.added.map((row) => fold(row))
    if (choice === 'update') {
      groupUpdates.push({
        groupId: group.group.id,
        groupName: group.group.name,
        positions,
      })
    } else {
      ownPositions.push(...positions)
    }
  }

  const checked = new Set(input.checkedLooseIds)
  const loosePositions = input.composition.loose
    .filter((l) => checked.has(l.tripItem.id))
    .map((l) => fold(l.tripItem))

  // The toggle is inert without rows to bundle: a group named after a trip
  // that contributed nothing is clutter with a name, not a building block.
  const bundling = input.bundleName !== null && loosePositions.length > 0
  const newGroup = bundling ? { name: input.bundleName!, positions: loosePositions } : null
  if (!bundling) ownPositions.push(...loosePositions)

  return {
    newMasterItems: fold.created,
    groupUpdates,
    newGroup,
    template: {
      name: input.templateName,
      positions: ownPositions,
      includeGroupIds: input.composition.groups.map((g) => g.group.id),
    },
  }
}

/**
 * masterFold resolves a trip row to the master item the position will point
 * at, remembering the names it had to invent.
 *
 * Three sources, in falling order of certainty: the row's own
 * `source_item_id` (a generated row already knows its master item), an
 * FR-16.3-tolerant name match against the inventory, and finally a new master
 * item — the FR-9.2 mechanics. The invented names are deduped by the same
 * tolerant rule, so two rows spelled "Gimbal" and "gimbal" do not leave two
 * master items behind, which is the mess FR-16.3 exists to prevent.
 */
function masterFold(masterItems: MasterItem[]): ((row: TripItem) => PositionDraft) & {
  created: string[]
} {
  const created: string[] = []
  const fold = (row: TripItem): PositionDraft => {
    if (row.source_item_id) return { name: row.name, itemId: row.source_item_id }
    const [match] = findDuplicates([row.name], masterItems)
    if (match) return { name: match.existingName, itemId: match.existingId }
    const invented = created.find((n) => findDuplicates([row.name], [placeholder(n)]).length > 0)
    if (invented) return { name: invented, itemId: null }
    created.push(row.name)
    return { name: row.name, itemId: null }
  }
  return Object.assign(fold, { created })
}

/** A name-only stand-in, so an invented name reuses the FR-16.3 matcher. */
function placeholder(name: string): MasterItem {
  return { id: '', name, weight_grams: null, value_cents: null }
}
