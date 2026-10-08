/**
 * The activity log's reading (FR-32.2): what a recorded write *means*, and
 * how a run of them is folded into one line.
 *
 * The server records a write as it happened — a table, a row, each field's
 * before and after (FR-32.1). Whether that was a pack, a purchase or a task
 * ticked off is a rule about the trip's rows, and those rules live here
 * (invariant 4), beside the ones that write them. A feature module's rows
 * are the exception: the module reads them itself and hands the reading in
 * (`domain/shared/activityReader.ts`), so this file knows no module's columns.
 *
 * Some writes are bookkeeping nobody made on purpose — a claim taken while a
 * row is open (G-3), the generation's record of what it produced — and read
 * as nothing: {@link classifyActivity} answers null for them.
 */
import { ACTIVITY_OP, type ActivityEntry } from '@/api/types'
import {
  changedField as changed,
  truthy,
  valueAfter as after,
  valueBefore as before,
  type ActivityArea,
  type ActivityKind,
  type ActivityReaders,
} from './shared/activityReader'
import { TABLE, type SyncTable } from '@/api/tables'
import {
  STATE_PACKED,
  STATE_PACKING_NOW,
  STATE_SKIPPED,
  type ItemState,
  type ItemTodo,
  type MasterItem,
  type NoteAck,
  type Tag,
  type TodoState,
  type TripItem,
} from '@/types/domain'

export type { ActivityArea, ActivityKind } from './shared/activityReader'

const STATE_PARTIAL = 'partial' as const satisfies ItemState
const TASK_RESOLVED = 'resolved' as const satisfies TodoState

/**
 * The columns the rules below read, each checked against the row type it
 * belongs to — a renamed column fails to compile here rather than turning a
 * pack into a „changed".
 */
const FIELD = {
  state: 'state' satisfies keyof TripItem,
  packedCount: 'packed_count' satisfies keyof TripItem,
  packingNowBy: 'packing_now_by' satisfies keyof TripItem,
  packingNowAt: 'packing_now_at' satisfies keyof TripItem,
  boughtFrom: 'bought_from' satisfies keyof TripItem,
  boughtAt: 'bought_at' satisfies keyof TripItem,
  boughtBy: 'bought_by_user_id' satisfies keyof TripItem,
  packedBy: 'packed_by_user_id' satisfies keyof TripItem,
  packedAt: 'packed_at' satisfies keyof TripItem,
  shoppingPosition: 'shopping_position' satisfies keyof TripItem,
  taskState: 'task_state' satisfies keyof ItemTodo,
  resolvedAt: 'resolved_at' satisfies keyof ItemTodo,
  resolvedBy: 'resolved_by_user_id' satisfies keyof ItemTodo,
  position: 'position' satisfies keyof ItemTodo,
  // A wire column the client folds into which list a comment sits in; no
  // row type carries it.
  isTask: 'is_task',
  acked: 'acked' satisfies keyof NoteAck,
  seenThrough: 'seen_through' satisfies keyof NoteAck,
  sortOrder: 'sort_order' satisfies keyof Tag,
  retiredAt: 'retired_at' satisfies keyof MasterItem,
} as const

/** Moving a row among its siblings, and nothing else. */
const ORDER_FIELDS: ReadonlySet<string> = new Set([
  FIELD.sortOrder,
  FIELD.position,
  FIELD.shoppingPosition,
])

/** The G-3 claim: set while a row is open on somebody's screen, and cleared again. */
const CLAIM_FIELDS: ReadonlySet<string> = new Set([
  FIELD.state,
  FIELD.packingNowBy,
  FIELD.packingNowAt,
])

/** The records a purchase or a pack stamps beside the fact itself. */
const RECORD_FIELDS: ReadonlySet<string> = new Set([
  FIELD.boughtAt,
  FIELD.boughtBy,
  FIELD.packedBy,
  FIELD.packedAt,
  FIELD.packedCount,
  FIELD.resolvedAt,
  FIELD.resolvedBy,
])

/**
 * What an act's own word already says — a „changed" line naming them would
 * repeat its kind, and `is_task` is which list a comment is in, not a change.
 */
export const SAID_BY_KIND: ReadonlySet<string> = new Set([
  FIELD.state,
  FIELD.packedCount,
  FIELD.taskState,
  FIELD.isTask,
])

/** Written by generation and the planning refresh, never by a person's intent. */
const BOOKKEEPING: ReadonlySet<SyncTable> = new Set([
  TABLE.tripGeneratedPositions,
  TABLE.tripTemplateSources,
  TABLE.tripAppliedChanges,
])

