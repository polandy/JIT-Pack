/**
 * M18 portable YAML import (FR-18.4/18.5) — pure parse/match layer, the
 * TS counterpart of internal/portable on the server.
 *
 * Client-side by decision: in Local Mode the portable export *is* the
 * backup (NFR-4.11), so restoring must work without a server, and the
 * FR-16.3-style merge prompts need user decisions before anything is
 * committed. Uses the `yaml` package (already a transitive Vite
 * dependency — zero added footprint).
 */

import { parse, parseAllDocuments, stringify } from 'yaml'

import { findDuplicates } from './spreadsheet'
import { includedTemplatesOf } from './templates'
import type {
  AppliedChange,
  AppliedChangeKind,
  ChangeDetail,
  ChangedField,
  Container,
  GeneratedPosition,
  ItemMode,
  MasterItem,
  Template,
  TemplateInclude,
  TemplateItem,
  TemplateKind,
  Traveler,
  Trip,
  TripStatus,
  TripItem,
  TripTemplateSource,
} from '@/types/domain'

/** The schema this app writes and fully understands (FR-18.5). */
export const PORTABLE_SCHEMA_VERSION = 1

/**
 * The media type a portable document is written with — YAML's registered one
 * (RFC 9512), not the historical `text/yaml`.
 */
export const PORTABLE_MEDIA_TYPE = 'application/yaml'

/**
 * What the import picker offers the user.
 *
 * Deliberately wider than what we write, and it has to be: a backup saved on
 * a phone comes back through the file manager typed as plain text or not typed
 * at all, and a filter narrower than that greys out the very file the screen
 * exists to read. It contains `PORTABLE_MEDIA_TYPE` by construction — the
 * writer and the picker drifting apart is the failure this constant prevents.
 */
export const PORTABLE_FILE_ACCEPT = [
  '.yaml',
  '.yml',
  '.txt',
  PORTABLE_MEDIA_TYPE,
  // Files written before the type moved to its registered one.
  'text/yaml',
  'text/plain',
].join(',')

export interface PortableTraveler {
  name: string
}

export interface PortableContainer {
  name: string
  carrier: string | null
  max_weight_grams: number | null
}

/** Legacy files carried string quantities — sometimes a formula. Numeric
 * strings keep their value, formula strings fold to 1 (FR-18.4 tolerance;
 * formulas retired with FR-1.3/1.5). */
function coerceQuantity(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.max(0, Math.floor(raw))
  if (typeof raw === 'string' && /^\d+$/.test(raw.trim())) return parseInt(raw.trim(), 10)
  return 1
}

export interface PortableItem {
  name: string
  /** FR-28.1/28.10: the master item's mark, absent as often as not. */
  icon: string | null
  quantity: number
  /** FR-27.7 preparation tasks of a template position. Empty on trip items. */
  tasks: string[]
  /**
   * FR-24.1/24.2: the master item's tags, *ordered* — the order is
   * `item_tags.position` and the first is the primary tag. Empty for a row
   * that has no master item, and for every file written before this existed.
   */
  tags: string[]
  /**
   * Whether this trip row resolves to an inventory item (FR-1.1), which is
   * what tells a restore to give the master item back rather than leave the
   * row ad-hoc. Without it the two are indistinguishable — both are a name —
   * and a restore either invents inventory the user never had or drops
   * inventory they did. Always true on a template, where every position is a
   * master item by definition.
   */
  from_inventory: boolean
  // Template fields
  assignment: 'per_person' | 'trip_global' | null
  dedup: 'max' | 'sum' | null
  conditions: Record<string, unknown> | null
  default_mode: string | null
  late_packer: boolean
  // Trip fields
  mode: string | null
  category: string | null
  traveler: string | null
  container: string | null
  packed_count: number | null
}

/**
 * One included group inside a Ferien-Vorlage document (FR-27.1, ADR-017).
 * Carried whole rather than by name: FR-18.2 promises a file that survives
 * the trip to another instance, where a bare reference means nothing.
 */