/**
 * Where a write to a kernel table happened. A feature module's tables are
 * not here: their reader says (`domain/shared/activityReader.ts`).
 */
export const KERNEL_ACTIVITY_AREAS: Partial<Record<SyncTable, ActivityArea>> = {
  [TABLE.tripItems]: 'packing',
  [TABLE.containers]: 'luggage',
  [TABLE.travelers]: 'travellers',
  [TABLE.comments]: 'notes',
  [TABLE.noteAcks]: 'notes',
  [TABLE.excursions]: 'excursions',
  [TABLE.excursionItems]: 'excursions',
  [TABLE.excursionTravelers]: 'excursions',
  [TABLE.excursionTracks]: 'excursions',
  [TABLE.trips]: 'trip',
  [TABLE.tripMembers]: 'members',
  [TABLE.tripTemplateSources]: 'trip',
  [TABLE.tripGeneratedPositions]: 'trip',
  [TABLE.tripAppliedChanges]: 'trip',
  [TABLE.items]: 'inventory',
  [TABLE.itemTags]: 'inventory',
  [TABLE.itemDependencies]: 'inventory',
  [TABLE.tags]: 'tags',
  [TABLE.taskTags]: 'tags',
  [TABLE.templates]: 'templates',
  [TABLE.templateItems]: 'templates',
  [TABLE.templateIncludes]: 'templates',
  [TABLE.templateItemTasks]: 'templates',
  [TABLE.templateTasks]: 'templates',
  [TABLE.tripSeries]: 'series',
  [TABLE.destinationProfiles]: 'series',
  [TABLE.destinationChecklistItems]: 'series',
}

/** What the reader knows that the entry does not say. */
export interface ActivityContext {
  /** The feature modules' readers of their own tables, bound by `App.vue`. */
  readers?: ActivityReaders
  /**
   * Whether a comment the trip still holds is a task. An edit to a task's
   * words carries no `is_task`, and without this it would read as a note.
   */
  isTask?(commentId: string): boolean | undefined
}

/** One field a „changed" line names, before and after. */
export interface FieldChange {
  field: string
  before: unknown
  after: unknown
}

/** One entry, read. */
export interface ActivityLine {
  entry: ActivityEntry
  kind: ActivityKind
  area: ActivityArea
  /** What a „changed" line changed; empty for every other kind. */
  details: FieldChange[]
}

function changedFields(entry: ActivityEntry): string[] {
  return Object.keys(entry.changes ?? {})
}

function onlyWithin(fields: string[], allowed: ReadonlySet<string>): boolean {
  return fields.length > 0 && fields.every((f) => allowed.has(f))
}

const PACKED_STATES: readonly unknown[] = [STATE_PACKED, STATE_PARTIAL]

/** A packing row's state change, or null when the write was a claim alone. */
function packingKind(entry: ActivityEntry, fields: string[]): ActivityKind | null | undefined {
  if (changed(entry, FIELD.boughtFrom))
    return after(entry, FIELD.boughtFrom) ? 'bought' : 'unbought'
  if (changed(entry, FIELD.boughtAt) && entry.entity_table === TABLE.excursionItems) {
    return after(entry, FIELD.boughtAt) ? 'bought' : 'unbought'
  }
  if (!changed(entry, FIELD.state)) return undefined
  const next = after(entry, FIELD.state)
  const prev = before(entry, FIELD.state)
  if (PACKED_STATES.includes(next)) return 'packed'
  if (next === STATE_SKIPPED) return 'skipped'
  const claimOnly = onlyWithin(fields, CLAIM_FIELDS)
  if (next === STATE_PACKING_NOW || prev === STATE_PACKING_NOW) return claimOnly ? null : undefined
  if (PACKED_STATES.includes(prev) || prev === STATE_SKIPPED) return 'unpacked'
  return undefined
}

function updateKind(entry: ActivityEntry): ActivityKind | null {
  const fields = changedFields(entry)
  if (onlyWithin(fields, ORDER_FIELDS)) return 'reordered'
  if (changed(entry, FIELD.retiredAt)) return after(entry, FIELD.retiredAt) ? 'retired' : 'restored'
  switch (entry.entity_table) {
    case TABLE.tripItems:
    case TABLE.excursionItems: {
      const kind = packingKind(entry, fields)
      if (kind !== undefined) return kind
      break
    }
    case TABLE.comments:
      if (changed(entry, FIELD.taskState)) {
        return after(entry, FIELD.taskState) === TASK_RESOLVED ? 'done' : 'reopened'
      }
      break
    case TABLE.noteAcks:
      return changed(entry, FIELD.acked) && !truthy(after(entry, FIELD.acked)) ? 'unread' : 'read'
  }
  return 'changed'
}