export interface PortableGroup {
  name: string
  /** FR-28.8/28.10: carried whole with the group, like its positions. */
  icon: string | null
  items: PortableItem[]
}

/**
 * One `trip_generated_positions` row (FR-27.4) in portable shape — the
 * snapshot of what generation last produced for one position.
 *
 * Named throughout rather than keyed by id, like the rest of the format: the
 * restore rebuilds every id, so what has to survive is the *identity* the
 * ledger is keyed on — the master item and the traveler — and the values that
 * decide whether a row is still the group's or has become the user's.
 */
export interface PortableGeneratedPosition {
  /** The master item this position resolves to; its name is the identity. */
  item: string
  /** The traveler it belongs to; absent = trip-global (FR-25.8). */
  traveler: string | null
  /** The template that contributed it — what the FR-27.4 log names. */
  source: string
  /** What generation produced, which may differ from the master item's name. */
  name: string
  quantity: number
  mode: ItemMode
  late_packer: boolean
  weight_grams: number | null
  value_cents: number | null
  category: string | null
  /** FR-27.7 preparation tasks as generation produced them. */
  tasks: string[]
}

/** One line of the FR-27.4 applied-changes log in portable shape. */
export interface PortableAppliedChange {
  /** The group's name — denormalised in the table too, for the same reason. */
  source: string
  kind: AppliedChangeKind
  item: string
  detail: ChangeDetail | null
  /** When the change landed on this trip, ISO-8601. */
  at: string
}

export interface PortableDocument {
  kind: 'template' | 'trip'
  schema_version: number
  name: string
  /**
   * FR-27.1: the template's own scope, distinct from `kind`, which says
   * whether the document is a template or a trip. Absent on trips and on
   * files written before scopes existed — those read back as `'template'`,
   * the same default migration 016 applies.
   */
  scope?: TemplateKind
  /** FR-28.8/28.10: the template's own mark. Always null on a trip. */
  icon: string | null
  /**
   * FR-2.1b: the trip's year. Absent in files written before it existed,
   * where the (then required) end date carries the same information —
   * `portableYear` resolves both cases.
   */
  year: number | null
  start_date: string | null
  end_date: string | null
  /**
   * FR-2.2: the trip's lifecycle state. Null on templates and on every trip
   * file written before this existed — the reader supplies `planning` there,
   * which is what those files have always produced.
   */
  status: TripStatus | null
  travelers: PortableTraveler[]
  containers: PortableContainer[]
  /** FR-27.1: the groups a Ferien-Vorlage composes. Empty on everything else. */
  includes: PortableGroup[]
  items: PortableItem[]
  /**
   * FR-27.4: the templates this trip follows (`trip_template_sources`).
   * Empty on templates, and on every trip file written before this existed —
   * which is the documented fallback rather than an error (see `fromRaw`).
   */
  follows: string[]
  /** FR-27.4: the ledger (`trip_generated_positions`). Empty on templates. */
  generated: PortableGeneratedPosition[]
  /** FR-27.4: the applied-changes log (`trip_applied_changes`). */
  applied_changes: PortableAppliedChange[]
}

export interface ParseResult {
  doc: PortableDocument | null
  error: string | null
  /** FR-18.5: file written by a newer app — import proceeds best-effort. */
  newerSchema: boolean
}

/**
 * The separator between two documents in one portable file.
 *
 * A backup (NFR-4.11) is every trip and every template of this device, and
 * that is more than one document. Multi-document YAML is the format's own
 * answer to it, so a backup file stays readable by anything that reads YAML
 * — and, more importantly, by our own importer: a backup nobody can restore
 * is not a backup.
 */
const DOCUMENT_SEPARATOR = '---'

/** joinDocuments writes serialized documents as one multi-document YAML file. */
export function joinDocuments(documents: string[]): string {
  if (documents.length === 0) return ''
  return documents.map((doc) => doc.trimEnd()).join(`\n${DOCUMENT_SEPARATOR}\n`) + '\n'
}

/**
 * parsePortableAll reads a file that may hold one document or many, in order.
 *
 * Each document is validated on its own: one unreadable entry is reported in
 * its place and the intact ones around it stay importable, because a restore
 * that gives up on the first bad document loses everything behind it.
 */
export function parsePortableAll(text: string): ParseResult[] {
  return parseAllDocuments(text)
    .filter((document) => document.contents !== null)
    .map((document) => fromRaw(document.toJS() as unknown))
}

export function parsePortable(text: string): ParseResult {
  let raw: unknown
  try {
    raw = parse(text)
  } catch (e) {
    return { doc: null, error: `not valid YAML: ${(e as Error).message}`, newerSchema: false }
  }
  return fromRaw(raw)
}

/** Validates one already-parsed document — the shared half of both parsers. */
function fromRaw(raw: unknown): ParseResult {
  if (typeof raw !== 'object' || raw === null) {
    return { doc: null, error: 'not a portable document', newerSchema: false }
  }
  const obj = raw as Record<string, unknown>

  const kind = obj['kind']
  if (kind !== 'template' && kind !== 'trip') {
    return { doc: null, error: `unknown kind ${JSON.stringify(kind ?? null)}`, newerSchema: false }
  }
  const name = typeof obj['name'] === 'string' ? obj['name'].trim() : ''
  if (name === '') {
    return { doc: null, error: 'document has no name', newerSchema: false }
  }
  const rawItems = Array.isArray(obj['items']) ? obj['items'] : []
  const items: PortableItem[] = []
  for (const entry of rawItems) {
    const item = toItem(entry)
    if (!item) {
      return { doc: null, error: 'an item entry has no name', newerSchema: false }
    }
    items.push(item)
  }

  const includes: PortableGroup[] = []
  const rawIncludes = Array.isArray(obj['includes']) ? obj['includes'] : []
  for (const entry of rawIncludes) {
    if (typeof entry !== 'object' || entry === null) {
      return { doc: null, error: 'an included group is not a group', newerSchema: false }
    }
    const g = entry as Record<string, unknown>
    const groupName = typeof g['name'] === 'string' ? g['name'].trim() : ''
    if (groupName === '') {
      // The name is a group's whole identity across instances (ADR-017):
      // without one there is nothing to link to and nothing to create.
      return { doc: null, error: 'an included group has no name', newerSchema: false }
    }
    const groupItems: PortableItem[] = []
    for (const raw of Array.isArray(g['items']) ? g['items'] : []) {
      const item = toItem(raw)
      if (!item) {
        return { doc: null, error: 'an item entry has no name', newerSchema: false }
      }
      groupItems.push(item)
    }
    includes.push({ name: groupName, icon: str(g['icon']), items: groupItems })
  }

  const rawScope = obj['scope']
  if (rawScope !== undefined && rawScope !== 'group' && rawScope !== 'template') {
    return { doc: null, error: `unknown scope ${JSON.stringify(rawScope)}`, newerSchema: false }
  }
  const scope: TemplateKind = rawScope === 'group' ? 'group' : 'template'

  if (includes.length > 0) {
    // Two structural rules of FR-27.1, enforced at the file boundary: only a
    // Ferien-Vorlage composes, and a trip is the *result* of a composition
    // rather than one.
    if (kind !== 'template') {
      return { doc: null, error: 'includes are only valid on a template', newerSchema: false }
    }
    if (scope === 'group') {
      return { doc: null, error: 'a group cannot have includes', newerSchema: false }
    }
  }

  const schemaVersion = typeof obj['schema_version'] === 'number' ? obj['schema_version'] : 1
  return {
    doc: {
      kind,
      schema_version: schemaVersion,
      name,
      ...(kind === 'template' ? { scope } : {}),
      icon: str(obj['icon']),
      start_date: str(obj['start_date']),
      year: num(obj['year']),
      end_date: str(obj['end_date']),
      travelers: toTravelers(obj['travelers']),
      containers: toContainers(obj['containers']),
      includes,
      items,
      status: toTripStatus(obj['status']),
      follows: toFollows(obj['follows']),
      generated: toGeneratedPositions(obj['generated']),
      applied_changes: toAppliedChanges(obj['applied_changes']),
    },
    error: null,
    newerSchema: schemaVersion > PORTABLE_SCHEMA_VERSION,
  }
}