/**
 * What one write did, or null for a write that is bookkeeping and not an act.
 * A feature module's reader is asked first; what it leaves undecided reads
 * the way every row does.
 */
export function classifyActivity(
  entry: ActivityEntry,
  readers: ActivityReaders = {},
): ActivityKind | null {
  const table = entry.entity_table as SyncTable
  if (BOOKKEEPING.has(table)) return null
  const own = readers[table]?.classify?.(entry)
  if (own !== undefined) return own
  switch (entry.op) {
    case ACTIVITY_OP.insert:
      if (table === TABLE.noteAcks) return truthy(after(entry, FIELD.acked)) ? 'read' : null
      return 'added'
    case ACTIVITY_OP.delete:
      return 'removed'
    default:
      return updateKind(entry)
  }
}

/** Where one write happened. */
export function activityArea(
  entry: ActivityEntry,
  kind: ActivityKind,
  ctx: ActivityContext = {},
): ActivityArea {
  const table = entry.entity_table as SyncTable
  if (table === TABLE.tripItems && (kind === 'bought' || kind === 'unbought')) return 'shopping'
  if (table === TABLE.comments) {
    const known = changed(entry, FIELD.isTask)
      ? truthy(entry.changes?.[FIELD.isTask]?.[entry.op === ACTIVITY_OP.delete ? 0 : 1])
      : ctx.isTask?.(entry.entity_id)
    if (known || changed(entry, FIELD.taskState)) return 'tasks'
  }
  return ctx.readers?.[table]?.area ?? KERNEL_ACTIVITY_AREAS[table] ?? 'trip'
}

/**
 * The fields a „changed" line names. Only what a person set and can read —
 * an id says nothing, and a record stamped beside the change repeats it.
 */
export function changeDetails(entry: ActivityEntry, shown: ReadonlySet<string>): FieldChange[] {
  return changedFields(entry)
    .filter((f) => shown.has(f) && !RECORD_FIELDS.has(f))
    .map((field) => ({ field, before: before(entry, field), after: after(entry, field) }))
}

/** Every entry read, the bookkeeping left out; `shown` is what a „changed" may name. */
export function readActivity(
  entries: readonly ActivityEntry[],
  shown: ReadonlySet<string>,
  ctx: ActivityContext = {},
): ActivityLine[] {
  const out: ActivityLine[] = []
  for (const entry of entries) {
    const kind = classifyActivity(entry, ctx.readers)
    if (kind === null) continue
    out.push({
      entry,
      kind,
      area: activityArea(entry, kind, ctx),
      details: kind === 'changed' ? changeDetails(entry, shown) : [],
    })
  }
  return out
}

/** A run of lines one person made of one kind, in one place, on one day. */
export interface ActivityGroup {
  /** Stable across a re-read: the newest entry's id. */
  key: string
  actor: string
  kind: ActivityKind
  area: ActivityArea
  /** Newest first, as the log reads. */
  lines: ActivityLine[]
}

/** One day's groups, newest first. */
export interface ActivityDay {
  day: string
  groups: ActivityGroup[]
}

/**
 * Folds the lines into days, and each day's consecutive lines by the same
 * person of the same kind in the same place into one group (FR-32.2) —
 * packing twelve things is one thing to read, not twelve. Only *consecutive*
 * lines fold: a run somebody else interrupted is two runs, because the order
 * is what the log is for.
 *
 * `dayOf` names an entry's day in the reader's own calendar; the caller owns
 * the time zone so this stays a pure function.
 */
export function groupActivity(
  lines: readonly ActivityLine[],
  dayOf: (iso: string) => string,
): ActivityDay[] {
  const days: ActivityDay[] = []
  for (const line of lines) {
    const day = dayOf(line.entry.created_at)
    let current = days.at(-1)
    if (current?.day !== day) {
      current = { day, groups: [] }
      days.push(current)
    }
    const last = current.groups.at(-1)
    const folds =
      last !== undefined &&
      last.actor === line.entry.actor_user_id &&
      last.kind === line.kind &&
      last.area === line.area &&
      // A „changed" line says what changed; two of them read as one only
      // when there is nothing to tell apart.
      (line.kind !== 'changed' ||
        (line.details.length === 0 && last.lines[0]!.details.length === 0))
    if (folds) {
      last.lines.push(line)
    } else {
      current.groups.push({
        key: String(line.entry.id),
        actor: line.entry.actor_user_id,
        kind: line.kind,
        area: line.area,
        lines: [line],
      })
    }
  }
  return days
}