// --- Matching (FR-18.4, reusing the M15 dedup machinery) ---

export interface PortableMatch {
  name: string
  state: 'new' | 'matched' | 'near'
  existingId: string | null
  existingName: string | null
}

export function matchPortableItems(doc: PortableDocument, existing: MasterItem[]): PortableMatch[] {
  const matches = new Map(
    findDuplicates(
      doc.items.map((i) => i.name),
      existing,
    ).map((m) => [m.imported, m]),
  )
  return doc.items.map((item) => {
    const match = matches.get(item.name)
    if (!match) return { name: item.name, state: 'new', existingId: null, existingName: null }
    return {
      name: item.name,
      state: match.exact ? 'matched' : 'near',
      existingId: match.existingId,
      existingName: match.existingName,
    }
  })
}

// --- Serialization (FR-18.2/18.3) ---
//
// The client writes the same shape as the server's internal/portable —
// field names, omit-empty semantics, and by-name ordering all match, so
// a file exported here imports there and vice versa. In Local Mode this
// serializer *is* the backup path (NFR-4.11): there is no server to ask.

/** One group a Ferien-Vorlage includes, with everything the file needs of it. */
export interface TemplateComposition {
  /** FR-27.7: the tasks of a position, by position id. Defaults to none. */
  tasks?: (templateItemId: string) => string[]
  /** FR-27.1: the included groups, each with its own positions and tasks. */
  includes?: {
    template: Template
    items: TemplateItem[]
    tasks?: (templateItemId: string) => string[]
  }[]
}

/**
 * compositionFrom assembles what a template's file needs beyond its own
 * positions: its groups (FR-27.1) and every position's preparation tasks
 * (FR-27.7).
 *
 * It exists so the three places that export a template — M7's row action,
 * the settings export and the NFR-4.11 backup — cannot disagree about what
 * a file contains. A group passes no includes and gets none.
 */
export function compositionFrom(
  template: Template,
  source: {
    includes: TemplateInclude[]
    templates: Template[]
    itemsOf: (templateId: string) => TemplateItem[]
    tasksOf: (templateItemId: string) => string[]
  },
): TemplateComposition {
  const groups =
    template.kind === 'group'
      ? []
      : includedTemplatesOf(template.id, source.templates, source.includes)
  return {
    tasks: source.tasksOf,
    includes: groups.map((group) => ({
      template: group,
      items: source.itemsOf(group.id),
      tasks: source.tasksOf,
    })),
  }
}

/**
 * serializeTemplate writes an owned template as environment-agnostic YAML
 * (FR-18.2), including its composition (FR-27.1) and preparation tasks
 * (FR-27.7).
 *
 * The groups travel *whole* rather than by name — see ADR-017. Name-ordered
 * throughout, so exporting the same template twice yields the same file and a
 * diff between two exports is a diff of the content.
 */
export function serializeTemplate(
  template: Template,
  templateItems: TemplateItem[],
  masterItem: (id: string) => MasterItem | undefined,
  composition: TemplateComposition = {},
  /** FR-24.1: the master item's tags in position order (required, see serializeTrip). */
  tagsOf: (itemId: string) => string[],
): string {
  const positions = (items: TemplateItem[], tasksOf?: (id: string) => string[]) =>
    items
      .map((ti) => {
        const master = masterItem(ti.item_id)
        const tasks = tasksOf?.(ti.id) ?? []
        const tags = tagsOf(ti.item_id)
        return {
          name: master?.name ?? 'Unknown item',
          ...(master?.icon ? { icon: master.icon } : {}),
          ...(tags.length > 0 ? { tags } : {}),
          quantity: ti.quantity,
          assignment: ti.assignment,
          ...(ti.conditions ? { conditions: ti.conditions } : {}),
          default_mode: ti.default_mode,
          ...(ti.late_packer ? { late_packer: true } : {}),
          dedup: ti.dedup,
          ...(tasks.length > 0 ? { tasks } : {}),
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name))

  const includes = (composition.includes ?? [])
    .map((group) => ({
      name: group.template.name,
      ...(group.template.icon ? { icon: group.template.icon } : {}),
      items: positions(group.items, group.tasks),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return stringify({
    kind: 'template',
    schema_version: PORTABLE_SCHEMA_VERSION,
    name: template.name,
    scope: template.kind,
    ...(template.icon ? { icon: template.icon } : {}),
    // Omitted rather than empty: a group has no composition, and an empty key
    // in every group's file would invite the reader to wonder what it means.
    ...(includes.length > 0 ? { includes } : {}),
    items: positions(templateItems, composition.tasks),
  })
}

/**
 * Everything a trip's file needs of the FR-27.4 refresh state, with the two
 * resolvers that turn its ids into the names a portable file carries.
 *
 * Without these three sections a restored device re-asks proposals the user
 * already answered and resurrects positions they deleted: the ledger is what
 * tells "the group changed this" from "the user changed this", and it is
 * keyed on ids that the restore rebuilds from scratch.
 */
export interface TripRefreshState {
  sources: TripTemplateSource[]
  generated: GeneratedPosition[]
  appliedChanges: AppliedChange[]
  /** Template name by id — a source that cannot be named cannot be restored. */
  templateName: (id: string) => string | undefined
  /** Master item name by id — the other half of a ledger entry's identity. */
  masterItemName: (id: string) => string | undefined
}

/** serializeTrip writes a trip's packing list, clean or with progress (FR-18.3). */
export function serializeTrip(args: {
  trip: Trip
  items: TripItem[]
  travelers: Traveler[]
  containers: Container[]
  includeProgress: boolean
  /** FR-27.4. Omitted by a plain single-trip export; the backup passes it. */
  refresh?: TripRefreshState
  /**
   * The master item a row resolves to. Without it a row that came from the
   * inventory is indistinguishable from one the user typed, and a restore
   * cannot give either back correctly.
   *
   * Required rather than optional, and deliberately: an optional resolver is
   * one a caller can forget, and a file written without it looks complete and
   * restores incomplete — invisible until somebody needs the backup. The
   * compiler is what catches that; no test can watch every future call site.
   */
  masterItem: (id: string) => MasterItem | undefined
  /** FR-24.1: that master item's tags, in position order. */
  tagsOf: (itemId: string) => string[]
}): string {
  const travelerNames = new Map(args.travelers.map((t) => [t.id, t.name]))
  const containerNames = new Map(args.containers.map((c) => [c.id, c.name]))

  const travelers = [...args.travelers]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((t) => ({ name: t.name }))

  const containers = [...args.containers]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => ({
      name: c.name,
      ...(c.carrier_traveler_id ? { carrier: travelerNames.get(c.carrier_traveler_id) } : {}),
      ...(c.max_weight_grams ? { max_weight_grams: c.max_weight_grams } : {}),
    }))

  const items = [...args.items]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((item) => {
      // A row's mark and tags belong to its master item, not to the row: the
      // trip table holds neither, and the restore needs both to give the
      // inventory entry back rather than leave an ad-hoc row behind.
      const master = item.source_item_id ? args.masterItem(item.source_item_id) : undefined
      const tags = item.source_item_id ? args.tagsOf(item.source_item_id) : []
      return {
        name: item.name,
        quantity: item.quantity,
        mode: item.mode,
        ...(item.source_item_id ? { from_inventory: true } : {}),
        ...(master?.icon ? { icon: master.icon } : {}),
        ...(tags.length > 0 ? { tags } : {}),
        ...(item.category_name ? { category: item.category_name } : {}),
        ...(item.assigned_traveler_id
          ? { traveler: travelerNames.get(item.assigned_traveler_id) }
          : {}),
        ...(item.container_id ? { container: containerNames.get(item.container_id) } : {}),
        ...(args.includeProgress ? { packed_count: item.packed_count } : {}),
        ...(item.late_packer ? { late_packer: true } : {}),
      }
    })

  const refresh = args.refresh
  const follows = [
    ...new Set(
      (refresh?.sources ?? [])
        .map((source) => refresh?.templateName(source.template_id))
        .filter((name): name is string => name !== undefined && name !== ''),
    ),
  ].sort((a, b) => a.localeCompare(b))

  // An entry whose master item, template or traveler no longer has a name is
  // dropped rather than written half-resolved: restored against the wrong
  // identity it would detach a position nobody asked to detach, which is the
  // exact failure these sections exist to prevent.
  const generated = (refresh?.generated ?? [])
    .flatMap((entry) => {
      const item = refresh?.masterItemName(entry.source_item_id)
      const source = refresh?.templateName(entry.source_template_id)
      const traveler = entry.traveler_id === '' ? null : travelerNames.get(entry.traveler_id)
      if (!item || !source || traveler === undefined) return []
      return [
        {
          item,
          ...(traveler ? { traveler } : {}),
          source,
          name: entry.name,
          quantity: entry.quantity,
          mode: entry.mode,
          ...(entry.late_packer ? { late_packer: true } : {}),
          ...(entry.weight_grams !== null ? { weight_grams: entry.weight_grams } : {}),
          ...(entry.value_cents !== null ? { value_cents: entry.value_cents } : {}),
          ...(entry.category_name ? { category: entry.category_name } : {}),
          ...(entry.tasks.length > 0 ? { tasks: entry.tasks } : {}),
        },
      ]
    })
    .sort((a, b) => a.item.localeCompare(b.item) || a.name.localeCompare(b.name))

  // Oldest first, the order the log was written in — M2 reverses it for
  // reading. The name travels denormalised exactly as it is stored: the
  // record of what a group did must outlive the group.
  const appliedChanges = [...(refresh?.appliedChanges ?? [])]
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
    .map((change) => ({
      source: change.source_template_name,
      kind: change.kind,
      item: change.item_name,
      ...(change.detail ? { detail: change.detail } : {}),
      at: change.created_at,
    }))

  return stringify({
    kind: 'trip',
    schema_version: PORTABLE_SCHEMA_VERSION,
    name: args.trip.name,
    // FR-2.1b: the year always travels, the dates only when they exist —
    // an exported file must not invent a date the trip never had.
    year: args.trip.year,
    ...(args.trip.start_date ? { start_date: args.trip.start_date } : {}),
    ...(args.trip.end_date ? { end_date: args.trip.end_date } : {}),
    // FR-2.2: written unconditionally, unlike the dates — a trip always has a
    // status, and the file that omits it is the one written before this
    // existed. See ADR-024 for what that costs a *shared* file.
    status: args.trip.status,
    ...(travelers.length > 0 ? { travelers } : {}),
    ...(containers.length > 0 ? { containers } : {}),
    items,
    // FR-27.4, omitted rather than empty: a trip that follows nothing has no
    // refresh state, and empty keys in every file invite the reader to wonder.
    ...(follows.length > 0 ? { follows } : {}),
    ...(generated.length > 0 ? { generated } : {}),
    ...(appliedChanges.length > 0 ? { applied_changes: appliedChanges } : {}),
  })
}

// --- Field coercion (unknown fields are ignored by construction, FR-18.5) ---

function str(v: unknown): string | null {
  return typeof v === 'string' && v !== '' ? v : null
}

/** A plausible year, or null — a garbage value must not become one. */
function num(v: unknown): number | null {
  const parsed = typeof v === 'number' ? v : Number(v)
  return Number.isInteger(parsed) && parsed >= 1900 && parsed <= 2200 ? parsed : null
}

/**
 * The document's trip status, or null when it declares none.
 *
 * A value this build does not know is dropped rather than carried: the
 * schema's CHECK would refuse it, and a push that fails a constraint parks the
 * whole mutation and reports a database error where a file problem happened.
 * Null then means the same as absent, and the importer supplies `planning` —
 * which is what every file written before this field existed produces.
 */
function toTripStatus(v: unknown): TripStatus | null {
  return v === 'planning' || v === 'active' || v === 'archived' ? v : null
}

function toItem(entry: unknown): PortableItem | null {
  if (typeof entry !== 'object' || entry === null) return null
  const o = entry as Record<string, unknown>
  const name = typeof o['name'] === 'string' ? o['name'].trim() : ''
  if (name === '') return null
  return {
    name,
    icon: str(o['icon']),
    quantity: coerceQuantity(o['quantity']),
    // Strings only: a task list that quietly swallowed a number would read
    // back as "1" and claim the user wrote it.
    tasks: Array.isArray(o['tasks'])
      ? o['tasks'].filter((t): t is string => typeof t === 'string')
      : [],
    assignment:
      o['assignment'] === 'per_person' || o['assignment'] === 'trip_global'
        ? o['assignment']
        : null,
    dedup: o['dedup'] === 'sum' || o['dedup'] === 'max' ? o['dedup'] : null,
    conditions:
      typeof o['conditions'] === 'object' && o['conditions'] !== null
        ? (o['conditions'] as Record<string, unknown>)
        : null,
    default_mode: str(o['default_mode']),
    late_packer: o['late_packer'] === true,
    mode: str(o['mode']),
    category: str(o['category']),
    traveler: str(o['traveler']),
    container: str(o['container']),
    packed_count: typeof o['packed_count'] === 'number' ? o['packed_count'] : null,
    // Strings only, for the reason the task list is: a number here would read
    // back as a tag named "1" and claim the user filed it that way.
    tags: Array.isArray(o['tags'])
      ? o['tags'].filter((t): t is string => typeof t === 'string' && t.trim() !== '')
      : [],
    from_inventory: o['from_inventory'] === true,
  }
}

function toTravelers(v: unknown): PortableTraveler[] {
  if (!Array.isArray(v)) return []
  const out: PortableTraveler[] = []
  for (const entry of v) {
    const o = entry as Record<string, unknown>
    const name = typeof o?.['name'] === 'string' ? o['name'].trim() : ''
    if (name === '') continue
    // A pre-FR-25.9 document carries `profile`; it is dropped, not an error.
    out.push({ name })
  }
  return out
}

function toContainers(v: unknown): PortableContainer[] {
  if (!Array.isArray(v)) return []
  const out: PortableContainer[] = []
  for (const entry of v) {
    const o = entry as Record<string, unknown>
    const name = typeof o?.['name'] === 'string' ? o['name'].trim() : ''
    if (name === '') continue
    out.push({
      name,
      carrier: str(o['carrier']),
      max_weight_grams: typeof o['max_weight_grams'] === 'number' ? o['max_weight_grams'] : null,
    })
  }
  return out
}

// --- FR-27.4 sections ---
//
// All three are *tolerant*: an absent section reads as empty and a malformed
// entry is dropped, where a malformed item aborts the document. The asymmetry
// is deliberate and is the documented fallback for a file written before these
// sections existed (ADR-015): the items are the user's data, while these three
// are bookkeeping about how the trip follows its groups. Losing a trip because
// one ledger line is unreadable would trade the valuable half for the cheap
// one — the refresh re-derives what it cannot read here.

function toFollows(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  const out: string[] = []
  for (const entry of v) {
    const name = typeof entry === 'string' ? entry.trim() : ''
    if (name !== '' && !out.includes(name)) out.push(name)
  }
  return out
}

function toMode(v: unknown): ItemMode {
  return v === 'buy_before' || v === 'buy_local' ? v : 'pack'
}

function toGeneratedPositions(v: unknown): PortableGeneratedPosition[] {
  if (!Array.isArray(v)) return []
  const out: PortableGeneratedPosition[] = []
  for (const entry of v) {
    if (typeof entry !== 'object' || entry === null) continue
    const o = entry as Record<string, unknown>
    const item = typeof o['item'] === 'string' ? o['item'].trim() : ''
    const source = typeof o['source'] === 'string' ? o['source'].trim() : ''
    // Both are references the restore has to resolve to an id. An entry
    // missing either cannot be placed, and a placed-wrong ledger entry
    // detaches a position nobody asked to detach.
    if (item === '' || source === '') continue
    const name = typeof o['name'] === 'string' && o['name'].trim() !== '' ? o['name'].trim() : item
    out.push({
      item,
      traveler: str(o['traveler']),
      source,
      name,
      quantity: coerceQuantity(o['quantity']),
      mode: toMode(o['mode']),
      late_packer: o['late_packer'] === true,
      weight_grams: typeof o['weight_grams'] === 'number' ? o['weight_grams'] : null,
      value_cents: typeof o['value_cents'] === 'number' ? o['value_cents'] : null,
      category: str(o['category']),
      tasks: Array.isArray(o['tasks'])
        ? o['tasks'].filter((t): t is string => typeof t === 'string')
        : [],
    })
  }
  return out
}

const CHANGED_FIELDS: readonly ChangedField[] = [
  'quantity',
  'mode',
  'name',
  'late_packer',
  'weight_grams',
  'value_cents',
  'category_name',
  'tasks',
]

function toChangeDetail(v: unknown): ChangeDetail | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  const field = CHANGED_FIELDS.find((f) => f === o['field'])
  if (!field) return null
  const value = (raw: unknown): ChangeDetail['from'] =>
    typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean' ? raw : null
  return { field, from: value(o['from']), to: value(o['to']) }
}

function toAppliedChanges(v: unknown): PortableAppliedChange[] {
  if (!Array.isArray(v)) return []
  const out: PortableAppliedChange[] = []
  for (const entry of v) {
    if (typeof entry !== 'object' || entry === null) continue
    const o = entry as Record<string, unknown>
    const kind = o['kind']
    if (kind !== 'added' && kind !== 'removed' && kind !== 'changed') continue
    const source = typeof o['source'] === 'string' ? o['source'].trim() : ''
    const item = typeof o['item'] === 'string' ? o['item'].trim() : ''
    if (source === '' || item === '') continue
    out.push({
      source,
      kind,
      item,
      detail: toChangeDetail(o['detail']),
      // A log line with no timestamp would sort to the top of M2's list and
      // claim to be the newest thing that happened.
      at: str(o['at']) ?? '',
    })
  }
  return out.filter((entry) => entry.at !== '')
}

/**
 * The year to give an imported trip (FR-2.1b): the document's own field,
 * else the year inside either date, else the year of the import — the
 * honest answer when the file states nothing at all.
 */
export function portableYear(
  doc: Pick<PortableDocument, 'year' | 'end_date' | 'start_date'>,
): number {
  const stated = doc.year ?? undefined
  if (stated && stated >= 1900 && stated <= 2200) return stated
  for (const date of [doc.end_date, doc.start_date]) {
    const parsed = date ? Number(date.slice(0, 4)) : NaN
    if (parsed >= 1900 && parsed <= 2200) return parsed
  }
  return new Date().getFullYear()
}
